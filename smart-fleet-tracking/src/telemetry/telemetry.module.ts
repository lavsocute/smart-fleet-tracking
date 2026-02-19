import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleTelemetry } from './entities/vehicle-telemetry.entity';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';
import { TelemetryConsumer } from './telemetry.consumer';
import { AlertModule } from '../alert/alert.module';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleTelemetry]), AlertModule],
  controllers: [TelemetryController, TelemetryConsumer],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
