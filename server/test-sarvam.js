import dotenv from 'dotenv';
dotenv.config();

import { chatCompletion } from './sarvam.js';

async function runTest() {
  console.log('Testing Sarvam AI Chat API connection with max_tokens: 1000...');
  try {
    const startTime = Date.now();
    const result = await chatCompletion([
      {
        role: 'user',
        content: 'You are an Indian civic assistant. In one short sentence, confirm that the Sarvam AI system is operational.',
      },
    ], {
      model: 'sarvam-105b',
      max_tokens: 1000,
    });

    const elapsed = Date.now() - startTime;
    console.log('\n--- FULL SARVAM AI RESPONSE OBJECT ---');
    console.log(JSON.stringify(result, null, 2));
    console.log('\nLatency:', `${elapsed}ms`);
    console.log('Assistant content:', result?.choices?.[0]?.message?.content);
  } catch (error) {
    console.error('ERROR: Sarvam API test failed:', error.message);
    process.exit(1);
  }
}

runTest();
