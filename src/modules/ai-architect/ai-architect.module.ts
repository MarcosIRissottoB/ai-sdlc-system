import { Module } from '@nestjs/common';
import { AiArchitectService } from './ai-architect.service';
import { AiArchitectController } from './ai-architect.controller';
import { TechLeadService } from './tech-lead.service';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { ContextBuilderModule } from '../context-builder/context-builder.module';
import { ReasoningModule } from '../reasoning/reasoning.module';

@Module({
  imports: [RetrievalModule, ContextBuilderModule, ReasoningModule],
  providers: [AiArchitectService, TechLeadService],
  controllers: [AiArchitectController],
  exports: [AiArchitectService, TechLeadService],
})
export class AiArchitectModule {}
