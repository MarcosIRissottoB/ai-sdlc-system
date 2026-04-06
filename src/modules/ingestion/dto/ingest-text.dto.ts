import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray, Min, MaxLength, Matches, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class IngestTextDto {
  @ApiProperty({ description: 'Contenido del documento a ingestar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5_000_000)
  text!: string;

  @ApiPropertyOptional({ description: 'Título del documento' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Fuente del documento (URL, nombre de archivo, etc.)' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Tipo de contenido', default: 'text/plain' })
  @IsOptional()
  @IsString()
  contentType?: string;

  @ApiPropertyOptional({ description: 'Tamaño de cada chunk en caracteres', default: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(100)
  chunkSize?: number;

  @ApiPropertyOptional({ description: 'Superposición entre chunks', default: 200 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  chunkOverlap?: number;

  @ApiPropertyOptional({
    description: 'Dominio/colección del knowledge base. Permite organizar por tema (ej: embeddings, rag, agents)',
    default: 'general',
    example: 'rag',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9_-]+$/i, { message: 'domain must contain only alphanumeric characters, hyphens, and underscores' })
  domain?: string;

  @ApiPropertyOptional({
    description: 'Si true, elimina el documento existente con el mismo source y reingestsa desde cero',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class IngestUrlDto {
  @ApiProperty({ description: 'URL del documento a ingestar' })
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiPropertyOptional({ description: 'Título del documento' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Renderizar JavaScript con Playwright antes de extraer texto. Necesario para SPAs (OpenAI docs, Vercel, etc.). Requiere: npm install playwright && npx playwright install chromium',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  renderJs?: boolean;
}

export class BulkUrlEntry {
  @ApiProperty({ description: 'URL de la página de documentación', example: 'https://platform.openai.com/docs/guides/vision' })
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiPropertyOptional({ description: 'Título descriptivo', example: 'OpenAI Vision Guide' })
  @IsOptional()
  @IsString()
  title?: string;
}

export class IngestBulkUrlsDto {
  @ApiProperty({
    description: 'Lista de URLs a ingestar',
    type: [BulkUrlEntry],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BulkUrlEntry)
  urls!: BulkUrlEntry[];

  @ApiPropertyOptional({
    description: 'Dominio para todas las URLs',
    default: 'general',
    example: 'openai-docs',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9_-]+$/i, { message: 'domain must contain only alphanumeric characters, hyphens, and underscores' })
  domain?: string;

  @ApiPropertyOptional({
    description: 'Si true, re-ingesta documentos que ya existen',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
