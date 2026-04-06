import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from '../api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let configService: { get: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  const makeContext = (apiKey?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue('valid-key-123') };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    guard = new ApiKeyGuard(
      configService as unknown as ConfigService,
      reflector as unknown as Reflector,
    );
  });

  it('should allow request with valid API key', () => {
    const ctx = makeContext('valid-key-123');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject request without API key', () => {
    const ctx = makeContext();
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject request with invalid API key', () => {
    const ctx = makeContext('wrong-key');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should allow all requests when API_KEY is not configured (local dev mode)', () => {
    configService.get.mockReturnValue(undefined);
    const ctx = makeContext(); // no API key needed
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should bypass auth when endpoint is marked @Public()', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const ctx = makeContext(); // no API key
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should not bypass auth when endpoint is not @Public()', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const ctx = makeContext(); // no API key
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
