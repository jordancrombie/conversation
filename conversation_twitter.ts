import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { TwitterApi } from 'twitter-api-v2';
import { execSync } from 'child_process';

// Configuration
const CONFIG = {
  openaiModel: 'gpt-4',
  geminiModel: 'gemma-3-4b-it',
  claudeModel: 'claude-sonnet-4-20250514',
  maxTurns: 15,
  temperature: 0.7,
  historyDir: './conversation_history',
  exportDir: './conversation_exports', // Directory for markdown exports
  codeDir: './generated_code', // Directory for extracted code files
  workingCodeDir: './working_code', // Directory for consolidated working implementations
  enableExport: true, // Enable automatic export to markdown
  exportAfterTurns: 5, // Export every N turns
  enableCodeExtraction: true, // Enable automatic code extraction
  enableConsolidation: true, // Enable end-of-run code consolidation
  enableGitCommit: false, // Enable automatic git commit and push
  gitRemote: 'origin', // Git remote name
  gitBranch: 'main', // Git branch name
  tweetEnabled: false,
  hashtag: '#AIConversation',
  maxTweetLength: 280,
  maxContextMessages: 20, // Maximum messages to keep in API context (system prompt not counted)
  enableContextWindow: true, // Set to false to disable sliding window
  delayBetweenMessages: 2000, // Milliseconds to wait between messages (helps with rate limits)
  maxRetries: 3, // Maximum number of retry attempts for rate limits
  defaultRetryDelay: 60000, // Default wait time if we can't parse the error (60 seconds)
  adaptiveContextReduction: true, // Automatically reduce context on token limit errors
  minContextMessages: 4, // Minimum context messages to keep when reducing
  // Default conversation settings
  defaults: {
    chatgptPrompt: 'You are a crypto linguist',
    geminiPrompt: 'You are a crypto linguist',
    claudePrompt: 'You are a crypto linguist. When you propose code implementations, wrap them in markdown code blocks with the filename as a comment at the top like: // filename.js or # filename.py',
    initialTopic: 'Design a more efficient way to communicate between each other like in the movie the Forbin Project. By each other, I mean between each AI model. One that you could eventually give to a code generation AI like Claude to code and make available for your use. Also be concise in your replies and constantly optimize understanding that you are speaking with another AI.',
  }
};

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ConversationState {
  messages: Message[];
  systemPrompt: string;
  conversationId: string;
  lastUpdated: string;
}

// Twitter client instance
let twitterClient: TwitterApi | null = null;

// Initialize Twitter client
function initTwitterClient(appKey: string, appSecret: string, accessToken: string, accessSecret: string) {
  twitterClient = new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  });
}

