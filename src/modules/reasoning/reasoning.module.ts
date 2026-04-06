import { Module } from '@nestjs/common';
import { ReasoningService } from './reasoning.service';

@Module({
  providers: [ReasoningService],
  exports: [ReasoningService],
})
export class ReasoningModule {}
