import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    const apiKey = this.configService.get<string>('API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'API_KEY is not configured — all endpoints are unprotected. ' +
          'Set API_KEY in .env to enable authentication.',
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const apiKey = request.headers['x-api-key'];
    const validKey = this.configService.get<string>('API_KEY');

    if (!validKey) return true;

    if (!apiKey || !this.timingSafeCompare(apiKey, validKey)) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }

  private timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Compare against self to keep constant time regardless of length mismatch
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
