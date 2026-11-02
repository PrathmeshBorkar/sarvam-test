import dotenv from 'dotenv';
dotenv.config();

const SARVAM_APPS_BASE_URL = 'https://apps.sarvam.ai/api';

/**
 * Mask a phone number to protect citizen privacy in logs.
 * Example: +919876543210 -> +91 ******3210
 */
export function maskPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const clean = phone.trim();
  if (clean.length < 4) return '****';
  const last4 = clean.slice(-4);
  return `******${last4}`;
}

/**
 * Validates a 10-digit Indian mobile number
 * Returns formatted E.164 string (+91XXXXXXXXXX) or null if invalid
 */
export function validateAndFormatIndianPhone(input) {
  if (!input) return null;
  // Strip non-digits
  const digits = String(input).replace(/\D/g, '');
  
  // Accept 10 digits starting with 6, 7, 8, or 9
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }
  // Accept 12 digits starting with 91 followed by 6-9
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2))) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Trigger an Instant Outbound Call via Sarvam Voice Agents API
 * Ref: docs.sarvam.ai/voice-agents/api/instant-outbound/create.md
 */
export async function triggerOutboundCall({ reportId, phoneNumber, category, contractorName, languageCode }) {
  const apiKey = process.env.SARVAM_VOICE_API_KEY || process.env.SARVAM_API_KEY;
  const orgId = process.env.SARVAM_ORG_ID;
  const workspaceId = process.env.SARVAM_WORKSPACE_ID;
  const appId = process.env.SARVAM_AGENT_APP_ID;
  const publicUrl = process.env.PUBLIC_URL || process.env.WEB_ORIGIN;

  const formattedPhone = validateAndFormatIndianPhone(phoneNumber);
  if (!formattedPhone) {
    throw new Error('Invalid phone number format. Must be a 10-digit Indian mobile number.');
  }

  // If Voice Agent IDs are not yet filled in .env, provide an informative error guide
  if (!orgId || !workspaceId || !appId) {
    const missing = [];
    if (!orgId) missing.push('SARVAM_ORG_ID');
    if (!workspaceId) missing.push('SARVAM_WORKSPACE_ID');
    if (!appId) missing.push('SARVAM_AGENT_APP_ID');

    throw new Error(
      `Sarvam Voice Agent variables missing in server/.env: [${missing.join(', ')}].\n` +
      `To get these:\n` +
      `1. Log in to https://apps.sarvam.ai and open your Voice Agent app.\n` +
      `2. Your browser URL shows: https://apps.sarvam.ai/orgs/{ORG_ID}/workspaces/{WORKSPACE_ID}/apps/{APP_ID}\n` +
      `3. Paste those 3 IDs into server/.env.`
    );
  }

  const endpoint = `${SARVAM_APPS_BASE_URL}/outbounds/v1/orgs/${orgId}/workspaces/${workspaceId}/outbounds`;
  
  const payload = {
    app_config: {
      app_id: appId,
      app_version: 1,
      app_variables: {
        category: category || 'civic issue',
        contractor: contractorName || 'Assigned Contractor',
        language_code: languageCode || 'hi-IN',
      },
    },
    user_config: {
      user_phone_number: formattedPhone,
    },
    webhook_config: {
      url: `${publicUrl}/api/voice/webhook`,
      metadata: {
        report_id: reportId,
      },
    },
  };

  console.log(`[Voice Agent] Triggering instant outbound call for report ${reportId} to ${maskPhoneNumber(formattedPhone)}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam Outbound API failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  // Response returns { attempt_id: "..." }
  return {
    attempt_id: data.attempt_id,
  };
}
