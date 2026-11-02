import dotenv from 'dotenv';
dotenv.config();

import { triggerOutboundCall, maskPhoneNumber, validateAndFormatIndianPhone } from './voice-agent.js';

async function main() {
  const phoneArg = process.argv[2];
  const isSimulate = process.argv.includes('--simulate');

  console.log('=== Sarvam Voice Agent: Instant Outbound Call Test ===\n');

  if (!phoneArg) {
    console.log('Usage:');
    console.log('  Live Call:       node test-voice-agent.js <10-DIGIT_INDIAN_MOBILE_NUMBER>');
    console.log('  Simulation Test: node test-voice-agent.js <10-DIGIT_INDIAN_MOBILE_NUMBER> --simulate\n');
    console.log('Example: node test-voice-agent.js 8484975595\n');
    process.exit(1);
  }

  const formatted = validateAndFormatIndianPhone(phoneArg);
  if (!formatted) {
    console.error('ERROR: Invalid phone number. Please enter a valid 10-digit Indian mobile number.');
    process.exit(1);
  }

  console.log(`Target Phone Number: ${maskPhoneNumber(formatted)} (masked for privacy)`);

  if (isSimulate) {
    console.log('\n[SIMULATION MODE] Simulating outbound call & webhook delivery...');
    const attemptId = `sim_attempt_${Date.now()}`;
    console.log(`Simulated Call Attempt ID: ${attemptId}`);

    // Trigger local webhook test
    const webhookPayload = {
      attempt_id: attemptId,
      status: 'connected',
      final_agent_variables: {
        citizen_verdict: 'CONFIRMED',
      },
      webhook_config: {
        metadata: {
          test: true,
        },
      },
    };

    try {
      const res = await fetch('http://localhost:5000/api/voice/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });
      const data = await res.json();
      console.log('Webhook response from server:', data);
      console.log('✓ Simulation complete! Webhook endpoint successfully parsed the call result.\n');
    } catch (e) {
      console.log('Server is not running on port 5000. Start it with `npm start` in another terminal.');
    }
    return;
  }

  console.log('Dispatching live instant outbound call via Sarvam Voice Agent API...');

  try {
    const res = await triggerOutboundCall({
      reportId: 'manual-test-report',
      phoneNumber: formatted,
      category: 'pothole',
      contractorName: 'Patil Civil Works',
      languageCode: 'mr-IN',
    });

    console.log('\nSUCCESS! Outbound call attempt initiated.');
    console.log('Attempt ID:', res.attempt_id);
    console.log(`Your phone (${maskPhoneNumber(formatted)}) will receive an automated call shortly.`);
  } catch (err) {
    console.error('\nCALL FAILED:\n' + err.message);
    console.log('\nTIP: If you have not created a Voice Agent app in Sarvam yet, test with:');
    console.log(`node test-voice-agent.js ${phoneArg} --simulate\n`);
  }
}

main();
