import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const CONFIG = {
  openaiModel: 'gpt-4',
  geminiModel: 'gemma-3-4b-it',
  maxTurns: 10,
  temperature: 0.7,
  historyDir: './conversation_history',
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

// Ensure history directory exists
function ensureHistoryDir() {
  if (!fs.existsSync(CONFIG.historyDir)) {
    fs.mkdirSync(CONFIG.historyDir, { recursive: true });
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

abstract class ChatAgent {
  protected messages: Message[] = [];
  public name: string;
  protected systemPrompt: string;
  protected conversationId: string;

  constructor(name: string, systemPrompt: string, conversationId: string) {
    this.name = name;
    this.systemPrompt = systemPrompt;
    this.conversationId = conversationId;
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

    const completion = await this.client.chat.completions.create({
      model: CONFIG.openaiModel,
      messages: this.messages,
      temperature: CONFIG.temperature,
    });

    const response = completion.choices[0].message.content || '';
    
    this.messages.push({
      role: 'assistant',
      content: response,
    });

    this.saveState();
    return response;
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
    // Convert messages to Gemini format
    const history = [];
    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];
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
    }

    this.chat = this.model.startChat({
      history: history,
      generationConfig: {
        temperature: CONFIG.temperature,
        maxOutputTokens: 1024,
      },
    });
  }

  async sendMessage(userMessage: string): Promise<string> {
    // Prepend system prompt context to first message only
    const messageToSend = this.messages.length === 0 
      ? `${this.systemPrompt}\n\n${userMessage}`
      : userMessage;

    this.messages.push({
      role: 'user',
      content: userMessage,
    });

    const result = await this.chat.sendMessage(messageToSend);
    const response = result.response.text();
    
    this.messages.push({
      role: 'assistant',
      content: response,
    });

    this.saveState();
    return response;
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
  console.log('=== ChatGPT vs Gemini Conversation (with Memory) ===\n');

  // Check for existing conversations
  const existingConvos = listConversationHistories();
  
  let conversationId: string;
  let isNewConversation = true;
  
  if (existingConvos.length > 0) {
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
  } else {
    conversationId = `conv_${Date.now()}`;
    console.log(`Starting new conversation (ID: ${conversationId})\n`);
  }

  // Get API keys
  const openaiKey = process.env.OPENAI_API_KEY || await getUserInput('Enter OpenAI API key: ');
  const geminiKey = process.env.GEMINI_API_KEY || await getUserInput('Enter Gemini API key: ');

  let systemPrompt1: string;
  let systemPrompt2: string;

  if (isNewConversation) {
    // Get system prompts for new conversation
    console.log('\nDefine the personalities:\n');
    systemPrompt1 = await getUserInput('System prompt for ChatGPT (e.g., "You are an optimistic philosopher"): ');
    systemPrompt2 = await getUserInput('System prompt for Gemini (e.g., "You are a pragmatic scientist"): ');
  } else {
    // Use existing system prompts
    console.log('\nLoading existing personalities...\n');
    const state1 = loadConversationState('ChatGPT');
    const state2 = loadConversationState('Gemini');
    systemPrompt1 = state1?.systemPrompt || 'You are a helpful assistant.';
    systemPrompt2 = state2?.systemPrompt || 'You are a helpful assistant.';
  }

  // Initialize agents
  const agent1: ChatAgent = new OpenAIAgent(openaiKey, 'ChatGPT', systemPrompt1, conversationId);
  const agent2: ChatAgent = new GeminiAgent(geminiKey, 'Gemini', systemPrompt2, conversationId);

  // Show conversation summary if continuing
  if (!isNewConversation) {
    console.log(`ChatGPT has ${agent1.getMessageCount()} messages in history`);
    console.log(`Gemini has ${agent2.getMessageCount()} messages in history\n`);
  }

  // Get initial topic or continuation
  let initialTopic: string;
  if (isNewConversation) {
    initialTopic = await getUserInput('\nWhat should they discuss? ');
  } else {
    initialTopic = await getUserInput('\nContinue with what topic? ');
  }

  // Get number of turns
  const turnsInput = await getUserInput(`Number of new conversation turns (default ${CONFIG.maxTurns}): `);
  const maxTurns = turnsInput ? parseInt(turnsInput) : CONFIG.maxTurns;

  console.log('\n' + '='.repeat(60));
  console.log(isNewConversation ? 'Starting conversation...\n' : 'Continuing conversation...\n');
  console.log('='.repeat(60) + '\n');

  let currentMessage = initialTopic;
  let currentSpeaker: ChatAgent = agent1;
  let currentListener: ChatAgent = agent2;

  // Conversation loop
  for (let turn = 0; turn < maxTurns; turn++) {
    console.log(`\n${currentSpeaker.name}:`);
    console.log('-'.repeat(60));
    
    try {
      const response = await currentSpeaker.sendMessage(currentMessage);
      console.log(response);
      
      currentMessage = response;

      // Swap speakers
      [currentSpeaker, currentListener] = [currentListener, currentSpeaker];
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
      break;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Conversation paused. States saved.');
  console.log(`Conversation ID: ${conversationId}`);
  console.log(`ChatGPT total messages: ${agent1.getMessageCount()}`);
  console.log(`Gemini total messages: ${agent2.getMessageCount()}`);
  console.log('='.repeat(60));
  console.log('\nRun the program again and enter the same conversation ID to continue!');
}

// Run the program
main().catch(console.error);