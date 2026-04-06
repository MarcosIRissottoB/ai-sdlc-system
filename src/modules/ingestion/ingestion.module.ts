import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { VectorStoreModule } from '../../vector-store/vector-store.module';
import { SmartChunkerService } from './smart-chunker.service';
import { ChunkEnricherService } from './chunk-enricher.service';
import { ScraperService } from './scraper.service';

@Module({
  imports: [VectorStoreModule],
  providers: [IngestionService, SmartChunkerService, ChunkEnricherService, ScraperService],
  controllers: [IngestionController],
  exports: [IngestionService, ScraperService],
})
export class IngestionModule {}
