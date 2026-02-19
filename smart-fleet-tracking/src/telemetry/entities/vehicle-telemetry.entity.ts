import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Vehicle } from '../../vehicle/entities/vehicle.entity';

/**
 * Entity mapping bảng vehicle_telemetry — TimescaleDB hypertable.
 *
 * Bảng này là hypertable (partitioned theo ts) nên:
 * - INSERT cực nhanh vì TimescaleDB tự động phân chunk theo thời gian
 * - Query theo khoảng thời gian được tối ưu bởi chunk exclusion
 * - Compression policy tự động nén data cũ hơn 7 ngày (xem init.sql)
 */
@Entity('vehicle_telemetry')
export class VehicleTelemetry {
  @ApiProperty({ description: 'Telemetry record ID' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @ApiProperty({ description: 'Vehicle ID (FK)', example: 1 })
  @Column({ name: 'vehicle_id', type: 'integer' })
  vehicleId: number;

  // Timestamp từ GPS device — dùng timestamptz để handle timezone VN (UTC+7)
  @ApiProperty({ description: 'Timestamp of GPS reading' })
  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  ts: Date;

  @ApiProperty({ description: 'Latitude', example: 10.7769 })
  @Column({ type: 'double precision' })
  latitude: number;

  @ApiProperty({ description: 'Longitude', example: 106.7009 })
  @Column({ type: 'double precision' })
  longitude: number;

  @ApiProperty({ description: 'Speed (km/h)', example: 45.5 })
  @Column({ type: 'double precision', default: 0 })
  speed: number;

  // Heading: hướng di chuyển 0-360° — dùng cho visualization trên bản đồ
  @ApiProperty({ description: 'Heading (0-360°)', example: 180 })
  @Column({ type: 'double precision', default: 0 })
  heading: number;

  @ApiProperty({ description: 'Engine on/off', example: true })
  @Column({ name: 'engine_status', type: 'boolean', default: true })
  engineStatus: boolean;

  @ManyToOne(() => Vehicle)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;
}
