import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TelemetryService } from './telemetry.service';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { QueryTelemetryDto } from './dto/query-telemetry.dto';

@ApiTags('telemetry')
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post()
  @ApiOperation({ summary: 'Insert telemetry data (for testing)' })
  @ApiResponse({ status: 201, description: 'Telemetry record created' })
  create(@Body() dto: CreateTelemetryDto) {
    return this.telemetryService.create(dto);
  }

  @Get('fleet/latest')
  @ApiOperation({ summary: 'Get latest position for ALL vehicles' })
  @ApiResponse({
    status: 200,
    description: 'Fleet overview with latest positions',
  })
  findAllLatest() {
    return this.telemetryService.findAllLatest();
  }

  @Get(':vehicleId')
  @ApiOperation({ summary: 'Get telemetry history for a vehicle' })
  @ApiParam({ name: 'vehicleId', type: Number })
  @ApiResponse({ status: 200, description: 'Telemetry records' })
  findByVehicle(
    @Param('vehicleId', ParseIntPipe) vehicleId: number,
    @Query() query: QueryTelemetryDto,
  ) {
    return this.telemetryService.findByVehicle(vehicleId, query);
  }

  @Get(':vehicleId/latest')
  @ApiOperation({ summary: 'Get latest position for a vehicle' })
  @ApiParam({ name: 'vehicleId', type: Number })
  @ApiResponse({ status: 200, description: 'Latest telemetry record' })
  findLatest(@Param('vehicleId', ParseIntPipe) vehicleId: number) {
    return this.telemetryService.findLatest(vehicleId);
  }

  @Get(':vehicleId/stats')
  @ApiOperation({ summary: 'Get speed statistics (TimescaleDB time_bucket)' })
  @ApiParam({ name: 'vehicleId', type: Number })
  @ApiResponse({ status: 200, description: 'Aggregated speed stats' })
  getSpeedStats(
    @Param('vehicleId', ParseIntPipe) vehicleId: number,
    @Query() query: QueryTelemetryDto,
  ) {
    return this.telemetryService.getSpeedStats(vehicleId, query);
  }

  @Get(':vehicleId/hourly')
  @ApiOperation({ summary: 'Get hourly stats from continuous aggregate' })
  @ApiParam({ name: 'vehicleId', type: Number })
  @ApiResponse({ status: 200, description: 'Hourly aggregated stats' })
  getHourlyStats(@Param('vehicleId', ParseIntPipe) vehicleId: number) {
    return this.telemetryService.getHourlyStats(vehicleId);
  }
}
