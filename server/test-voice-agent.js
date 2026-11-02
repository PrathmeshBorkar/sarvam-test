import dotenv from 'dotenv';
dotenv.config();

import { triggerOutboundCall, maskPhoneNumber, validateAndFormatIndianPhone } from './voice-agent.js';

async function main() {
  const phoneArg = process.argv[2];

  console.log('=== Sarvam Voice Agent: Instant Outbound Call Test ===\n');

  if (!phoneArg) {
    console.log('Usage: node test-voice-agent.js <10-DIGIT_INDIAN_MOBILE_NUMBER>');
    console.log('Example: node test-voice-agent.js 9876543210\n');
    console.log('Make sure these environment variables are set in server/.env:');
    console.log('- SARVAM_VOICE_API_KEY');
    console.log('- SARVAM_ORG_ID');
    console.log('- SARVAM_WORKSPACE_ID');
    console.log('- SARVAM_AGENT_APP_ID');
    console.log('- PUBLIC_URL (e.g. your ngrok or cloudflared https URL)\n');
    process.exit(1);
  }

  const formatted = validateAndFormatIndianPhone(phoneArg);
  if (!formatted) {
    console.error('ERROR: Invalid phone number. Please enter a valid 10-digit Indian mobile number.');
    process.exit(1);
  }

  console.log(`Target Phone Number: ${maskPhoneNumber(formatted)} (masked for privacy)`);
  console.log('Dispatching instant outbound call via Sarvam Voice Agent API...');

  try {
    const res = await triggerOutboundCall({
      reportId: 'test-report-manual',
      phoneNumber: formatted,
      category: 'pothole',
      contractorName: 'Patil Civil Works',
      languageCode: 'mr-IN',
    });

    console.log('\nSUCCESS! Outbound call attempt initiated.');
    console.log('Attempt ID:', res.attempt_id);
    console.log(`Your phone (${maskPhoneNumber(formatted)}) will receive an automated call shortly.`);
  } catch (err) {
    console.error('\nCALL FAILED:', err.message);
  }
}

main();
