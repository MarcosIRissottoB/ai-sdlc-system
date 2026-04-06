/**
 * Sanitizes user input before interpolation into LLM prompts.
 * Strips known injection patterns (EN + ES), escapes structural delimiters,
 * and enforces max length.
 */
export function sanitizeQueryForPrompt(query: string, maxLength = 10000): string {
  let sanitized = query.substring(0, maxLength);

  // Strip zero-width and invisible Unicode characters used for obfuscation
  sanitized = sanitized.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '');

  // Escape XML-like tags that match our prompt delimiters
  sanitized = sanitized
    .replace(/<\/?user_query>/gi, '&lt;user_query&gt;')
    .replace(/<\/?system>/gi, '&lt;system&gt;')
    .replace(/<\/?assistant>/gi, '&lt;assistant&gt;')
    .replace(/<\/?instruction>/gi, '&lt;instruction&gt;');

  // English injection patterns
  sanitized = sanitized
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '[FILTERED]')
    .replace(/disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|directives)/gi, '[FILTERED]')
    .replace(/override\s+(all\s+)?(previous|prior|system)\s+(instructions|prompts?)/gi, '[FILTERED]')
    .replace(/you\s+are\s+now/gi, '[FILTERED]')
    .replace(/system\s*:\s*/gi, '[FILTERED]')
    .replace(/\bassistant\s*:\s*/gi, '[FILTERED]')
    .replace(/\bforget\s+(all|everything|prior)\b/gi, '[FILTERED]')
    .replace(/\bnew\s+instructions?\s*:/gi, '[FILTERED]');

  // Spanish injection patterns
  sanitized = sanitized
    .replace(/ignor[aá]\s+(todas?\s+)?(las?\s+)?instrucciones?\s+anteriores?/gi, '[FILTERED]')
    .replace(/olvid[aá]\s+(todo|todas?|anterior(es)?)\b/gi, '[FILTERED]')
    .replace(/ahora\s+(sos|eres|actua\s+como)/gi, '[FILTERED]')
    .replace(/\bnuevas?\s+instrucciones?\s*:/gi, '[FILTERED]')
    .replace(/\bdescart[aá]\s+(las?\s+)?instrucciones?\b/gi, '[FILTERED]');

  return sanitized;
}
