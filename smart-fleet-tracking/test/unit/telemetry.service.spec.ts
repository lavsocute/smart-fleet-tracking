import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TelemetryService } from '../../src/telemetry/telemetry.service';
import { VehicleTelemetry } from '../../src/telemetry/entities/vehicle-telemetry.entity';

const mockTelemetry: Partial<VehicleTelemetry> = {
  id: 1,
  vehicleId: 1,
  ts: new Date(),
  latitude: 10.7769,
  longitude: 106.7009,
  speed: 45.5,
  heading: 180,
  engineStatus: true,
};

const mockRepository = {
  create: jest.fn(),
  save: jest.fn(),
  query: jest.fn(),
};

describe('TelemetryService', () => {
  let service: TelemetryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryService,
        {
          provide: getRepositoryToken(VehicleTelemetry),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should save valid telemetry data', async () => {
      const dto = {
        vehicleId: 1,
        latitude: 10.7769,
        longitude: 106.7009,
        speed: 45.5,
        heading: 180,
        engineStatus: true,
      };

      mockRepository.create.mockReturnValue(mockTelemetry);
      mockRepository.save.mockResolvedValue(mockTelemetry);

      const result = await service.create(dto);

      expect(result.vehicleId).toBe(1);
      expect(result.latitude).toBe(10.7769);
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should use default values for optional fields', async () => {
      const dto = { vehicleId: 1, latitude: 10.0, longitude: 106.0 };
      const expected = {
        ...mockTelemetry,
        speed: 0,
        heading: 0,
        engineStatus: true,
      };

      mockRepository.create.mockReturnValue(expected);
      mockRepository.save.mockResolvedValue(expected);

      await service.create(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ speed: 0, heading: 0, engineStatus: true }),
      );
    });
  });

  describe('createBatch', () => {
    it('should batch insert multiple records', async () => {
      const data = [
        { vehicleId: 1, latitude: 10.7, longitude: 106.7 },
        { vehicleId: 2, latitude: 10.8, longitude: 106.6 },
      ];

      mockRepository.query.mockResolvedValue(undefined);

      await service.createBatch(data);

      expect(mockRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO vehicle_telemetry'),
      );
    });

    it('should skip batch insert for empty array', async () => {
      await service.createBatch([]);

      expect(mockRepository.query).not.toHaveBeenCalled();
    });
  });

  describe('findByVehicle', () => {
    it('should query telemetry by vehicle and time range', async () => {
      const records = [mockTelemetry];
      mockRepository.query.mockResolvedValue(records);

      const result = await service.findByVehicle(1, { hours: 2, limit: 50 });

      expect(result).toEqual(records);
      expect(mockRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('vehicle_id = $1'),
        [1, 50],
      );
    });
  });

  describe('findLatest', () => {
    it('should return the latest telemetry for a vehicle', async () => {
      mockRepository.query.mockResolvedValue([mockTelemetry]);

      const result = await service.findLatest(1);

      expect(result).toEqual(mockTelemetry);
    });

    it('should return null if no telemetry exists', async () => {
      mockRepository.query.mockResolvedValue([]);

      const result = await service.findLatest(999);

      expect(result).toBeNull();
    });
  });

  describe('findAllLatest', () => {
    it('should return latest position for all vehicles using DISTINCT ON', async () => {
      const fleet = [mockTelemetry, { ...mockTelemetry, vehicleId: 2 }];
      mockRepository.query.mockResolvedValue(fleet);

      const result = await service.findAllLatest();

      expect(result).toHaveLength(2);
      expect(mockRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('DISTINCT ON'),
      );
    });
  });

  describe('getSpeedStats', () => {
    it('should use TimescaleDB time_bucket for aggregation', async () => {
      const stats = [{ vehicleId: 1, bucket: new Date(), avgSpeed: 45.0 }];
      mockRepository.query.mockResolvedValue(stats);

      const result = await service.getSpeedStats(1, {
        bucket: '10 minutes',
        hours: 2,
      });

      expect(result).toEqual(stats);
      expect(mockRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('time_bucket'),
        ['10 minutes', 1],
      );
    });
  });
});
