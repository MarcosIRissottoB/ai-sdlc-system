import { Logger } from '@nestjs/common';
import { logPipelineStep, logPipelineError, createLogger } from '../logger.util';
import { requestContext } from '../../context/request-context';

describe('Logger Utilities', () => {
  let logger: Logger;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('TestContext');
    logSpy = jest.spyOn(logger, 'log').mockImplementation();
    errorSpy = jest.spyOn(logger, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('should return a Logger instance', () => {
      const result = createLogger('MyModule');
      expect(result).toBeInstanceOf(Logger);
    });
  });

  describe('logPipelineStep', () => {
    it('should log without correlation ID when outside request context', () => {
      logPipelineStep(logger, 'TEST_STEP', { key: 'value' });

      expect(logSpy).toHaveBeenCalledWith(
        '[PIPELINE:TEST_STEP] {"key":"value"}',
      );
    });

    it('should include correlation ID when inside request context', () => {
      requestContext.run({ correlationId: 'req-123' }, () => {
        logPipelineStep(logger, 'TEST_STEP', { key: 'value' });

        expect(logSpy).toHaveBeenCalledWith(
          '[req-123] [PIPELINE:TEST_STEP] {"key":"value"}',
        );
      });
    });
  });

  describe('logPipelineError', () => {
    it('should log error message without correlation ID when outside request context', () => {
      logPipelineError(logger, 'FAIL_STEP', new Error('something broke'));

      expect(errorSpy).toHaveBeenCalledWith(
        '[PIPELINE:FAIL_STEP] ERROR: something broke',
      );
    });

    it('should include correlation ID when inside request context', () => {
      requestContext.run({ correlationId: 'req-456' }, () => {
        logPipelineError(logger, 'FAIL_STEP', new Error('oops'));

        expect(errorSpy).toHaveBeenCalledWith(
          '[req-456] [PIPELINE:FAIL_STEP] ERROR: oops',
        );
      });
    });

    it('should handle non-Error objects', () => {
      logPipelineError(logger, 'FAIL_STEP', 'string error');

      expect(errorSpy).toHaveBeenCalledWith(
        '[PIPELINE:FAIL_STEP] ERROR: string error',
      );
    });
  });
});
