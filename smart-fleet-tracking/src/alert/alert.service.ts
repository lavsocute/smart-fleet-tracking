import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Alert, AlertType, AlertSeverity } from './entities/alert.entity';
import { SPEED_LIMIT, CRITICAL_SPEED_LIMIT } from '../common/constants';

/**
 * AlertService — đánh giá vi phạm real-time dựa trên dữ liệu telemetry.
 *
 * Mỗi data point từ RabbitMQ consumer đều được evaluate qua hàm evaluateTelemetry().
 * Thiết kế: check từ mức nghiêm trọng nhất (CRITICAL → HIGH → MEDIUM) và return ngay
 * khi match — tránh tạo nhiều alert trùng lặp cho cùng 1 sự kiện.
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
  ) {}

  /**
   * Đánh giá dữ liệu telemetry và tạo cảnh báo nếu vi phạm ngưỡng.
   * Thứ tự ưu tiên: CRITICAL > HIGH > MEDIUM (return sớm nhất có thể)
   */
  async evaluateTelemetry(
    vehicleId: number,
    speed: number,
    engineStatus: boolean,
  ): Promise<Alert | null> {
    // > 120 km/h: vi phạm nghiêm trọng — có thể tước GPLX theo NĐ 100/2019
    if (speed > CRITICAL_SPEED_LIMIT) {
      return this.createAlert(
        vehicleId,
        AlertType.SPEEDING,
        AlertSeverity.CRITICAL,
        `Vehicle exceeds ${CRITICAL_SPEED_LIMIT} km/h: ${speed.toFixed(1)} km/h`,
      );
    }

    // > 80 km/h: vượt tốc độ cho phép trên cao tốc
    if (speed > SPEED_LIMIT) {
      return this.createAlert(
        vehicleId,
        AlertType.SPEEDING,
        AlertSeverity.HIGH,
        `Vehicle exceeds ${SPEED_LIMIT} km/h: ${speed.toFixed(1)} km/h`,
      );
    }

    // Engine tắt nhưng xe vẫn di chuyển — có thể bị kéo hoặc trộm xe
    if (!engineStatus && speed > 0) {
      return this.createAlert(
        vehicleId,
        AlertType.ENGINE_OFF_MOVING,
        AlertSeverity.MEDIUM,
        `Engine off but vehicle moving at ${speed.toFixed(1)} km/h`,
      );
    }

    return null;
  }

  /**
   * Tạo alert mới, tránh duplicate cho cùng loại vi phạm chưa resolved.
   * Nếu đã có alert chưa xử lý → cập nhật message + thời gian thay vì tạo mới.
   * Lý do: tránh spam hàng trăm alert khi xe liên tục vượt tốc.
   */
  private async createAlert(
    vehicleId: number,
    alertType: AlertType,
    severity: AlertSeverity,
    message: string,
  ): Promise<Alert> {
    // Idempotency check: tìm alert cùng loại + cùng xe + chưa resolved
    const existing = await this.alertRepository.findOne({
      where: {
        vehicleId,
        alertType,
        isResolved: false,
      },
    });

    if (existing) {
      existing.message = message;
      existing.triggeredAt = new Date();
      return this.alertRepository.save(existing);
    }

    const alert = this.alertRepository.create({
      vehicleId,
      alertType,
      severity,
      message,
    });

    this.logger.warn(
      `🚨 [${severity}] ${alertType} - Vehicle #${vehicleId}: ${message}`,
    );
    return this.alertRepository.save(alert);
  }

  async findAll(resolved?: boolean): Promise<Alert[]> {
    const where: FindOptionsWhere<Alert> = {};
    if (resolved !== undefined) {
      where.isResolved = resolved;
    }

    return this.alertRepository.find({
      where,
      order: { triggeredAt: 'DESC' },
      take: 100,
    });
  }

  async findByVehicle(vehicleId: number): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { vehicleId },
      order: { triggeredAt: 'DESC' },
      take: 50,
    });
  }

  /**
   * Đánh dấu alert đã xử lý — fleet manager xác nhận đã liên hệ tài xế.
   */
  async resolve(id: number): Promise<Alert> {
    const alert = await this.alertRepository.findOne({ where: { id } });
    if (!alert) {
      throw new Error(`Alert #${id} not found`);
    }
    alert.isResolved = true;
    alert.resolvedAt = new Date();
    return this.alertRepository.save(alert);
  }
}
