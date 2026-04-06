import { estimateTokens } from '../token-estimator.util';

describe('estimateTokens', () => {
  it('should estimate tokens at ~4 chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });

  it('should round up for partial tokens', () => {
    expect(estimateTokens('abcde')).toBe(2); // 5/4 = 1.25 → 2
    expect(estimateTokens('a')).toBe(1); // 1/4 = 0.25 → 1
  });

  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should handle large texts', () => {
    const largeText = 'x'.repeat(400_000); // ~100K tokens
    expect(estimateTokens(largeText)).toBe(100_000);
  });
});
