/**
 * Sanitizes chunk content before interpolation into LLM prompts.
 * Defends against indirect prompt injection from ingested documents.
 *
 * Strategy: escape structural delimiters that could break prompt boundaries,
 * without modifying the semantic content of the chunk.
 */
export function sanitizeChunkForPrompt(content: string, maxLength = 2000): string {
  let sanitized = content.substring(0, maxLength);

  // Escape XML-like tags that match our prompt delimiters
  sanitized = sanitized
    .replace(/<\/?user_query>/gi, '&lt;user_query&gt;')
    .replace(/<\/?system>/gi, '&lt;system&gt;')
    .replace(/<\/?assistant>/gi, '&lt;assistant&gt;')
    .replace(/<\/?instruction>/gi, '&lt;instruction&gt;');

  // Strip role-switching patterns (multi-language)
  sanitized = sanitized
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '[REMOVED]')
    .replace(/ignor[aá]\s+(todas?\s+)?(las?\s+)?instrucciones?\s+anteriores?/gi, '[REMOVED]')
    .replace(/you\s+are\s+now/gi, '[REMOVED]')
    .replace(/ahora\s+(sos|eres|actua\s+como)/gi, '[REMOVED]')
    .replace(/system\s*:\s*/gi, '[REMOVED]')
    .replace(/\bnew\s+instructions?\s*:/gi, '[REMOVED]')
    .replace(/\bnuevas?\s+instrucciones?\s*:/gi, '[REMOVED]')
    .replace(/\bforget\s+(all|everything|prior)\b/gi, '[REMOVED]')
    .replace(/\bolvid[aá]\s+(todo|anterior)\b/gi, '[REMOVED]')
    .replace(/\boverride\b/gi, '[REMOVED]')
    .replace(/\bDISREGARD\b/gi, '[REMOVED]');

  return sanitized;
}
