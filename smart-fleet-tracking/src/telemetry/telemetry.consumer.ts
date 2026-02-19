import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TelemetryService } from './telemetry.service';
import { AlertService } from '../alert/alert.service';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';

// Bounding box lãnh thổ Việt Nam — dùng để lọc tọa độ GPS bất thường
// Tọa độ ngoài vùng này là dữ liệu lỗi (GPS drift, spoofing) → reject ngay
const VIETNAM_BOUNDS = {
  latMin: 8.0, // Mũi Cà Mau
  latMax: 23.5, // Hà Giang
  lngMin: 102.0, // Điện Biên
  lngMax: 110.0, // Trường Sa
};

/**
 * Consumer xử lý event telemetry từ RabbitMQ queue.
 *
 * Dùng @EventPattern (fire-and-forget) thay vì @MessagePattern (request-response)
 * vì GPS data là one-way — simulator gửi xong không cần response.
 *
 * Luồng xử lý: RabbitMQ → Data Quality Gate → TimescaleDB → Alert Evaluation
 */
@Controller()
export class TelemetryConsumer {
  private readonly logger = new Logger(TelemetryConsumer.name);

  // Đếm accepted/rejected để theo dõi tỷ lệ data quality theo thời gian thực
  private accepted = 0;
  private rejected = 0;

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly alertService: AlertService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @EventPattern('telemetry.gps')
  async handleGpsData(@Payload() data: CreateTelemetryDto) {
    // ── STAGE 1: Data Quality Gate ──
    // Validate TRƯỚC khi write — nguyên tắc "shift-left validation":
    // bắt lỗi càng sớm trong pipeline thì cost xử lý càng thấp.
    // Nếu để data xấu vào DB, phải chạy batch job clean-up sau — rất tốn kém.
    const reasons = this.validate(data);

    if (reasons.length > 0) {
      this.rejected++;
      await this.logRejected(data, reasons.join('; '));
      this.logger.warn(
        `REJECTED Vehicle #${data.vehicleId}: ${reasons.join(', ')}`,
      );
      return; // Không process tiếp — message bị drop khỏi pipeline
    }

    this.accepted++;

    try {
      // ── STAGE 2: Persist vào TimescaleDB hypertable ──
      // Insert append-only — hypertable tự partition theo ts (chunk 1 ngày)
      // Không cần lo về table size vì compression policy nén data > 7 ngày (~90% tiết kiệm disk)
      await this.telemetryService.create(data);

      // ── STAGE 3: Real-time Alert Evaluation ──
      // Evaluate ngay tại consumer thay vì dùng scheduled job/polling
      // để đảm bảo latency cảnh báo < 2s (bằng đúng interval gửi GPS data)
      await this.alertService.evaluateTelemetry(
        data.vehicleId,
        data.speed ?? 0,
        data.engineStatus ?? true,
      );

      // DQ metrics sampling — log mỗi 50 messages thay vì mỗi message
      // để observability không trở thành bottleneck (giảm 98% log volume)
      if ((this.accepted + this.rejected) % 50 === 0) {
        const total = this.accepted + this.rejected;
        const rate = ((this.accepted / total) * 100).toFixed(1);
        this.logger.log(
          `DQ Metrics: ${this.accepted}/${total} accepted (${rate}%) | ${this.rejected} rejected`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process telemetry for vehicle #${data.vehicleId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Validate data quality — return mảng lý do reject (rỗng = hợp lệ).
   * Các rule dựa trên thực tế vận hành fleet tại VN.
   */
  private validate(data: CreateTelemetryDto): string[] {
    const reasons: string[] = [];

    // Tọa độ phải nằm trong lãnh thổ VN — loại GPS drift và spoofing
    if (
      data.latitude < VIETNAM_BOUNDS.latMin ||
      data.latitude > VIETNAM_BOUNDS.latMax
    ) {
      reasons.push(
        `latitude ${data.latitude} outside Vietnam (${VIETNAM_BOUNDS.latMin}-${VIETNAM_BOUNDS.latMax})`,
      );
    }

    if (
      data.longitude < VIETNAM_BOUNDS.lngMin ||
      data.longitude > VIETNAM_BOUNDS.lngMax
    ) {
      reasons.push(
        `longitude ${data.longitude} outside Vietnam (${VIETNAM_BOUNDS.lngMin}-${VIETNAM_BOUNDS.lngMax})`,
      );
    }

    // Tốc độ âm là dữ liệu lỗi từ sensor
    if (data.speed !== undefined && data.speed < 0) {
      reasons.push(`negative speed: ${data.speed}`);
    }

    // > 200 km/h là bất thường — xe tải VN tối đa ~120 km/h, có thể do GPS jump
    if (data.speed !== undefined && data.speed > 200) {
      reasons.push(`unrealistic speed: ${data.speed} km/h`);
    }

    if (!data.vehicleId || data.vehicleId <= 0) {
      reasons.push(`invalid vehicleId: ${data.vehicleId}`);
    }

    return reasons;
  }

  /**
   * Lưu bản ghi bị reject vào bảng riêng — phục vụ audit trail và debug nguồn dữ liệu xấu.
   * Dùng raw JSONB để giữ nguyên payload gốc (kể cả field không hợp lệ).
   */
  private async logRejected(data: CreateTelemetryDto, reason: string) {
    try {
      await this.dataSource.query(
        `INSERT INTO data_quality_rejected (vehicle_id, raw_payload, rejection_reason)
         VALUES ($1, $2, $3)`,
        [data.vehicleId, JSON.stringify(data), reason],
      );
    } catch (err) {
      this.logger.error(
        `Failed to log rejected record: ${(err as Error).message}`,
      );
    }
  }
}