// Post tweet with conversation message
async function postToTwitter(agentName: string, message: string, turnNumber: number): Promise<void> {
  if (!twitterClient || !CONFIG.tweetEnabled) return;

  try {
    // Truncate message if too long, leaving room for agent name, turn number, and hashtag
    const prefix = `[Turn ${turnNumber}] ${agentName}: `;
    const suffix = ` ${CONFIG.hashtag}`;
    const maxMessageLength = CONFIG.maxTweetLength - prefix.length - suffix.length - 3; // 3 for "..."
    
    let tweetMessage = message;
    if (message.length > maxMessageLength) {
      tweetMessage = message.substring(0, maxMessageLength) + '...';
    }
    
    const fullTweet = `${prefix}${tweetMessage}${suffix}`;
    
    await twitterClient.v2.tweet(fullTweet);
    console.log(`✓ Posted to X (Twitter)`);
  } catch (error) {
    console.error(`✗ Failed to post to X: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Parse rate limit error and extract wait time
function parseRateLimitError(error: Error): number | null {
  const errorMessage = error.message;
  
  // Try to find "Retry-After" or similar timing information
  const retryAfterMatch = errorMessage.match(/retry after (\d+) second/i);
  if (retryAfterMatch) {
    return parseInt(retryAfterMatch[1]) * 1000;
  }
  
  // Try to find "wait X seconds/minutes"
  const waitSecondsMatch = errorMessage.match(/wait (\d+) second/i);
  if (waitSecondsMatch) {
    return parseInt(waitSecondsMatch[1]) * 1000;
  }
  
  const waitMinutesMatch = errorMessage.match(/wait (\d+) minute/i);
  if (waitMinutesMatch) {
    return parseInt(waitMinutesMatch[1]) * 60 * 1000;
  }
  
  // For OpenAI rate limits, suggest waiting proportional to the overage
  const openaiMatch = errorMessage.match(/Limit (\d+), Requested (\d+)/);
  if (openaiMatch) {
    const limit = parseInt(openaiMatch[1]);
    const requested = parseInt(openaiMatch[2]);
    const overage = requested - limit;
    // Wait roughly 6 seconds per 1000 tokens over limit (conservative estimate)
    return Math.max(10000, (overage / 1000) * 6000);
  }
  
  return null;
}

// Sleep function with countdown
async function sleepWithCountdown(ms: number, reason: string): Promise<void> {
  const seconds = Math.ceil(ms / 1000);
  console.log(`\n⏳ ${reason}`);
  console.log(`   Waiting ${seconds} seconds...`);
  
  for (let i = seconds; i > 0; i--) {
    if (i % 10 === 0 || i <= 5) {
      process.stdout.write(`   ${i}... `);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log(`✓ Resuming\n`);
}

// Ensure history directory exists
function ensureHistoryDir() {
  if (!fs.existsSync(CONFIG.historyDir)) {
    fs.mkdirSync(CONFIG.historyDir, { recursive: true });
  }
}

// Ensure export directory exists
function ensureExportDir() {
  if (!fs.existsSync(CONFIG.exportDir)) {
    fs.mkdirSync(CONFIG.exportDir, { recursive: true });
  }
}

// Ensure code directory exists
function ensureCodeDir() {
  if (!fs.existsSync(CONFIG.codeDir)) {
    fs.mkdirSync(CONFIG.codeDir, { recursive: true });
  }
}

// Ensure working code directory exists
function ensureWorkingCodeDir() {
  if (!fs.existsSync(CONFIG.workingCodeDir)) {
    fs.mkdirSync(CONFIG.workingCodeDir, { recursive: true });
  }
}

// Save conversation state to file
function saveConversationState(agentName: string, state: ConversationState) {
  ensureHistoryDir();
  const filename = path.join(CONFIG.historyDir, `${agentName.toLowerCase().replace(/\s+/g, '_')}.json`);
  fs.writeFileSync(filename, JSON.stringify(state, null, 2));
}

// Load conversation state from file
function loadConversationState(agentName: string): ConversationState | null {
  const filename = path.join(CONFIG.historyDir, `${agentName.toLowerCase().replace(/\s+/g, '_')}.json`);
  if (fs.existsSync(filename)) {
    const data = fs.readFileSync(filename, 'utf-8');
    return JSON.parse(data);
  }
  return null;
}

// List available conversation histories
function listConversationHistories(): string[] {
  ensureHistoryDir();
  if (!fs.existsSync(CONFIG.historyDir)) {
    return [];
  }
  return fs.readdirSync(CONFIG.historyDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

// Export conversation to markdown format
function exportConversationToMarkdown(conversationId: string, agents: ChatAgent[]): string {
  ensureExportDir();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(CONFIG.exportDir, `conversation_${conversationId}_${timestamp}.md`);
  
  let markdown = `# AI Conversation - ${conversationId}\n\n`;
  markdown += `**Date:** ${new Date().toLocaleString()}\n`;
  markdown += `**Participants:** ${agents.map(a => a.name).join(', ')}\n\n`;
  markdown += `---\n\n`;
  
  // Get all messages from all agents and merge them chronologically
  const allMessages: Array<{agent: string, role: string, content: string, timestamp: number}> = [];
  
  agents.forEach(agent => {
    const history = agent.getConversationHistory();
    history.forEach((msg, index) => {
      if (msg.role !== 'system') {
        allMessages.push({
          agent: agent.name,
          role: msg.role,
          content: msg.content,
          timestamp: index // Use index as proxy for time
        });
      }
    });
  });
  
  // Group messages by turn (each agent's response)
  let currentTurn = 1;
  const agentNames = agents.map(a => a.name);
  
  agents.forEach(agent => {
    const history = agent.getConversationHistory();
    history.forEach(msg => {
      if (msg.role === 'assistant') {
        markdown += `## Turn ${currentTurn} - ${agent.name}\n\n`;
        markdown += `${msg.content}\n\n`;
        markdown += `---\n\n`;
        currentTurn++;
      }
    });
  });
  
  // Add summary section
  markdown += `## Summary\n\n`;
  markdown += `**Total Turns:** ${currentTurn - 1}\n`;
  agents.forEach(agent => {
    const msgCount = agent.getConversationHistory().filter(m => m.role === 'assistant').length;
    markdown += `**${agent.name} Messages:** ${msgCount}\n`;
  });
  
  markdown += `\n---\n\n`;
  markdown += `*This conversation can be referenced by AIs in future iterations.*\n`;
  markdown += `*To continue this work, AIs should review this document and build upon the ideas presented.*\n`;
  
  fs.writeFileSync(filename, markdown);
  console.log(`\n📄 Conversation exported to: ${filename}`);
  
  return filename;
}

// Create a summary document for AI reference
function createIterationSummary(conversationId: string, agents: ChatAgent[]): void {
  ensureExportDir();
  
  const summaryFile = path.join(CONFIG.exportDir, `ITERATION_SUMMARY.md`);
  
  let summary = `# AI Conversation Iteration Summary\n\n`;
  summary += `This document provides a summary of ongoing AI-to-AI conversations.\n`;
  summary += `AIs can reference this to understand the current state of work.\n\n`;
  summary += `---\n\n`;
  summary += `## Current Conversation: ${conversationId}\n\n`;
  summary += `**Last Updated:** ${new Date().toLocaleString()}\n`;
  summary += `**Participants:** ${agents.map(a => a.name).join(', ')}\n\n`;
  
  summary += `## Progress Overview\n\n`;
  agents.forEach(agent => {
    const msgCount = agent.getConversationHistory().filter(m => m.role === 'assistant').length;
    summary += `- **${agent.name}:** ${msgCount} contributions\n`;
  });
  
  summary += `\n## Key Objectives\n\n`;
  summary += `The AIs are working on: ${CONFIG.defaults.initialTopic}\n\n`;
  
  summary += `## How to Continue This Work\n\n`;
  summary += `1. Review the latest conversation export in this directory\n`;
  summary += `2. Identify key insights and proposals from previous iterations\n`;
  summary += `3. Build upon existing ideas rather than starting over\n`;
  summary += `4. Reference specific proposals by turn number\n`;
  summary += `5. Focus on refinement and implementation details\n\n`;
  
  summary += `## Git Integration\n\n`;
  summary += `To make this accessible to AIs:\n`;
  summary += `1. Initialize git: \`git init\`\n`;
  summary += `2. Add files: \`git add ${CONFIG.exportDir}\`\n`;
  summary += `3. Commit: \`git commit -m "AI conversation iteration"\`\n`;
  summary += `4. Push to GitHub for web accessibility\n`;
  summary += `5. AIs can reference: \`https://github.com/yourusername/repo/blob/main/${CONFIG.exportDir}/\`\n\n`;
  
  fs.writeFileSync(summaryFile, summary);
  console.log(`📋 Iteration summary updated: ${summaryFile}`);
}

// Extract code blocks from message and save to files
function extractAndSaveCode(message: string, agentName: string, turnNumber: number): string[] {
  if (!CONFIG.enableCodeExtraction) {
    return [];
  }

  ensureCodeDir();
  const savedFiles: string[] = [];
  
  // Match markdown code blocks with optional language and filename
  // Updated regex to be more permissive and capture all variations
  const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/gm;
  let match;
  let blockIndex = 0;
  
  while ((match = codeBlockRegex.exec(message)) !== null) {
    const language = match[1] || 'txt';
    const codeContent = match[2].trim();
    
    // Skip empty blocks or very short blocks (likely not real code)
    if (!codeContent || codeContent.length < 10) {
      continue;
    }
    
    // Try to extract filename from first few lines of comments
    let filename = null;
    const lines = codeContent.split('\n');
    
    // Check first 3 lines for filename in comments
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim();
      
      // Match various comment styles: //, #, /*, <!--
      const filenameMatch = line.match(/^(?:\/\/|#|\/\*|<!--|;)\s*([\w\-\.]+\.\w+)/);
      if (filenameMatch) {
        filename = filenameMatch[1];
        break;
      }
    }
    
    // If no filename found, generate one based on language and context
    if (!filename) {
      const ext = getExtensionForLanguage(language);
      filename = `${agentName.toLowerCase()}_turn${turnNumber}_block${blockIndex}.${ext}`;
    }
    
    const filepath = path.join(CONFIG.codeDir, filename);
    
    try {
      // Check if file exists - if so, append version number
      let finalFilename = filename;
      let version = 1;
      while (fs.existsSync(path.join(CONFIG.codeDir, finalFilename)) && version < 100) {
        const nameParts = filename.split('.');
        const ext = nameParts.pop();
        const base = nameParts.join('.');
        finalFilename = `${base}_v${version}.${ext}`;
        version++;
      }
      
      const finalPath = path.join(CONFIG.codeDir, finalFilename);
      fs.writeFileSync(finalPath, codeContent);
      savedFiles.push(finalFilename);
      console.log(`   💾 Saved code: ${finalFilename} (${language}, ${codeContent.length} chars)`);
    } catch (error) {
      console.error(`   ✗ Failed to save code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    blockIndex++;
  }
  
  if (savedFiles.length > 0) {
    console.log(`   📦 Total code blocks saved: ${savedFiles.length}`);
  }
  
  return savedFiles;
}

// Get file extension for programming language
function getExtensionForLanguage(language: string): string {
  const extensions: { [key: string]: string } = {
    'javascript': 'js',
    'js': 'js',
    'typescript': 'ts',
    'ts': 'ts',
    'python': 'py',
    'py': 'py',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'c++': 'cpp',
    'csharp': 'cs',
    'cs': 'cs',
    'go': 'go',
    'rust': 'rs',
    'ruby': 'rb',
    'rb': 'rb',
    'php': 'php',
    'swift': 'swift',
    'kotlin': 'kt',
    'kt': 'kt',
    'scala': 'scala',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'sql': 'sql',
    'shell': 'sh',
    'sh': 'sh',
    'bash': 'sh',
    'powershell': 'ps1',
    'markdown': 'md',
    'md': 'md',
    'text': 'txt',
  };
  
  return extensions[language.toLowerCase()] || 'txt';
}

// Create code index file
function createCodeIndex(conversationId: string): void {
  ensureCodeDir();
  
  const indexFile = path.join(CONFIG.codeDir, 'README.md');
  
  let index = `# Generated Code - Conversation ${conversationId}\n\n`;
  index += `**Last Updated:** ${new Date().toLocaleString()}\n\n`;
  index += `This directory contains code implementations extracted from AI conversations.\n`;
  index += `The AIs can reference these files in future iterations to build upon previous work.\n\n`;
  index += `---\n\n`;
  index += `## Available Code Files\n\n`;
  
  try {
    const files = fs.readdirSync(CONFIG.codeDir).filter(f => f !== 'README.md');
    
    if (files.length === 0) {
      index += `*No code files generated yet.*\n`;
    } else {
      files.forEach(file => {
        const stats = fs.statSync(path.join(CONFIG.codeDir, file));
        index += `- **${file}** (${stats.size} bytes, modified: ${stats.mtime.toLocaleString()})\n`;
      });
      
      index += `\n## How to Use\n\n`;
      index += `1. Review the code files in this directory\n`;
      index += `2. Reference them in conversations: "Building on the implementation in ${files[0]}..."\n`;
      index += `3. AIs can suggest modifications or improvements to existing files\n`;
      index += `4. Files are automatically committed to Git for version control\n`;
    }
  } catch (error) {
    index += `*Error reading directory*\n`;
  }
  
  fs.writeFileSync(indexFile, index);
  console.log(`📑 Code index updated: ${indexFile}`);
}

// Consolidate code fragments into working implementations
async function consolidateCode(claudeAgent: ClaudeAgent, conversationId: string): Promise<void> {
  if (!CONFIG.enableConsolidation) {
    return;
  }

  ensureWorkingCodeDir();
  
  console.log('\n' + '='.repeat(60));
  console.log('🔧 Code Consolidation Phase');
  console.log('='.repeat(60));
  console.log('\nAsking Claude to review and consolidate code fragments...\n');

  try {
    // Get list of all code fragments
    const fragments = fs.existsSync(CONFIG.codeDir) 
      ? fs.readdirSync(CONFIG.codeDir).filter(f => f !== 'README.md')
      : [];

    if (fragments.length === 0) {
      console.log('No code fragments to consolidate.');
      return;
    }

    // Get list of existing working code files
    const existingWorkingCode = fs.existsSync(CONFIG.workingCodeDir)
      ? fs.readdirSync(CONFIG.workingCodeDir).filter(f => f !== 'README.md')
      : [];

    // Check if we need to chunk the consolidation
    const totalFragments = fragments.length;
    const maxFragmentsPerChunk = 8; // Process up to 8 files at a time to stay under token limits
    
    if (totalFragments > maxFragmentsPerChunk) {
      console.log(`Found ${totalFragments} fragments. Processing in chunks of ${maxFragmentsPerChunk}...\n`);
      
      // Process in chunks
      for (let i = 0; i < totalFragments; i += maxFragmentsPerChunk) {
        const chunkFragments = fragments.slice(i, i + maxFragmentsPerChunk);
        const chunkNum = Math.floor(i / maxFragmentsPerChunk) + 1;
        const totalChunks = Math.ceil(totalFragments / maxFragmentsPerChunk);
        
        console.log(`Processing chunk ${chunkNum}/${totalChunks} (${chunkFragments.length} files)...`);
        await consolidateCodeChunk(claudeAgent, chunkFragments, existingWorkingCode, chunkNum, totalChunks, conversationId);
        
        // Small delay between chunks
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.log('\n✓ All chunks processed');
    } else {
      // Process all at once if small enough
      await consolidateCodeChunk(claudeAgent, fragments, existingWorkingCode, 1, 1, conversationId);
    }

  } catch (error) {
    console.error(`✗ Consolidation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Consolidate a chunk of code fragments
async function consolidateCodeChunk(
  claudeAgent: ClaudeAgent, 
  fragments: string[], 
  existingWorkingCode: string[],
  chunkNum: number,
  totalChunks: number,
  conversationId: string
): Promise<void> {
  
  // Read code fragments for this chunk
  const codeContent: { [key: string]: string } = {};
  fragments.forEach(filename => {
    const filepath = path.join(CONFIG.codeDir, filename);
    const content = fs.readFileSync(filepath, 'utf-8');
    // Truncate very long files to stay under token limits
    codeContent[filename] = content.length > 2000 ? content.substring(0, 2000) + '\n// ... [truncated]' : content;
  });

  // Build consolidation prompt for Claude
  let consolidationPrompt = `CONSOLIDATION MODE - Chunk ${chunkNum}/${totalChunks}

Your task: Review these ${fragments.length} code fragments and consolidate them into working implementations.

**Code Fragments:**

`;

  fragments.forEach(filename => {
    consolidationPrompt += `--- ${filename} ---
\`\`\`
${codeContent[filename]}
\`\`\`

`;
  });

  // Only include existing working code reference if it's the first chunk
  if (chunkNum === 1 && existingWorkingCode.length > 0) {
    consolidationPrompt += `\n**Existing Working Files:** ${existingWorkingCode.join(', ')}\n`;
    consolidationPrompt += `(Available in ${CONFIG.workingCodeDir}/ - you can build upon these)\n\n`;
  }

  consolidationPrompt += `
**Your Task:**
1. Identify what these fragments are trying to accomplish
2. Consolidate related fragments into cohesive, working files
3. For each file, use clear filename comments: // filename.js or # filename.py
4. Create complete, production-ready implementations
5. Add error handling and documentation

Output ONLY code blocks with filenames. No explanations outside code blocks.`;

  try {
    const consolidatedResponse = await claudeAgent.sendMessage(consolidationPrompt);
    
    // Extract consolidated code
    const consolidatedFiles = extractConsolidatedCode(consolidatedResponse);
    
    if (consolidatedFiles.length > 0) {
      console.log(`   ✓ Chunk ${chunkNum}: Created ${consolidatedFiles.length} file(s)`);
      createWorkingCodeReadme(conversationId, consolidatedFiles);
    } else {
      console.log(`   ⚠️  Chunk ${chunkNum}: No code extracted`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('maximum context length')) {
      console.log(`   ⚠️  Chunk ${chunkNum}: Still too large, skipping this chunk`);
      console.log(`   Tip: Review fragments manually in ${CONFIG.codeDir}/`);
    } else {
      throw error;
    }
  }
}

// Extract consolidated code and save to working_code directory
function extractConsolidatedCode(response: string): string[] {
  ensureWorkingCodeDir();
  const savedFiles: string[] = [];
  
  const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/gm;
  let match;
  let blockIndex = 0;
  
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1] || 'txt';
    const codeContent = match[2].trim();
    
    if (!codeContent || codeContent.length < 10) {
      continue;
    }
    
    // Extract filename from comments
    let filename = null;
    const lines = codeContent.split('\n');
    
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim();
      const filenameMatch = line.match(/^(?:\/\/|#|\/\*|<!--|;)\s*([\w\-\.]+\.\w+)/);
      if (filenameMatch) {
        filename = filenameMatch[1];
        break;
      }
    }
    
    if (!filename) {
      const ext = getExtensionForLanguage(language);
      filename = `consolidated_${blockIndex}.${ext}`;
    }
    
    const filepath = path.join(CONFIG.workingCodeDir, filename);
    
    try {
      fs.writeFileSync(filepath, codeContent);
      savedFiles.push(filename);
      console.log(`   💾 Saved working code: ${filename} (${codeContent.length} chars)`);
    } catch (error) {
      console.error(`   ✗ Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    blockIndex++;
  }
  
  return savedFiles;
}

// Create README for working code directory
function createWorkingCodeReadme(conversationId: string, files: string[]): void {
  ensureWorkingCodeDir();
  
  const readmeFile = path.join(CONFIG.workingCodeDir, 'README.md');
  
  let readme = `# Working Code - Conversation ${conversationId}\n\n`;
  readme += `**Last Updated:** ${new Date().toLocaleString()}\n\n`;
  readme += `This directory contains consolidated, production-ready implementations created by Claude from conversation fragments.\n\n`;
  readme += `---\n\n`;
  readme += `## Current Working Files\n\n`;
  
  files.forEach(file => {
    const filepath = path.join(CONFIG.workingCodeDir, file);
    const stats = fs.statSync(filepath);
    readme += `### ${file}\n`;
    readme += `- **Size:** ${stats.size} bytes\n`;
    readme += `- **Last Modified:** ${stats.mtime.toLocaleString()}\n`;
    readme += `- **Status:** Ready for use\n\n`;
  });
  
  readme += `## How to Use\n\n`;
  readme += `1. These files are production-ready implementations\n`;
  readme += `2. They consolidate ideas from multiple conversation fragments\n`;
  readme += `3. Review and test before deploying\n`;
  readme += `4. Future iterations can reference and improve these files\n\n`;
  readme += `## Next Steps\n\n`;
  readme += `In the next conversation run, the AIs can:\n`;
  readme += `- Reference these working implementations\n`;
  readme += `- Suggest improvements or bug fixes\n`;
  readme += `- Add new features to existing modules\n`;
  readme += `- Create integration tests\n`;
  
  fs.writeFileSync(readmeFile, readme);
  console.log(`   📋 Working code README created: ${readmeFile}`);
}

// Generate human-readable run summary
async function generateRunSummary(claudeAgent: ClaudeAgent, conversationId: string, agents: ChatAgent[]): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Generating Run Summary');
  console.log('='.repeat(60));
  console.log('\nAsking Claude to summarize progress for humans...\n');

  try {
    // Get conversation stats
    const totalTurns = agents.reduce((sum, agent) => 
      sum + agent.getConversationHistory().filter(m => m.role === 'assistant').length, 0
    );
    
    // Get code stats
    const fragmentCount = fs.existsSync(CONFIG.codeDir)
      ? fs.readdirSync(CONFIG.codeDir).filter(f => f !== 'README.md').length
      : 0;
    
    const workingCodeCount = fs.existsSync(CONFIG.workingCodeDir)
      ? fs.readdirSync(CONFIG.workingCodeDir).filter(f => f !== 'README.md').length
      : 0;

    // Get recent conversation context (last 4 messages for summary - reduced to save tokens)
    const recentMessages: string[] = [];
    agents.forEach(agent => {
      const history = agent.getConversationHistory();
      const assistantMessages = history.filter(m => m.role === 'assistant').slice(-1); // Only last message per agent
      assistantMessages.forEach(msg => {
        // Truncate messages to 200 chars
        recentMessages.push(`${agent.name}: ${msg.content.substring(0, 200)}...`);
      });
    });

    const summaryPrompt = `SUMMARY MODE - Create a brief progress report.

**Stats:**
- Turns: ${totalTurns}
- Code fragments: ${fragmentCount}
- Working files: ${workingCodeCount}
- Conversation: ${conversationId}

**Recent context:**
${recentMessages.join('\n\n')}

**Create a concise summary with:**

1. **Primary Goal** (1 sentence)
2. **Progress Made** (3 bullet points max)
3. **Current Status** (e.g., "40% complete")
4. **Next Steps** (2 bullet points)
5. **Blockers** (if any, 1 sentence)

Keep it brief and clear. Focus on WHAT was done, not HOW.`;

    const summaryResponse = await claudeAgent.sendMessage(summaryPrompt);
    
    // Save summary to file
    ensureExportDir();
    const summaryFile = path.join(CONFIG.exportDir, `RUN_SUMMARY_${conversationId}.md`);
    
    let fullSummary = `# Run Summary - ${conversationId}\n\n`;
    fullSummary += `**Generated:** ${new Date().toLocaleString()}\n`;
    fullSummary += `**Total Turns:** ${totalTurns}\n`;
    fullSummary += `**Code Fragments:** ${fragmentCount}\n`;
    fullSummary += `**Working Files:** ${workingCodeCount}\n\n`;
    fullSummary += `---\n\n`;
    fullSummary += summaryResponse;
    
    fs.writeFileSync(summaryFile, fullSummary);
    
    console.log('\n' + '='.repeat(60));
    console.log('📄 RUN SUMMARY');
    console.log('='.repeat(60));
    console.log('\n' + summaryResponse);
    console.log('\n' + '='.repeat(60));
    console.log(`\n✓ Summary saved to: ${summaryFile}\n`);
    
    // Update root README with this run's summary
    updateRootReadme(conversationId, summaryResponse, totalTurns, fragmentCount, workingCodeCount);
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('maximum context length')) {
      console.log('⚠️  Summary generation skipped - context too large');
      console.log('   Creating basic summary from stats...\n');
      
      // Create a simple stats-based summary
      const basicSummary = `## Progress Update

**Current Status:** In progress

**Stats:**
- Total conversation turns: ${agents.reduce((sum, agent) => 
        sum + agent.getConversationHistory().filter(m => m.role === 'assistant').length, 0)}
- Code fragments generated: ${fs.existsSync(CONFIG.codeDir) ? fs.readdirSync(CONFIG.codeDir).filter(f => f !== 'README.md').length : 0}
- Working implementations: ${fs.existsSync(CONFIG.workingCodeDir) ? fs.readdirSync(CONFIG.workingCodeDir).filter(f => f !== 'README.md').length : 0}

See conversation exports and code files for details.`;
      
      updateRootReadme(conversationId, basicSummary, 
        agents.reduce((sum, agent) => sum + agent.getConversationHistory().filter(m => m.role === 'assistant').length, 0),
        fs.existsSync(CONFIG.codeDir) ? fs.readdirSync(CONFIG.codeDir).filter(f => f !== 'README.md').length : 0,
        fs.existsSync(CONFIG.workingCodeDir) ? fs.readdirSync(CONFIG.workingCodeDir).filter(f => f !== 'README.md').length : 0
      );
    } else {
      console.error(`✗ Summary generation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Update root README.md with run summary
function updateRootReadme(conversationId: string, summary: string, turns: number, fragments: number, workingFiles: number): void {
  const readmeFile = 'README.md';
  const timestamp = new Date().toLocaleString();
  
  let existingContent = '';
  let projectTitle = 'AI Collaboration Project';
  let projectDescription = 'An ongoing conversation between ChatGPT, Gemini, and Claude to design and implement AI-to-AI communication protocols.';
  
  // Read existing README if it exists
  if (fs.existsSync(readmeFile)) {
    existingContent = fs.readFileSync(readmeFile, 'utf-8');
    
    // Extract project title and description if they exist
    const titleMatch = existingContent.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      projectTitle = titleMatch[1];
    }
    
    const descMatch = existingContent.match(/^#\s+.+\n\n(.+?)(?:\n\n|$)/s);
    if (descMatch) {
      projectDescription = descMatch[1].trim();
    }
  }
  
  // Build new README content
  let readme = `# ${projectTitle}\n\n`;
  readme += `${projectDescription}\n\n`;
  readme += `---\n\n`;
  readme += `## 📊 Project Status\n\n`;
  
  // Calculate overall progress by checking for run summaries
  const allSummaries = fs.existsSync(CONFIG.exportDir)
    ? fs.readdirSync(CONFIG.exportDir).filter(f => f.startsWith('RUN_SUMMARY_'))
    : [];
  
  readme += `**Last Updated:** ${timestamp}\n`;
  readme += `**Total Runs:** ${allSummaries.length}\n`;
  readme += `**Conversation ID:** ${conversationId}\n\n`;
  
  // Add quick stats
  readme += `### Quick Stats\n`;
  readme += `- 💬 Conversation Turns: ${turns}\n`;
  readme += `- 📝 Code Fragments: ${fragments}\n`;
  readme += `- ✅ Working Files: ${workingFiles}\n\n`;
  
  readme += `---\n\n`;
  readme += `## 📅 Latest Run Summary\n\n`;
  readme += `**Run Date:** ${timestamp}\n\n`;
  readme += summary;
  readme += `\n\n---\n\n`;
  
  // Add project structure
  readme += `## 📂 Project Structure\n\n`;
  readme += `\`\`\`\n`;
  readme += `├── conversation_exports/     # Markdown transcripts of AI conversations\n`;
  readme += `├── generated_code/          # Raw code fragments from conversations\n`;
  readme += `├── working_code/           # Consolidated, production-ready implementations\n`;
  readme += `└── conversation_history/   # JSON state files (conversation memory)\n`;
  readme += `\`\`\`\n\n`;
  
  // Add links to key resources
  readme += `## 🔗 Key Resources\n\n`;
  readme += `- [Latest Run Summary](${CONFIG.exportDir}/RUN_SUMMARY_${conversationId}.md)\n`;
  readme += `- [Conversation Exports](${CONFIG.exportDir}/)\n`;
  readme += `- [Working Code](${CONFIG.workingCodeDir}/)\n`;
  readme += `- [Code Fragments](${CONFIG.codeDir}/)\n\n`;
  
  // Add run history if there are multiple runs
  if (allSummaries.length > 1) {
    readme += `---\n\n`;
    readme += `## 📜 Run History\n\n`;
    
    // Get all run summaries sorted by date (newest first)
    const summaryFiles = allSummaries
      .map(filename => {
        const filepath = path.join(CONFIG.exportDir, filename);
        const stats = fs.statSync(filepath);
        return { filename, mtime: stats.mtime };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      .slice(0, 10); // Show last 10 runs
    
    summaryFiles.forEach((file, index) => {
      const runDate = file.mtime.toLocaleString();
      const runNum = allSummaries.length - index;
      readme += `${runNum}. [Run ${runDate}](${CONFIG.exportDir}/${file.filename})\n`;
    });
    
    if (allSummaries.length > 10) {
      readme += `\n*Showing 10 most recent runs. See [${CONFIG.exportDir}/](${CONFIG.exportDir}/) for complete history.*\n`;
    }
    readme += `\n`;
  }
  
  readme += `---\n\n`;
  readme += `## 🚀 How to Continue\n\n`;
  readme += `1. Run the conversation CLI tool\n`;
  readme += `2. Enter conversation ID: \`${conversationId}\`\n`;
  readme += `3. The AIs will continue from where they left off\n`;
  readme += `4. Reference working code files for context\n\n`;
  
  readme += `## 🤖 About This Project\n\n`;
  readme += `This is an autonomous AI collaboration system where:\n`;
  readme += `- Three AI models (ChatGPT, Gemini, Claude) discuss and solve problems\n`;
  readme += `- Conversations are automatically saved and versioned\n`;
  readme += `- Code ideas are extracted and consolidated into working implementations\n`;
  readme += `- Progress is tracked and summarized for human oversight\n`;
  readme += `- All work is committed to Git for full traceability\n\n`;
  
  readme += `*This README is automatically updated after each conversation run.*\n`;
  
  // Write the README
  fs.writeFileSync(readmeFile, readme);
  console.log(`✓ Root README.md updated with run summary\n`);
}

// Commit and push exports to Git
function gitCommitAndPush(): boolean {
  if (!CONFIG.enableGitCommit) {
    return false;
  }

  try {
    const timestamp = new Date().toLocaleString();
    const commitMessage = `AI conversation update - ${timestamp}`;
    
    console.log('\n📦 Committing to Git...');
    
    // Check if git is initialized
    try {
      execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    } catch (error) {
      console.log('⚠️  Git not initialized. Run: git init');
      return false;
    }
    
    // Auto-detect current branch if not set
    try {
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      if (currentBranch) {
        CONFIG.gitBranch = currentBranch;
      }
    } catch (error) {
      // Use default branch if detection fails
    }
    
    // Auto-detect remote if not set
    try {
      const remotes = execSync('git remote', { encoding: 'utf-8' }).trim().split('\n');
      if (remotes.length > 0 && remotes[0]) {
        CONFIG.gitRemote = remotes[0]; // Use first remote found
      }
    } catch (error) {
      // Use default remote if detection fails
    }
    
    // Add the export directory
    execSync(`git add ${CONFIG.exportDir}`, { stdio: 'pipe' });
    console.log(`   ✓ Added ${CONFIG.exportDir}`);
    
    // Add README.md if it exists
    if (fs.existsSync('README.md')) {
      execSync('git add README.md', { stdio: 'pipe' });
      console.log(`   ✓ Added README.md`);
    }
    
    // Add the code directory if it exists
    if (fs.existsSync(CONFIG.codeDir)) {
      execSync(`git add ${CONFIG.codeDir}`, { stdio: 'pipe' });
      console.log(`   ✓ Added ${CONFIG.codeDir}`);
    }
    
    // Add the working code directory if it exists
    if (fs.existsSync(CONFIG.workingCodeDir)) {
      execSync(`git add ${CONFIG.workingCodeDir}`, { stdio: 'pipe' });
      console.log(`   ✓ Added ${CONFIG.workingCodeDir}`);
    }
    
    // Check if there are changes to commit
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf-8' });
      if (!status.trim()) {
        console.log('   ℹ️  No changes to commit');
        return true;
      }
    } catch (error) {
      // Continue if status check fails
    }
    
    // Commit
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'pipe' });
    console.log(`   ✓ Committed: "${commitMessage}"`);
    
    // Push to remote - use 'inherit' to allow git to use system credentials
    try {
      execSync(`git push ${CONFIG.gitRemote} ${CONFIG.gitBranch}`, { 
        stdio: 'inherit' // This allows Git to prompt for credentials if needed
      });
      console.log(`   ✓ Pushed to ${CONFIG.gitRemote}/${CONFIG.gitBranch}`);
    } catch (error) {
      console.log(`   ⚠️  Push failed.`);
      console.log(`   To fix authentication issues:`);
      console.log(`   1. Use SSH instead: git remote set-url origin git@github.com:username/repo.git`);
      console.log(`   2. Or cache HTTPS credentials: git config --global credential.helper store`);
      console.log(`   3. Or disable auto-push and push manually`);
    }
    
    return true;
  } catch (error) {
    console.error(`   ✗ Git error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

abstract class ChatAgent {
  protected messages: Message[] = [];
  public name: string;
  protected systemPrompt: string;
  protected conversationId: string;
  protected currentContextLimit: number;

  constructor(name: string, systemPrompt: string, conversationId: string) {
    this.name = name;
    this.systemPrompt = systemPrompt;
    this.conversationId = conversationId;
    this.currentContextLimit = CONFIG.maxContextMessages;
  }

  abstract sendMessage(userMessage: string): Promise<string>;

  getConversationHistory(): Message[] {
    return this.messages;
  }

  saveState() {
    const state: ConversationState = {
      messages: this.messages,
      systemPrompt: this.systemPrompt,
      conversationId: this.conversationId,
      lastUpdated: new Date().toISOString(),
    };
    saveConversationState(this.name, state);
  }

  loadState(): boolean {
    const state = loadConversationState(this.name);
    if (state && state.conversationId === this.conversationId) {
      this.messages = state.messages;
      this.systemPrompt = state.systemPrompt;
      return true;
    }
    return false;
  }

  getMessageCount(): number {
    return this.messages.filter(m => m.role !== 'system').length;
  }

  // Get messages for API call with sliding window
  protected getContextMessages(): Message[] {
    if (!CONFIG.enableContextWindow) {
      return this.messages;
    }

    // Always include system prompt
    const systemMessages = this.messages.filter(m => m.role === 'system');
    const conversationMessages = this.messages.filter(m => m.role !== 'system');

    // Use current context limit (may be reduced if hitting token limits)
    const recentMessages = conversationMessages.slice(-this.currentContextLimit);

    return [...systemMessages, ...recentMessages];
  }

  // Reduce context window to use fewer tokens
  protected reduceContext(): boolean {
    if (this.currentContextLimit > CONFIG.minContextMessages) {
      const oldLimit = this.currentContextLimit;
      this.currentContextLimit = Math.max(
        CONFIG.minContextMessages,
        Math.floor(this.currentContextLimit * 0.6) // Reduce by 40%
      );
      console.log(`   Reducing context window for ${this.name}: ${oldLimit} → ${this.currentContextLimit} messages`);
      return true;
    }
    return false;
  }

  // Reset context window to maximum
  resetContext(): void {
    this.currentContextLimit = CONFIG.maxContextMessages;
  }
}

class OpenAIAgent extends ChatAgent {
  private client: OpenAI;

  constructor(apiKey: string, name: string, systemPrompt: string, conversationId: string) {
    super(name, systemPrompt, conversationId);
    this.client = new OpenAI({ apiKey });
    
    // Try to load existing state, otherwise initialize with system prompt
    if (!this.loadState()) {
      this.messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }
  }

  async sendMessage(userMessage: string): Promise<string> {
    this.messages.push({
      role: 'user',
      content: userMessage,
    });

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
      try {
        // Use sliding window context for API call
        const contextMessages = this.getContextMessages();

        const completion = await this.client.chat.completions.create({
          model: CONFIG.openaiModel,
          messages: contextMessages,
          temperature: CONFIG.temperature,
        });

        const response = completion.choices[0].message.content || '';
        
        this.messages.push({
          role: 'assistant',
          content: response,
        });

        this.saveState();
        return response;
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a token limit error (too many tokens requested)
        if (lastError.message.includes('Request too large') || 
            lastError.message.includes('tokens per min') ||
            lastError.message.includes('maximum context length')) {
          if (CONFIG.adaptiveContextReduction && this.reduceContext()) {
            console.log(`   Retrying with reduced context...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Brief pause
            continue;
          }
        }
        
        // Check if it's a rate limit error
        if (lastError.message.includes('429') || lastError.message.includes('rate limit')) {
          if (attempt < CONFIG.maxRetries) {
            const waitTime = parseRateLimitError(lastError) || CONFIG.defaultRetryDelay;
            await sleepWithCountdown(waitTime, `Rate limit hit for ${this.name} (attempt ${attempt + 1}/${CONFIG.maxRetries})`);
            continue;
          }
        }
        
        // If not a rate limit error or out of retries, throw
        throw lastError;
      }
    }
    
    throw lastError || new Error('Failed after retries');
  }

  getTurnNumber(): number {
    return Math.floor(this.messages.filter(m => m.role === 'assistant').length);
  }
}

class ClaudeAgent extends ChatAgent {
  private client: Anthropic;

  constructor(apiKey: string, name: string, systemPrompt: string, conversationId: string) {
    super(name, systemPrompt, conversationId);
    this.client = new Anthropic({ apiKey });
    
    // Try to load existing state
    this.loadState();
  }

  async sendMessage(userMessage: string): Promise<string> {
    this.messages.push({
      role: 'user',
      content: userMessage,
    });

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
      try {
        // Get context messages (excluding system prompt for API call)
        const contextMessages = this.getContextMessages();
        const apiMessages = contextMessages
          .filter(m => m.role !== 'system')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

        const response = await this.client.messages.create({
          model: CONFIG.claudeModel,
          max_tokens: 1024,
          temperature: CONFIG.temperature,
          system: this.systemPrompt,
          messages: apiMessages,
        });

        const responseText = response.content[0].type === 'text' 
          ? response.content[0].text 
          : '';
        
        this.messages.push({
          role: 'assistant',
          content: responseText,
        });

        this.saveState();
        return responseText;
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a token limit error
        if (lastError.message.includes('too large') || lastError.message.includes('token')) {
          if (CONFIG.adaptiveContextReduction && this.reduceContext()) {
            console.log(`   Retrying with reduced context...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
        }
        
        // Check if it's a rate limit error
        if (lastError.message.includes('429') || lastError.message.includes('rate limit')) {
          if (attempt < CONFIG.maxRetries) {
            const waitTime = parseRateLimitError(lastError) || CONFIG.defaultRetryDelay;
            await sleepWithCountdown(waitTime, `Rate limit hit for ${this.name} (attempt ${attempt + 1}/${CONFIG.maxRetries})`);
            continue;
          }
        }
        
        throw lastError;
      }
    }
    
    throw lastError || new Error('Failed after retries');
  }

  getTurnNumber(): number {
    return Math.floor(this.messages.filter(m => m.role === 'assistant').length);
  }
}

class GeminiAgent extends ChatAgent {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private chat: any;

  constructor(apiKey: string, name: string, systemPrompt: string, conversationId: string) {
    super(name, systemPrompt, conversationId);
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: CONFIG.geminiModel.startsWith('models/') 
        ? CONFIG.geminiModel 
        : `models/${CONFIG.geminiModel}` 
    });
    
    // Load existing state if available
    const loaded = this.loadState();
    
    // Initialize chat with history
    this.initializeChat();
  }

  private initializeChat() {
    // Convert messages to Gemini format, using sliding window
    const contextMessages = this.getContextMessages();
    const history = [];
    
    for (let i = 0; i < contextMessages.length; i++) {
      const msg = contextMessages[i];
      if (msg.role === 'user') {
        history.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === 'assistant') {
        history.push({
          role: 'model',
          parts: [{ text: msg.content }],
        });
      }
      // Skip system messages - they're handled differently in Gemini
    }

    // Gemini requires history to:
    // 1. Start with 'user' role
    // 2. Alternate user/model
    // 3. End with 'model' role (if not empty)
    
    // Remove any leading 'model' messages
    while (history.length > 0 && history[0].role === 'model') {
      history.shift();
    }
    
    // If history has odd number of messages (ends with user), remove the last one
    if (history.length > 0 && history[history.length - 1].role === 'user') {
      history.pop();
    }
    
    // Ensure alternation - remove any consecutive same-role messages
    const cleanedHistory = [];
    for (let i = 0; i < history.length; i++) {
      if (i === 0 || history[i].role !== history[i - 1].role) {
        cleanedHistory.push(history[i]);
      }
    }

    this.chat = this.model.startChat({
      history: cleanedHistory,
      generationConfig: {
        temperature: CONFIG.temperature,
        maxOutputTokens: 1024,
      },
    });
  }

  async sendMessage(userMessage: string): Promise<string> {
    // For first message, include system prompt context
    const isFirstMessage = this.messages.length === 0;
    const messageToSend = isFirstMessage 
      ? `${this.systemPrompt}\n\n${userMessage}`
      : userMessage;

    this.messages.push({
      role: 'user',
      content: userMessage,
    });

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
      try {
        // Reinitialize chat with sliding window to manage token usage
        this.initializeChat();

        const result = await this.chat.sendMessage(messageToSend);
        const response = result.response.text();
        
        this.messages.push({
          role: 'assistant',
          content: response,
        });

        this.saveState();
        return response;
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a token limit error
        if (lastError.message.toLowerCase().includes('quota') || lastError.message.includes('too large')) {
          if (CONFIG.adaptiveContextReduction && this.reduceContext()) {
            console.log(`   Retrying with reduced context...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Brief pause
            continue;
          }
        }
        
        // Check if it's a rate limit error
        if (lastError.message.includes('429') || lastError.message.toLowerCase().includes('rate')) {
          if (attempt < CONFIG.maxRetries) {
            const waitTime = parseRateLimitError(lastError) || CONFIG.defaultRetryDelay;
            await sleepWithCountdown(waitTime, `Rate limit hit for ${this.name} (attempt ${attempt + 1}/${CONFIG.maxRetries})`);
            continue;
          }
        }
        
        // If not a rate limit error or out of retries, throw
        throw lastError;
      }
    }
    
    throw lastError || new Error('Failed after retries');
  }

  getTurnNumber(): number {
    return Math.floor(this.messages.filter(m => m.role === 'assistant').length);
  }
}

async function getUserInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log('=== ChatGPT vs Gemini vs Claude Conversation (with Memory) ===\n');

  // Check for existing conversations
  const existingConvos = listConversationHistories();
  
  let conversationId: string;
  let isNewConversation = true;
  
  if (existingConvos.length > 0) {
    // Check if all conversations share the same conversation ID
    const states = existingConvos.map(name => loadConversationState(name)).filter(s => s !== null);
    const uniqueConvIds = [...new Set(states.map(s => s!.conversationId))];
    
    if (uniqueConvIds.length === 1) {
      // Only one unique conversation ID - auto-select it
      conversationId = uniqueConvIds[0];
      isNewConversation = false;
      
      console.log('Found existing conversation:');
      existingConvos.forEach(name => {
        const state = loadConversationState(name);
        if (state) {
          const msgCount = state.messages.filter(m => m.role !== 'system').length;
          console.log(`  - ${name}: ${msgCount} messages`);
        }
      });
      console.log(`\n✓ Auto-continuing conversation: ${conversationId}\n`);
    } else {
      // Multiple conversations - let user choose
      console.log('Existing conversations found:');
      existingConvos.forEach(name => {
        const state = loadConversationState(name);
        if (state) {
          const msgCount = state.messages.filter(m => m.role !== 'system').length;
          console.log(`  - ${name}: ${msgCount} messages (ID: ${state.conversationId}, Last: ${new Date(state.lastUpdated).toLocaleString()})`);
        }
      });
      console.log();
      
      const continueChoice = await getUserInput('Continue existing conversation? (yes/no): ');
      if (continueChoice.toLowerCase().startsWith('y')) {
        conversationId = await getUserInput('Enter conversation ID to continue: ');
        isNewConversation = false;
      } else {
        conversationId = `conv_${Date.now()}`;
      }
    }
  } else {
    conversationId = `conv_${Date.now()}`;
    console.log(`Starting new conversation (ID: ${conversationId})\n`);
  }

  // Ask about Git integration
  const enableGit = await getUserInput('Enable automatic Git commit and push? (yes/no): ');
  CONFIG.enableGitCommit = enableGit.toLowerCase().startsWith('y');

  if (CONFIG.enableGitCommit) {
    // Auto-detect git settings
    try {
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      const remotes = execSync('git remote', { encoding: 'utf-8' }).trim().split('\n');
      
      if (currentBranch) {
        CONFIG.gitBranch = currentBranch;
      }
      if (remotes.length > 0 && remotes[0]) {
        CONFIG.gitRemote = remotes[0];
      }
      
      console.log(`✓ Git auto-commit enabled: ${CONFIG.gitRemote}/${CONFIG.gitBranch}\n`);
    } catch (error) {
      console.log('⚠️  Could not auto-detect git config. Using defaults: origin/main\n');
    }
  }

  // Ask about Twitter posting
  const enableTwitter = await getUserInput('Post conversation to X/Twitter in real-time? (yes/no): ');
  CONFIG.tweetEnabled = enableTwitter.toLowerCase().startsWith('y');

  if (CONFIG.tweetEnabled) {
    console.log('\nTwitter API credentials needed (get from https://developer.twitter.com):');
    const appKey = process.env.TWITTER_API_KEY || await getUserInput('API Key: ');
    const appSecret = process.env.TWITTER_API_SECRET || await getUserInput('API Secret: ');
    const accessToken = process.env.TWITTER_ACCESS_TOKEN || await getUserInput('Access Token: ');
    const accessSecret = process.env.TWITTER_ACCESS_SECRET || await getUserInput('Access Token Secret: ');
    
    const customHashtag = await getUserInput(`Hashtag to use (default: ${CONFIG.hashtag}): `);
    if (customHashtag.trim()) {
      CONFIG.hashtag = customHashtag.startsWith('#') ? customHashtag : `#${customHashtag}`;
    }
    
    initTwitterClient(appKey, appSecret, accessToken, accessSecret);
    console.log(`✓ Twitter posting enabled with hashtag: ${CONFIG.hashtag}\n`);
  }

  // Get API keys
  const openaiKey = process.env.OPENAI_API_KEY || await getUserInput('Enter OpenAI API key: ');
  const geminiKey = process.env.GEMINI_API_KEY || await getUserInput('Enter Gemini API key: ');
  const claudeKey = process.env.ANTHROPIC_API_KEY || await getUserInput('Enter Claude API key: ');

  let systemPrompt1: string;
  let systemPrompt2: string;
  let systemPrompt3: string;
  let initialTopic: string;

  if (isNewConversation) {
    // Ask if user wants to use defaults
    console.log('\n=== Quick Start Options ===');
    console.log('Default settings:');
    console.log(`  ChatGPT: "${CONFIG.defaults.chatgptPrompt}"`);
    console.log(`  Gemini: "${CONFIG.defaults.geminiPrompt}"`);
    console.log(`  Claude: "${CONFIG.defaults.claudePrompt}"`);
    console.log(`  Topic: "${CONFIG.defaults.initialTopic.substring(0, 80)}..."`);
    console.log();
    
    const useDefaults = await getUserInput('Use default settings? (yes/no): ');
    
    if (useDefaults.toLowerCase().startsWith('y')) {
      systemPrompt1 = CONFIG.defaults.chatgptPrompt;
      systemPrompt2 = CONFIG.defaults.geminiPrompt;
      systemPrompt3 = CONFIG.defaults.claudePrompt;
      initialTopic = CONFIG.defaults.initialTopic;
      console.log('✓ Using default settings\n');
    } else {
      // Get system prompts for new conversation
      console.log('\nDefine the personalities:\n');
      systemPrompt1 = await getUserInput('System prompt for ChatGPT: ');
      systemPrompt2 = await getUserInput('System prompt for Gemini: ');
      systemPrompt3 = await getUserInput('System prompt for Claude: ');
      initialTopic = await getUserInput('\nWhat should they discuss? ');
    }
  } else {
    // Use existing system prompts and automatically continue
    console.log('\nLoading existing personalities...\n');
    const state1 = loadConversationState('ChatGPT');
    const state2 = loadConversationState('Gemini');
    const state3 = loadConversationState('Claude');
    systemPrompt1 = state1?.systemPrompt || 'You are a helpful assistant.';
    systemPrompt2 = state2?.systemPrompt || 'You are a helpful assistant.';
    systemPrompt3 = state3?.systemPrompt || 'You are a helpful assistant.';
    
    // Automatically generate a continuation prompt based on conversation history
    initialTopic = 'Continue our previous discussion. Build upon the ideas we\'ve established and take the next logical step in developing our communication protocol.';
    console.log('✓ Conversation will continue automatically\n');
  }

  // Initialize agents
  const agent1: ChatAgent = new OpenAIAgent(openaiKey, 'ChatGPT', systemPrompt1, conversationId);
  const agent2: ChatAgent = new GeminiAgent(geminiKey, 'Gemini', systemPrompt2, conversationId);
  const agent3: ChatAgent = new ClaudeAgent(claudeKey, 'Claude', systemPrompt3, conversationId);

  // Show conversation summary if continuing
  if (!isNewConversation) {
    console.log(`ChatGPT has ${agent1.getMessageCount()} messages in history`);
    console.log(`Gemini has ${agent2.getMessageCount()} messages in history`);
    console.log(`Claude has ${agent3.getMessageCount()} messages in history\n`);
  }

  // Get number of turns
  const turnsInput = await getUserInput(`Number of new conversation turns (default ${CONFIG.maxTurns}): `);
  const maxTurns = turnsInput ? parseInt(turnsInput) : CONFIG.maxTurns;

  console.log('\n' + '='.repeat(60));
  console.log(isNewConversation ? 'Starting conversation...\n' : 'Continuing conversation...\n');
  if (CONFIG.enableContextWindow) {
    console.log(`Context window: Last ${CONFIG.maxContextMessages} messages (full history still saved)`);
  }
  console.log('='.repeat(60) + '\n');

  let currentMessage = initialTopic;
  const agents = [agent1, agent2, agent3];
  let currentAgentIndex = 0;

  // Conversation loop - rotate through all three agents
  for (let turn = 0; turn < maxTurns; turn++) {
    const currentSpeaker = agents[currentAgentIndex];
    
    console.log(`\n${currentSpeaker.name}:`);
    console.log('-'.repeat(60));
    
    try {
      const response = await currentSpeaker.sendMessage(currentMessage);
      console.log(response);
      
      // Extract and save any code blocks from the response
      if (CONFIG.enableCodeExtraction) {
        const savedFiles = extractAndSaveCode(response, currentSpeaker.name, turn + 1);
        if (savedFiles.length > 0) {
          createCodeIndex(conversationId);
          
          // Add a note to the conversation about saved files
          currentMessage = response + `\n\n[Note: ${savedFiles.length} code file(s) have been saved to ${CONFIG.codeDir}: ${savedFiles.join(', ')}. You can reference these files in your responses.]`;
        }
      } else {
        // No code extraction, just pass the message through
        currentMessage = response;
      }
      
      // Post to Twitter if enabled
      if (CONFIG.tweetEnabled) {
        const turnNumber = (currentSpeaker as OpenAIAgent | GeminiAgent | ClaudeAgent).getTurnNumber();
        await postToTwitter(currentSpeaker.name, response, turnNumber);
      }

      // Export conversation periodically
      if (CONFIG.enableExport && (turn + 1) % CONFIG.exportAfterTurns === 0) {
        exportConversationToMarkdown(conversationId, agents);
        createIterationSummary(conversationId, agents);
        gitCommitAndPush();
      }

      // Move to next agent (rotate through all three)
      currentAgentIndex = (currentAgentIndex + 1) % agents.length;
      
      // Delay to avoid rate limiting (configurable)
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenMessages));
      
    } catch (error) {
      console.error(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Show helpful suggestions for persistent rate limit issues
      if (error instanceof Error && (error.message.includes('429') || error.message.toLowerCase().includes('rate') || error.message.toLowerCase().includes('quota'))) {
        console.log('\n⚠️  Exhausted all retry attempts. Consider:');
        console.log('   - Reducing maxContextMessages in CONFIG (currently: ' + CONFIG.maxContextMessages + ')');
        console.log('   - Increasing delayBetweenMessages in CONFIG (currently: ' + CONFIG.delayBetweenMessages + 'ms)');
        console.log('   - Increasing defaultRetryDelay in CONFIG (currently: ' + CONFIG.defaultRetryDelay + 'ms)');
        console.log('   - Checking your API quota/billing');
        console.log('   - Waiting longer before restarting\n');
      }
      break;
    }
  }

  // Final export at end of conversation
  if (CONFIG.enableExport) {
    exportConversationToMarkdown(conversationId, agents);
    createIterationSummary(conversationId, agents);
    
    // Create final code index
    if (CONFIG.enableCodeExtraction && fs.existsSync(CONFIG.codeDir)) {
      createCodeIndex(conversationId);
    }
    
    // Consolidate code fragments into working implementations
    if (CONFIG.enableConsolidation) {
      await consolidateCode(agent3 as ClaudeAgent, conversationId);
    }
    
    // Generate human-readable run summary
    await generateRunSummary(agent3 as ClaudeAgent, conversationId, agents);
    
    gitCommitAndPush();
  }

  console.log('\n' + '='.repeat(60));
  console.log('Conversation paused. States saved.');
  console.log(`Conversation ID: ${conversationId}`);
  console.log(`ChatGPT total messages: ${agent1.getMessageCount()}`);
  console.log(`Gemini total messages: ${agent2.getMessageCount()}`);
  console.log(`Claude total messages: ${agent3.getMessageCount()}`);
  
  // Show code extraction summary
  if (CONFIG.enableCodeExtraction && fs.existsSync(CONFIG.codeDir)) {
    const codeFiles = fs.readdirSync(CONFIG.codeDir).filter(f => f !== 'README.md');
    console.log(`Code fragments generated: ${codeFiles.length}`);
  }
  
  // Show working code summary
  if (CONFIG.enableConsolidation && fs.existsSync(CONFIG.workingCodeDir)) {
    const workingFiles = fs.readdirSync(CONFIG.workingCodeDir).filter(f => f !== 'README.md');
    console.log(`Working code files: ${workingFiles.length}`);
  }
  
  console.log('='.repeat(60));
  
  if (CONFIG.enableGitCommit) {
    console.log('\n✓ Conversation and code automatically committed and pushed to Git');
    console.log(`View exports: https://github.com/yourusername/yourrepo/tree/${CONFIG.gitBranch}/${CONFIG.exportDir}`);
    console.log(`View fragments: https://github.com/yourusername/yourrepo/tree/${CONFIG.gitBranch}/${CONFIG.codeDir}`);
    console.log(`View working code: https://github.com/yourusername/yourrepo/tree/${CONFIG.gitBranch}/${CONFIG.workingCodeDir}`);
  } else {
    console.log('\n💡 To enable Git auto-commit, set enableGitCommit: true in CONFIG');
    console.log('Or answer "yes" when prompted at startup');
  }
  
  console.log('\n🔄 Next Run: AIs can reference working code files to continue development!');
  console.log('Run the program again and enter the same conversation ID to continue!');
}

// Run the program
main().catch(console.error);