import { AllExceptionsFilter } from '../all-exceptions.filter';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { requestContext } from '../../context/request-context';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockSend = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus }),
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should return 500 for unknown errors', () => {
    filter.catch(new Error('unexpected'), mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        timestamp: expect.any(String),
      }),
    );
  });

  it('should return the correct status for HttpException', () => {
    filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Not found',
      }),
    );
  });

  it('should include correlationId in response when inside request context', () => {
    requestContext.run({ correlationId: 'corr-789' }, () => {
      filter.catch(new Error('fail'), mockHost);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-789',
        }),
      );
    });
  });

  it('should not include correlationId when outside request context', () => {
    filter.catch(new Error('fail'), mockHost);

    const body = mockSend.mock.calls[0][0];
    expect(body).not.toHaveProperty('correlationId');
  });

  it('should handle HttpException with object response', () => {
    const exception = new HttpException(
      { message: 'Validation failed', errors: ['field required'] },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Validation failed',
      }),
    );
  });

  it('should handle non-Error exceptions', () => {
    filter.catch('string error', mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
    );
  });
});
