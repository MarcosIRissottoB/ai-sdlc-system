import { requestContext, getCorrelationId, createCorrelationId } from '../request-context';

describe('RequestContext', () => {
  describe('createCorrelationId', () => {
    it('should return a UUID string', () => {
      const id = createCorrelationId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('should return unique values', () => {
      const ids = new Set(Array.from({ length: 100 }, () => createCorrelationId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('getCorrelationId', () => {
    it('should return undefined outside of a store context', () => {
      expect(getCorrelationId()).toBeUndefined();
    });

    it('should return the correlation ID inside a store context', () => {
      requestContext.run({ correlationId: 'test-id-123' }, () => {
        expect(getCorrelationId()).toBe('test-id-123');
      });
    });

    it('should isolate stores between concurrent runs', (done) => {
      let order = 0;

      requestContext.run({ correlationId: 'run-a' }, () => {
        setTimeout(() => {
          expect(getCorrelationId()).toBe('run-a');
          order++;
          if (order === 2) done();
        }, 10);
      });

      requestContext.run({ correlationId: 'run-b' }, () => {
        setTimeout(() => {
          expect(getCorrelationId()).toBe('run-b');
          order++;
          if (order === 2) done();
        }, 10);
      });
    });
  });
});
