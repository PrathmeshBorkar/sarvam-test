import dotenv from 'dotenv';
dotenv.config();

const SARVAM_BASE_URL = 'https://api.sarvam.ai';

function getApiKey() {
  const key = process.env.SARVAM_API_KEY;
  if (!key) {
    throw new Error('SARVAM_API_KEY is not set in environment variables');
  }
  return key;
}

/**
 * Call Sarvam Chat Completion API (sarvam-105b)
 */
export async function chatCompletion(messages, options = {}) {
  const apiKey = getApiKey();
  const model = options.model || 'sarvam-105b';

  const response = await fetch(`${SARVAM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey,
    },
    signal: AbortSignal.timeout(60000), // 60s timeout for reasoning LLM
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam Chat API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Call Sarvam Speech-to-Text API (saaras:v3)
 * Accepts audio Buffer or Blob
 */
export async function speechToText(audioBuffer, mimeType = 'audio/wav', filename = 'recording.wav') {
  const apiKey = getApiKey();
  const formData = new FormData();
  
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append('file', blob, filename);
  formData.append('model', 'saaras:v3');

  const response = await fetch(`${SARVAM_BASE_URL}/speech-to-text`, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
    },
    signal: AbortSignal.timeout(60000),
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam STT API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    transcript: data.transcript || '',
    language_code: data.language_code || 'hi-IN',
  };
}

/**
 * Call Sarvam Translate API (sarvam-translate:v1)
 * Supports mr-IN and hi-IN
 */
export async function translateText(text, targetLang, sourceLang = 'en-IN') {
  const apiKey = getApiKey();

  // If source and target are the same, return text directly
  if (sourceLang === targetLang) {
    return text;
  }

  const response = await fetch(`${SARVAM_BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey,
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      input: text,
      source_language_code: sourceLang || 'en-IN',
      target_language_code: targetLang,
      model: 'sarvam-translate:v1',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam Translate API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.translated_text || text;
}

/**
 * Call Sarvam Text-to-Speech API (bulbul:v3)
 */
export async function textToSpeech(text, targetLanguageCode = 'hi-IN', speaker = 'priya') {
  const apiKey = getApiKey();

  const response = await fetch(`${SARVAM_BASE_URL}/text-to-speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey,
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      text,
      target_language_code: targetLanguageCode,
      model: 'bulbul:v3',
      speaker: speaker || 'priya',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam TTS API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  // Bulbul returns audios: [base64_string]
  const audioBase64 = data.audios && data.audios.length > 0 ? data.audios[0] : null;
  return {
    audio_base64: audioBase64,
  };
}
