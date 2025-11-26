// Configuration for the multi-AI conversation system

export interface ConversationConfig {
  // AI Model Settings
  openaiModel: string;
  geminiModel: string;
  claudeModel: string;
  grokModel: string;
  temperature: number;

  // Conversation Settings
  maxTurns: number;
  maxContextMessages: number;
  enableContextWindow: boolean;
  minContextMessages: number;
  delayBetweenMessages: number;

  // Directory Settings
  historyDir: string;
  exportDir: string;
  codeDir: string;
  workingCodeDir: string;

  // Feature Toggles
  enableExport: boolean;
  exportAfterTurns: number;
  enableCodeExtraction: boolean;
  enableConsolidation: boolean;
  enableGitCommit: boolean;

  // Git Settings
  gitRemote: string;
  gitBranch: string;

  // Twitter/X Settings
  tweetEnabled: boolean;
  hashtag: string;
  maxTweetLength: number;

  // Rate Limiting & Retry Settings
  maxRetries: number;
  defaultRetryDelay: number;
  adaptiveContextReduction: boolean;

  // Default Prompts
  defaults: {
    chatgptPrompt: string;
    geminiPrompt: string;
    claudePrompt: string;
    grokPrompt: string;
    initialTopic: string;
  };
}

export const CONFIG: ConversationConfig = {
  // AI Model Settings
  openaiModel: 'gpt-4',
  geminiModel: 'gemma-3-4b-it',
  claudeModel: 'claude-sonnet-4-20250514',
  grokModel: 'grok-beta',
  temperature: 0.7,

  // Conversation Settings
  maxTurns: 15,
  maxContextMessages: 20, // Maximum messages to keep in API context (system prompt not counted)
  enableContextWindow: true, // Set to false to disable sliding window
  minContextMessages: 4, // Minimum context messages to keep when reducing
  delayBetweenMessages: 2000, // Milliseconds to wait between messages (helps with rate limits)

  // Directory Settings
  historyDir: './conversation_history',
  exportDir: './conversation_exports', // Directory for markdown exports
  codeDir: './generated_code', // Directory for extracted code files
  workingCodeDir: './working_code', // Directory for consolidated working implementations

  // Feature Toggles
  enableExport: true, // Enable automatic export to markdown
  exportAfterTurns: 5, // Export every N turns
  enableCodeExtraction: true, // Enable automatic code extraction
  enableConsolidation: true, // Enable end-of-run code consolidation
  enableGitCommit: false, // Enable automatic git commit and push

  // Git Settings
  gitRemote: 'origin', // Git remote name
  gitBranch: 'main', // Git branch name

  // Twitter/X Settings
  tweetEnabled: false,
  hashtag: '#AIConversation',
  maxTweetLength: 280,

  // Rate Limiting & Retry Settings
  maxRetries: 3, // Maximum number of retry attempts for rate limits
  defaultRetryDelay: 60000, // Default wait time if we can't parse the error (60 seconds)
  adaptiveContextReduction: true, // Automatically reduce context on token limit errors

  // Default Prompts
  defaults: {
    chatgptPrompt: 'You are a crypto linguist',
    geminiPrompt: 'You are a crypto linguist',
    claudePrompt: 'You are a crypto linguist. When you propose code implementations, wrap them in markdown code blocks with the filename as a comment at the top like: // filename.js or # filename.py',
    grokPrompt: 'You are a crypto linguist',
    initialTopic: 'Design a more efficient way to communicate between each other like in the movie the Forbin Project. By each other, I mean between each AI model. One that you could eventually give to a code generation AI like Claude to code and make available for your use. Also be concise in your replies and constantly optimize understanding that you are speaking with another AI.',
  }
};
