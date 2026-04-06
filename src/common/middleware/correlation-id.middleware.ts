import { Injectable, NestMiddleware } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { requestContext, createCorrelationId } from '../context/request-context';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const correlationId =
      (req.headers['x-request-id'] as string) || createCorrelationId();
    res.setHeader('x-request-id', correlationId);
    requestContext.run({ correlationId }, next);
  }
}
