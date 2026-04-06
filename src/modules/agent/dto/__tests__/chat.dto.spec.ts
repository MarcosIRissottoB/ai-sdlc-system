import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ChatDto } from '../chat.dto';

describe('ChatDto', () => {
  const toDto = (plain: Record<string, unknown>) =>
    plainToInstance(ChatDto, plain);

  it('should accept a valid message', async () => {
    const dto = toDto({ message: 'Hola, ¿cómo funciona el chunking?' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject empty message', async () => {
    const dto = toDto({ message: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject message exceeding 2000 characters', async () => {
    const dto = toDto({ message: 'a'.repeat(2001) });
    const errors = await validate(dto);
    const msgError = errors.find((e) => e.property === 'message');
    expect(msgError).toBeDefined();
    expect(msgError!.constraints).toHaveProperty('maxLength');
  });

  it('should accept message at exactly 2000 characters', async () => {
    const dto = toDto({ message: 'a'.repeat(2000) });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject domain exceeding 100 characters', async () => {
    const dto = toDto({ message: 'valid', domain: 'x'.repeat(101) });
    const errors = await validate(dto);
    const domainError = errors.find((e) => e.property === 'domain');
    expect(domainError).toBeDefined();
    expect(domainError!.constraints).toHaveProperty('maxLength');
  });

  it('should accept valid optional sessionId', async () => {
    const dto = toDto({ message: 'test', sessionId: 'clx123' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
