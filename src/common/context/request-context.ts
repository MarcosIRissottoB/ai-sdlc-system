import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

interface RequestStore {
  correlationId: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function getCorrelationId(): string | undefined {
  return requestContext.getStore()?.correlationId;
}

export function createCorrelationId(): string {
  return randomUUID();
}
