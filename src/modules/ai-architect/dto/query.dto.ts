import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { QueryMode } from '../../../common/types/rag.types';

export class QueryDto {
  @ApiProperty({
    description: 'Consulta técnica para el AI Engineer',
    example: '¿Qué estrategia de chunking es mejor para documentos técnicos largos?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  query!: string;

  @ApiPropertyOptional({
    description: 'Número máximo de documentos a recuperar',
    default: 15,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  topK?: number;

  @ApiPropertyOptional({
    description: 'Umbral mínimo de relevancia (0-1)',
    default: 0.3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  scoreThreshold?: number;

  @ApiPropertyOptional({
    description: 'Activar retrieval híbrido (vector + keyword BM25). Default: true',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  useHybrid?: boolean;

  @ApiPropertyOptional({
    description: 'Activar multi-query expansion (el LLM genera variantes de la query). Default: true',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  useMultiQuery?: boolean;

  @ApiPropertyOptional({
    description: 'Activar re-ranking LLM sobre los candidatos recuperados. Default: true',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  useReranking?: boolean;

  @ApiPropertyOptional({
    description: 'Dominio del knowledge base a consultar',
    example: 'general',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9_-]+$/i, { message: 'domain must contain only alphanumeric characters, hyphens, and underscores' })
  domain?: string;

  @ApiPropertyOptional({
    description: 'Comprimir chunks antes del reasoning (reduce tokens, mejora señal/ruido). Default: false',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  compressContext?: boolean;

  @ApiPropertyOptional({
    description:
      'Modo de operación. "qa": responde SOLO con info del contexto recuperado (sin inferencias). "assistant": puede sugerir, recomendar e inferir. Default: assistant',
    enum: ['qa', 'assistant'],
    default: 'assistant',
  })
  @IsOptional()
  @IsIn(['qa', 'assistant'])
  mode?: QueryMode;

  @ApiPropertyOptional({
    description:
      'Activar descomposición automática de queries complejas (Tech Lead). Detecta si la query toca múltiples dominios técnicos y la descompone en sub-queries focalizadas. Aumenta la calidad pero también la latencia. Default: false',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  decompose?: boolean;

  @ApiPropertyOptional({
    description:
      'Contexto del proyecto: decisiones ya tomadas, restricciones, stack elegido. Se inyecta en el prompt del Architect para evitar que re-evalúe decisiones cerradas. Ejemplo: "Usamos GPT-4o Vision para OCR. No evaluar Tesseract ni OCR dedicado."',
    example: 'Proyecto LegalDiff AI. Stack decidido: Python 3.10+, GPT-4o Vision, Langfuse, Pydantic v2. No re-evaluar estas decisiones.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string;
}
