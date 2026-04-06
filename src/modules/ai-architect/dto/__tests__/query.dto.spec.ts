import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { QueryDto } from '../query.dto';

describe('QueryDto', () => {
  const toDto = (plain: Record<string, unknown>) =>
    plainToInstance(QueryDto, plain);

  it('should accept a valid query', async () => {
    const dto = toDto({ query: '¿Qué es RAG?' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject empty query', async () => {
    const dto = toDto({ query: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject query exceeding 10000 characters', async () => {
    const dto = toDto({ query: 'a'.repeat(10001) });
    const errors = await validate(dto);
    const maxLengthError = errors.find((e) => e.property === 'query');
    expect(maxLengthError).toBeDefined();
    expect(maxLengthError!.constraints).toHaveProperty('maxLength');
  });

  it('should accept query at exactly 10000 characters', async () => {
    const dto = toDto({ query: 'a'.repeat(10000) });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject domain exceeding 100 characters', async () => {
    const dto = toDto({ query: 'valid', domain: 'x'.repeat(101) });
    const errors = await validate(dto);
    const domainError = errors.find((e) => e.property === 'domain');
    expect(domainError).toBeDefined();
    expect(domainError!.constraints).toHaveProperty('maxLength');
  });

  it('should accept valid optional parameters', async () => {
    const dto = toDto({
      query: 'test',
      topK: 5,
      scoreThreshold: 0.5,
      useHybrid: true,
      domain: 'general',
      mode: 'qa',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid mode', async () => {
    const dto = toDto({ query: 'test', mode: 'invalid' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
