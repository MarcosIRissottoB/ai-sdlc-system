import { z } from 'zod';
import { safeParseLlmJson } from '../llm-json.util';

const stringArraySchema = z.array(z.string());
const objectSchema = z.object({
  decision: z.string(),
  score: z.number(),
});

describe('safeParseLlmJson', () => {
  describe('valid JSON extraction', () => {
    it('should parse a plain JSON array', () => {
      const result = safeParseLlmJson('["a", "b", "c"]', stringArraySchema);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should parse a plain JSON object', () => {
      const result = safeParseLlmJson('{"decision": "use X", "score": 9}', objectSchema);
      expect(result).toEqual({ decision: 'use X', score: 9 });
    });

    it('should extract JSON surrounded by text', () => {
      const text = 'Here is the result:\n["foo", "bar"]\nHope this helps!';
      const result = safeParseLlmJson(text, stringArraySchema);
      expect(result).toEqual(['foo', 'bar']);
    });

    it('should extract JSON from markdown fences', () => {
      const text = '```json\n["one", "two"]\n```';
      const result = safeParseLlmJson(text, stringArraySchema);
      expect(result).toEqual(['one', 'two']);
    });

    it('should extract JSON from fences without language tag', () => {
      const text = '```\n{"decision": "yes", "score": 10}\n```';
      const result = safeParseLlmJson(text, objectSchema);
      expect(result).toEqual({ decision: 'yes', score: 10 });
    });

    it('should handle JSON with surrounding whitespace', () => {
      const text = '\n\n  ["x"]  \n\n';
      const result = safeParseLlmJson(text, stringArraySchema);
      expect(result).toEqual(['x']);
    });
  });

  describe('invalid input handling', () => {
    it('should return null for empty string', () => {
      expect(safeParseLlmJson('', stringArraySchema)).toBeNull();
    });

    it('should return null for text with no JSON', () => {
      expect(safeParseLlmJson('No JSON here, just text.', stringArraySchema)).toBeNull();
    });

    it('should return null for malformed JSON', () => {
      expect(safeParseLlmJson('{"broken: true}', objectSchema)).toBeNull();
    });

    it('should return null for truncated JSON', () => {
      expect(safeParseLlmJson('["a", "b", "c"', stringArraySchema)).toBeNull();
    });
  });

  describe('Zod validation', () => {
    it('should return null when JSON does not match schema', () => {
      // Valid JSON but wrong type (object instead of array)
      const result = safeParseLlmJson('{"key": "value"}', stringArraySchema);
      expect(result).toBeNull();
    });

    it('should return null when array has wrong element types', () => {
      const result = safeParseLlmJson('[1, 2, 3]', stringArraySchema);
      expect(result).toBeNull();
    });

    it('should return null when required fields are missing', () => {
      const result = safeParseLlmJson('{"decision": "yes"}', objectSchema);
      expect(result).toBeNull();
    });

    it('should apply defaults from schema', () => {
      const schemaWithDefaults = z.object({
        name: z.string(),
        value: z.number().default(0),
      });
      const result = safeParseLlmJson('{"name": "test"}', schemaWithDefaults);
      expect(result).toEqual({ name: 'test', value: 0 });
    });
  });

  describe('priority: array vs object', () => {
    it('should return whichever JSON appears first in text', () => {
      const textArrayFirst = 'Result: ["a"] and also {"x": 1}';
      const result = safeParseLlmJson(textArrayFirst, stringArraySchema);
      expect(result).toEqual(['a']);
    });
  });
});
