import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VehicleService } from './vehicle.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { Vehicle } from './entities/vehicle.entity';

@ApiTags('vehicles')
@Controller('vehicles')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Get()
  @ApiOperation({ summary: 'List all vehicles' })
  @ApiResponse({ status: 200, type: [Vehicle] })
  findAll(): Promise<Vehicle[]> {
    return this.vehicleService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vehicle by ID' })
  @ApiResponse({ status: 200, type: Vehicle })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Vehicle> {
    return this.vehicleService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new vehicle' })
  @ApiResponse({ status: 201, type: Vehicle })
  create(@Body() dto: CreateVehicleDto): Promise<Vehicle> {
    return this.vehicleService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a vehicle' })
  @ApiResponse({ status: 200, type: Vehicle })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleDto,
  ): Promise<Vehicle> {
    return this.vehicleService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a vehicle (set inactive)' })
  @ApiResponse({ status: 200, description: 'Vehicle deactivated' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.vehicleService.remove(id);
  }
}
