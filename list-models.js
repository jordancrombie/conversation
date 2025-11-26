const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const genAI = new GoogleGenerativeAI('AIzaSyAPM8vrvIOjpSQmKttSNu6wUcrMaLC2_DQ');
  
  try {
    const models = await genAI.listModels();
    console.log('Available Gemini models:');
    models.forEach(model => {
      console.log(`- ${model.name}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

listModels();
