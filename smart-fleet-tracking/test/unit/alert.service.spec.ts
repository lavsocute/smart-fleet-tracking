import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AlertService } from '../../src/alert/alert.service';
import {
  Alert,
  AlertType,
  AlertSeverity,
} from '../../src/alert/entities/alert.entity';

const mockAlert: Partial<Alert> = {
  id: 1,
  vehicleId: 1,
  alertType: AlertType.SPEEDING,
  severity: AlertSeverity.HIGH,
  message: 'Vehicle exceeds 80 km/h: 95.0 km/h',
  isResolved: false,
  triggeredAt: new Date(),
};

const mockRepository = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
};

describe('AlertService', () => {
  let service: AlertService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        {
          provide: getRepositoryToken(Alert),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
    jest.clearAllMocks();
  });

  describe('evaluateTelemetry', () => {
    it('should create CRITICAL alert when speed > 120 km/h', async () => {
      mockRepository.findOne.mockResolvedValue(null); // No existing alert
      mockRepository.create.mockReturnValue({
        ...mockAlert,
        severity: AlertSeverity.CRITICAL,
      });
      mockRepository.save.mockResolvedValue({
        ...mockAlert,
        severity: AlertSeverity.CRITICAL,
      });

      const result = await service.evaluateTelemetry(1, 130, true);

      expect(result).not.toBeNull();
      expect(result!.severity).toBe(AlertSeverity.CRITICAL);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: AlertType.SPEEDING,
          severity: AlertSeverity.CRITICAL,
        }),
      );
    });

    it('should create HIGH alert when speed > 80 km/h', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockAlert);
      mockRepository.save.mockResolvedValue(mockAlert);

      const result = await service.evaluateTelemetry(1, 95, true);

      expect(result).not.toBeNull();
      expect(result!.severity).toBe(AlertSeverity.HIGH);
    });

    it('should return null for normal speed', async () => {
      const result = await service.evaluateTelemetry(1, 60, true);

      expect(result).toBeNull();
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should create ENGINE_OFF_MOVING alert', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({
        ...mockAlert,
        alertType: AlertType.ENGINE_OFF_MOVING,
      });
      mockRepository.save.mockResolvedValue({
        ...mockAlert,
        alertType: AlertType.ENGINE_OFF_MOVING,
      });

      const result = await service.evaluateTelemetry(1, 30, false);

      expect(result).not.toBeNull();
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ alertType: AlertType.ENGINE_OFF_MOVING }),
      );
    });

    it('should not duplicate unresolved alerts of the same type', async () => {
      const existing = { ...mockAlert };
      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockResolvedValue(existing);

      await service.evaluateTelemetry(1, 95, true);

      // Should update existing, not create new
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
      );
    });
  });

  describe('findAll', () => {
    it('should return all alerts', async () => {
      mockRepository.find.mockResolvedValue([mockAlert]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
    });

    it('should filter by resolved status', async () => {
      mockRepository.find.mockResolvedValue([]);

      await service.findAll(false);

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isResolved: false },
        }),
      );
    });
  });

  describe('resolve', () => {
    it('should mark alert as resolved', async () => {
      const resolved = {
        ...mockAlert,
        isResolved: true,
        resolvedAt: new Date(),
      };
      mockRepository.findOne.mockResolvedValue({ ...mockAlert });
      mockRepository.save.mockResolvedValue(resolved);

      const result = await service.resolve(1);

      expect(result.isResolved).toBe(true);
      expect(result.resolvedAt).toBeDefined();
    });

    it('should throw error if alert not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.resolve(999)).rejects.toThrow(
        'Alert #999 not found',
      );
    });
  });
});
