import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleTelemetry } from './entities/vehicle-telemetry.entity';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { QueryTelemetryDto } from './dto/query-telemetry.dto';

/**
 * TelemetryService — CRUD và analytics cho dữ liệu GPS time-series.
 *
 * Dùng raw SQL thay vì TypeORM QueryBuilder cho các truy vấn analytics
 * vì cần TimescaleDB-specific functions (time_bucket, DISTINCT ON, continuous aggregate)
 * mà TypeORM không native support.
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectRepository(VehicleTelemetry)
    private readonly telemetryRepository: Repository<VehicleTelemetry>,
  ) {}

  async create(dto: CreateTelemetryDto): Promise<VehicleTelemetry> {
    const telemetry = this.telemetryRepository.create({
      vehicleId: dto.vehicleId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      speed: dto.speed ?? 0,
      heading: dto.heading ?? 0,
      engineStatus: dto.engineStatus ?? true,
    });
    return this.telemetryRepository.save(telemetry);
  }

  /**
   * Batch insert — dùng raw SQL thay vì save() để tránh N+1 queries.
   * Với 100 xe × 1 msg/2s = 50 INSERT/s, batch insert giảm latency đáng kể.
   */
  async createBatch(data: CreateTelemetryDto[]): Promise<void> {
    if (data.length === 0) return;

    const values = data
      .map(
        (d) =>
          `(${d.vehicleId}, NOW(), ${d.latitude}, ${d.longitude}, ${d.speed ?? 0}, ${d.heading ?? 0}, ${d.engineStatus !== false})`,
      )
      .join(',');

    await this.telemetryRepository.query(`
      INSERT INTO vehicle_telemetry (vehicle_id, ts, latitude, longitude, speed, heading, engine_status)
      VALUES ${values}
    `);

    this.logger.log(`Batch inserted ${data.length} telemetry records`);
  }

  async findByVehicle(
    vehicleId: number,
    query: QueryTelemetryDto,
  ): Promise<VehicleTelemetry[]> {
    const hours = query.hours ?? 1;
    const limit = query.limit ?? 100;

    return this.telemetryRepository.query(
      `
      SELECT id, vehicle_id AS "vehicleId", ts, latitude, longitude, speed, heading, engine_status AS "engineStatus"
      FROM vehicle_telemetry
      WHERE vehicle_id = $1
        AND ts > NOW() - INTERVAL '${hours} hours'
      ORDER BY ts DESC
      LIMIT $2
      `,
      [vehicleId, limit],
    );
  }

  async findLatest(vehicleId: number): Promise<VehicleTelemetry | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.telemetryRepository.query(
      `
      SELECT id, vehicle_id AS "vehicleId", ts, latitude, longitude, speed, heading, engine_status AS "engineStatus"
      FROM vehicle_telemetry
      WHERE vehicle_id = $1
      ORDER BY ts DESC
      LIMIT 1
      `,
      [vehicleId],
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return result[0] || null;
  }

  /**
   * Vị trí mới nhất của TẤT CẢ xe — dùng cho fleet overview dashboard.
   * DISTINCT ON là PostgreSQL-specific, hiệu quả hơn window function ROW_NUMBER()
   * vì PostgreSQL tối ưu DISTINCT ON thành Index Scan khi có composite index (vehicle_id, ts DESC).
   */
  async findAllLatest(): Promise<any[]> {
    return this.telemetryRepository.query(`
      SELECT DISTINCT ON (vt.vehicle_id)
        vt.vehicle_id AS "vehicleId",
        v.plate_number AS "plateNumber",
        v.vehicle_type AS "vehicleType",
        vt.ts,
        vt.latitude,
        vt.longitude,
        vt.speed,
        vt.heading,
        vt.engine_status AS "engineStatus"
      FROM vehicle_telemetry vt
      JOIN vehicles v ON v.id = vt.vehicle_id
      ORDER BY vt.vehicle_id, vt.ts DESC
    `);
  }

  /**
   * Thống kê tốc độ theo time_bucket — hàm native của TimescaleDB.
   * time_bucket('5 minutes', ts) nhóm data thành khoảng 5 phút đều nhau,
   * khác với DATE_TRUNC vì time_bucket hỗ trợ interval tùy ý (3 min, 15 min, v.v.)
   */
  async getSpeedStats(
    vehicleId: number,
    query: QueryTelemetryDto,
  ): Promise<any[]> {
    const hours = query.hours ?? 1;
    const bucket = query.bucket ?? '5 minutes';

    return this.telemetryRepository.query(
      `
      SELECT
        vehicle_id AS "vehicleId",
        time_bucket($1, ts) AS bucket,
        ROUND(AVG(speed)::numeric, 2) AS "avgSpeed",
        ROUND(MAX(speed)::numeric, 2) AS "maxSpeed",
        ROUND(MIN(speed)::numeric, 2) AS "minSpeed",
        COUNT(*) AS "totalPoints"
      FROM vehicle_telemetry
      WHERE vehicle_id = $2
        AND ts > NOW() - INTERVAL '${hours} hours'
      GROUP BY vehicle_id, time_bucket($1, ts)
      ORDER BY bucket DESC
      `,
      [bucket, vehicleId],
    );
  }

  /**
   * Đọc từ continuous aggregate — materialized view tự động refresh bởi TimescaleDB.
   * Truy vấn nhanh hơn nhiều so với query trực tiếp trên hypertable
   * vì data đã được pre-aggregated theo giờ.
   */
  async getHourlyStats(vehicleId: number, hours: number = 24): Promise<any[]> {
    return this.telemetryRepository.query(
      `
      SELECT
        vehicle_id AS "vehicleId",
        bucket,
        ROUND(avg_speed::numeric, 2) AS "avgSpeed",
        ROUND(max_speed::numeric, 2) AS "maxSpeed",
        ROUND(min_speed::numeric, 2) AS "minSpeed",
        total_points AS "totalPoints"
      FROM vehicle_speed_hourly
      WHERE vehicle_id = $1
        AND bucket > NOW() - INTERVAL '${hours} hours'
      ORDER BY bucket DESC
      `,
      [vehicleId],
    );
  }
}
