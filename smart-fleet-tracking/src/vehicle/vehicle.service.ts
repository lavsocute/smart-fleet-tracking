import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehicleService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
  ) {}

  async findAll(): Promise<Vehicle[]> {
    return this.vehicleRepository.find({
      order: { id: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Vehicle> {
    const vehicle = await this.vehicleRepository.findOne({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle #${id} not found`);
    }
    return vehicle;
  }

  async create(dto: CreateVehicleDto): Promise<Vehicle> {
    const vehicle = this.vehicleRepository.create({
      plateNumber: dto.plateNumber,
      vehicleType: dto.vehicleType || 'truck',
      status: dto.status || 'active',
    });
    return this.vehicleRepository.save(vehicle);
  }

  async update(id: number, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.findOne(id);
    Object.assign(vehicle, dto);
    return this.vehicleRepository.save(vehicle);
  }

  /**
   * Soft delete — chuyển status sang 'inactive' thay vì xóa record.
   * Giữ lại data lịch sử vì telemetry reference đến vehicle_id qua foreign key.
   */
  async remove(id: number): Promise<void> {
    const vehicle = await this.findOne(id);
    vehicle.status = 'inactive';
    await this.vehicleRepository.save(vehicle);
  }
}
