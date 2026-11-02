import dotenv from 'dotenv';
dotenv.config();

import { chatCompletion } from './sarvam.js';

async function runTest(retry = 1) {
  console.log('Testing Sarvam AI Chat API connection (sarvam-105b)...');
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
    console.log('\n--- SARVAM AI RESPONSE ---');
    console.log('Model:', result?.model || 'sarvam-105b');
    console.log('Latency:', `${elapsed}ms`);
    console.log('Assistant content:', result?.choices?.[0]?.message?.content?.trim());
    console.log('---------------------------\n');
    console.log('SUCCESS: First API call to Sarvam AI succeeded!');
  } catch (error) {
    if (retry > 0) {
      console.warn(`Initial call timed out or reset (${error.message}). Retrying...`);
      return runTest(retry - 1);
    }
    console.error('ERROR: Sarvam API test failed:', error.message);
    if (error.cause) {
      console.error('Error cause:', error.cause);
    }
    process.exit(1);
  }
}

runTest();
