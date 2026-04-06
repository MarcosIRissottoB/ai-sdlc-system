import { Logger } from '@nestjs/common';
import { getCorrelationId } from '../context/request-context';

export function createLogger(context: string): Logger {
  return new Logger(context);
}

function formatPrefix(step: string): string {
  const correlationId = getCorrelationId();
  return correlationId
    ? `[${correlationId}] [PIPELINE:${step}]`
    : `[PIPELINE:${step}]`;
}

export function logPipelineStep(
  logger: Logger,
  step: string,
  details: Record<string, unknown>,
): void {
  logger.log(`${formatPrefix(step)} ${JSON.stringify(details)}`);
}

export function logPipelineError(
  logger: Logger,
  step: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`${formatPrefix(step)} ERROR: ${message}`);
}
