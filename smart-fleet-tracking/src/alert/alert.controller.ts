import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AlertService } from './alert.service';

@ApiTags('alerts')
@Controller('alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  @ApiOperation({ summary: 'List all alerts' })
  @ApiQuery({
    name: 'resolved',
    required: false,
    type: Boolean,
    description: 'Filter by resolved status',
  })
  @ApiResponse({ status: 200, description: 'List of alerts' })
  findAll(@Query('resolved') resolved?: string) {
    const resolvedBool =
      resolved === undefined ? undefined : resolved === 'true';
    return this.alertService.findAll(resolvedBool);
  }

  @Get('vehicle/:vehicleId')
  @ApiOperation({ summary: 'Get alerts for a vehicle' })
  @ApiResponse({ status: 200, description: 'Vehicle alerts' })
  findByVehicle(@Param('vehicleId', ParseIntPipe) vehicleId: number) {
    return this.alertService.findByVehicle(vehicleId);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Resolve an alert' })
  @ApiResponse({ status: 200, description: 'Alert resolved' })
  resolve(@Param('id', ParseIntPipe) id: number) {
    return this.alertService.resolve(id);
  }
}
