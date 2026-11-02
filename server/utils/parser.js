/**
 * Safely parses JSON returned from LLMs by finding the text between the first '{' and last '}'
 */
export function extractAndParseJSON(rawText, fallback = {}) {
  if (!rawText || typeof rawText !== 'string') {
    return fallback;
  }

  try {
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return fallback;
    }

    const jsonString = rawText.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonString);
    return parsed;
  } catch (err) {
    console.warn('[JSON Parser] Failed to parse JSON from LLM response:', err.message);
    return fallback;
  }
}
