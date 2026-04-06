import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength, Matches } from 'class-validator';

export class ChatDto {
  @ApiProperty({
    description: 'Mensaje del usuario al agente',
    example: '¿Qué arquitectura usarías para un sistema RAG con 1M de documentos?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({
    description: 'ID de sesión para mantener contexto de conversación. Si no se provee, se crea una sesión nueva.',
    example: 'clx1234567890',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({
    description: 'Dominio del knowledge base a consultar',
    example: 'general',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9_-]+$/i, { message: 'domain must contain only alphanumeric characters, hyphens, and underscores' })
  domain?: string;
}

export class ChatResponseDto {
  answer!: string;
  sessionId!: string;
  toolsUsed!: string[];
  sources!: Array<{ source: string; text: string }>;
}
