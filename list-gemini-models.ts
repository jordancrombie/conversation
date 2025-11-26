import * as readline from 'readline';

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

interface GeminiModel {
  name: string;
  displayName: string;
  description: string;
  supportedGenerationMethods: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

interface ModelsResponse {
  models: GeminiModel[];
}

async function listAvailableGeminiModels() {
  console.log('=== Gemini API - List Available Models ===\n');
  
  const apiKey = process.env.GEMINI_API_KEY || await getUserInput('Enter your Gemini API key: ');
  
  console.log('\nFetching available models from Gemini API...\n');
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json() as ModelsResponse;
    
    if (!data.models || data.models.length === 0) {
      console.log('No models found for this API key.');
      return;
    }

    console.log('='.repeat(80));
    console.log('AVAILABLE MODELS:');
    console.log('='.repeat(80));
    console.log();

    // Filter for models that support generateContent
    const contentGenerationModels = data.models.filter(model => 
      model.supportedGenerationMethods?.includes('generateContent')
    );

    if (contentGenerationModels.length === 0) {
      console.log('No models found that support generateContent.');
      return;
    }

    contentGenerationModels.forEach((model, index) => {
      // Extract just the model name (after "models/")
      const modelName = model.name.split('/')[1] || model.name;
      
      console.log(`${index + 1}. ${modelName}`);
      console.log(`   Display Name: ${model.displayName}`);
      console.log(`   Description: ${model.description}`);
      console.log(`   Supported Methods: ${model.supportedGenerationMethods.join(', ')}`);
      
      if (model.inputTokenLimit) {
        console.log(`   Input Token Limit: ${model.inputTokenLimit.toLocaleString()}`);
      }
      if (model.outputTokenLimit) {
        console.log(`   Output Token Limit: ${model.outputTokenLimit.toLocaleString()}`);
      }
      
      console.log();
    });

    console.log('='.repeat(80));
    console.log('TESTING MODEL ACCESS...');
    console.log('='.repeat(80));
    console.log();

    const workingModels: string[] = [];
    
    for (const model of contentGenerationModels) {
      const modelName = model.name.split('/')[1] || model.name;
      
      try {
        const testResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: 'Hello'
                }]
              }]
            })
          }
        );

        if (testResponse.ok) {
          console.log(`✓ ${modelName} - ACCESS CONFIRMED`);
          workingModels.push(modelName);
        } else {
          const errorData = await testResponse.json();
          console.log(`✗ ${modelName} - Failed: ${testResponse.status} ${testResponse.statusText}`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.log(`✗ ${modelName} - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log();
    console.log('='.repeat(80));
    console.log('MODEL NAMES YOU CAN USE:');
    console.log('='.repeat(80));
    
    if (workingModels.length > 0) {
      workingModels.forEach(model => {
        console.log(`  ${model}`);
      });
      console.log();
      console.log('Use any of these model names in your CONFIG.geminiModel setting.');
    } else {
      console.log('No working models found. You may have hit rate limits or need to check your API key.');
      console.log('Wait a few minutes and try again.');
    }
    
    console.log();
    
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error fetching models:', error.message);
    } else {
      console.error('Unknown error occurred');
    }
  }
}

listAvailableGeminiModels().catch(console.error);