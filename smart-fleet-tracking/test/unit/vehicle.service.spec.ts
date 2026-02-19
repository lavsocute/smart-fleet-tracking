import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { NotFoundException } from '@nestjs/common';
import { VehicleService } from '../../src/vehicle/vehicle.service';
import { Vehicle } from '../../src/vehicle/entities/vehicle.entity';

const mockVehicle: Partial<Vehicle> = {
  id: 1,
  plateNumber: '59A-12345',
  vehicleType: 'truck',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe('VehicleService', () => {
  let service: VehicleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleService,
        {
          provide: getRepositoryToken(Vehicle),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<VehicleService>(VehicleService);

    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return an array of vehicles', async () => {
      const vehicles = [mockVehicle];
      mockRepository.find.mockResolvedValue(vehicles);

      const result = await service.findAll();

      expect(result).toEqual(vehicles);
      expect(mockRepository.find).toHaveBeenCalledWith({
        order: { id: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a vehicle by ID', async () => {
      mockRepository.findOne.mockResolvedValue(mockVehicle);

      const result = await service.findOne(1);

      expect(result).toEqual(mockVehicle);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should throw NotFoundException if vehicle not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new vehicle', async () => {
      const dto = { plateNumber: '59A-99999', vehicleType: 'van' };
      const created = { ...mockVehicle, ...dto };

      mockRepository.create.mockReturnValue(created);
      mockRepository.save.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(result.plateNumber).toBe('59A-99999');
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an existing vehicle', async () => {
      const updated = { ...mockVehicle, status: 'maintenance' };

      mockRepository.findOne.mockResolvedValue({ ...mockVehicle });
      mockRepository.save.mockResolvedValue(updated);

      const result = await service.update(1, { status: 'maintenance' });

      expect(result.status).toBe('maintenance');
    });
  });

  describe('remove (soft-delete)', () => {
    it('should set vehicle status to inactive', async () => {
      const deactivated = { ...mockVehicle, status: 'inactive' };

      mockRepository.findOne.mockResolvedValue({ ...mockVehicle });
      mockRepository.save.mockResolvedValue(deactivated);

      await service.remove(1);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'inactive' }),
      );
    });
  });
});
