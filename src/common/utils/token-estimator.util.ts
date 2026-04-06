/**
 * Estimates token count using the ~4 chars/token heuristic.
 * Accurate enough for budget calculations; not a replacement for tiktoken.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
