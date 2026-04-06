import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';
import { VectorStoreModule } from '../../vector-store/vector-store.module';

@Module({
  imports: [VectorStoreModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
