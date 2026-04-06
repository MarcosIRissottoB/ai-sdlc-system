import { ZodSchema, ZodError } from 'zod';
import { Logger } from '@nestjs/common';

const logger = new Logger('LlmJsonParser');

/**
 * Extrae y valida JSON de la respuesta de un LLM.
 *
 * 1. Limpia markdown fences (```json ... ```)
 * 2. Extrae el primer objeto o array JSON encontrado
 * 3. Parsea con JSON.parse
 * 4. Valida contra un schema Zod
 *
 * Retorna null si algún paso falla (el caller decide el fallback).
 */
export function safeParseLlmJson<T>(text: string, schema: ZodSchema<T>): T | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const jsonStr = extractJson(cleaned);
    if (!jsonStr) {
      logger.warn('No JSON found in LLM response');
      return null;
    }

    const parsed: unknown = JSON.parse(jsonStr);
    const result = schema.safeParse(parsed);

    if (!result.success) {
      logger.warn(`Zod validation failed: ${formatZodError(result.error)}`);
      return null;
    }

    return result.data;
  } catch (error) {
    logger.warn(`LLM JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function stripMarkdownFences(text: string): string {
  return text.replace(/```(?:json)?\s*\n?([\s\S]*?)```/g, '$1').trim();
}

function extractJson(text: string): string | null {
  // Try array first, then object
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  const objectMatch = text.match(/\{[\s\S]*\}/);

  if (arrayMatch && objectMatch) {
    // Return whichever starts first in the text
    return arrayMatch.index! < objectMatch.index! ? arrayMatch[0] : objectMatch[0];
  }

  return arrayMatch?.[0] ?? objectMatch?.[0] ?? null;
}

function formatZodError(error: ZodError): string {
  return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
}
