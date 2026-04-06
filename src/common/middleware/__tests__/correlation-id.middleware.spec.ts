import { CorrelationIdMiddleware } from '../correlation-id.middleware';
import { getCorrelationId } from '../../context/request-context';
import { IncomingMessage, ServerResponse } from 'http';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  function createMockReqRes(headers: Record<string, string> = {}): {
    req: IncomingMessage;
    res: ServerResponse;
  } {
    const req = { headers } as unknown as IncomingMessage;
    const resHeaders: Record<string, string> = {};
    const res = {
      setHeader: (key: string, value: string) => {
        resHeaders[key] = value;
      },
      getHeader: (key: string) => resHeaders[key],
    } as unknown as ServerResponse;
    return { req, res };
  }

  it('should generate a correlation ID when x-request-id header is absent', (done) => {
    const { req, res } = createMockReqRes();

    middleware.use(req, res, () => {
      const id = getCorrelationId();
      expect(id).toBeDefined();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(res.getHeader('x-request-id')).toBe(id);
      done();
    });
  });

  it('should use the x-request-id header when provided', (done) => {
    const { req, res } = createMockReqRes({ 'x-request-id': 'custom-id-abc' });

    middleware.use(req, res, () => {
      expect(getCorrelationId()).toBe('custom-id-abc');
      expect(res.getHeader('x-request-id')).toBe('custom-id-abc');
      done();
    });
  });

  it('should set the correlation ID in the response header', (done) => {
    const { req, res } = createMockReqRes();

    middleware.use(req, res, () => {
      const responseId = res.getHeader('x-request-id');
      expect(responseId).toBeDefined();
      expect(responseId).toBe(getCorrelationId());
      done();
    });
  });
});
