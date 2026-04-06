import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IngestTextDto } from '../ingest-text.dto';

describe('IngestTextDto', () => {
  const toDto = (plain: Record<string, unknown>) =>
    plainToInstance(IngestTextDto, plain);

  it('should accept valid text', async () => {
    const dto = toDto({ text: 'Some document content' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject empty text', async () => {
    const dto = toDto({ text: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject text exceeding 5MB', async () => {
    const dto = toDto({ text: 'a'.repeat(5_000_001) });
    const errors = await validate(dto);
    const textError = errors.find((e) => e.property === 'text');
    expect(textError).toBeDefined();
    expect(textError!.constraints).toHaveProperty('maxLength');
  });

  it('should accept text at exactly 5MB', async () => {
    const dto = toDto({ text: 'a'.repeat(5_000_000) });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject chunkSize below minimum', async () => {
    const dto = toDto({ text: 'content', chunkSize: 50 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
