import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { ContextBuilderModule } from '../context-builder/context-builder.module';
import { VectorStoreModule } from '../../vector-store/vector-store.module';

@Module({
  imports: [RetrievalModule, ContextBuilderModule, VectorStoreModule],
  providers: [AgentService],
  controllers: [AgentController],
  exports: [AgentService],
})
export class AgentModule {}
