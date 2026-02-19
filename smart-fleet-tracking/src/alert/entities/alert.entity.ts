import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Vehicle } from '../../vehicle/entities/vehicle.entity';

// Loại vi phạm — mở rộng được khi thêm sensor mới (nhiên liệu, cửa, nhiệt độ)
export enum AlertType {
  SPEEDING = 'SPEEDING',
  GEOFENCE = 'GEOFENCE',
  IDLE = 'IDLE',
  ENGINE_OFF_MOVING = 'ENGINE_OFF_MOVING',
}

// Mức độ nghiêm trọng — map với màu trên Grafana dashboard
export enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

@Entity('alerts')
export class Alert {
  @ApiProperty({ description: 'Alert ID' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @ApiProperty({ description: 'Vehicle ID', example: 1 })
  @Column({ name: 'vehicle_id', type: 'integer' })
  vehicleId: number;

  @ApiProperty({
    description: 'Alert type',
    enum: AlertType,
    example: AlertType.SPEEDING,
  })
  @Column({ name: 'alert_type', type: 'varchar', length: 50 })
  alertType: AlertType;

  @ApiProperty({
    description: 'Alert message',
    example: 'Vehicle exceeds 80 km/h',
  })
  @Column({ type: 'text', nullable: true })
  message: string;

  @ApiProperty({
    description: 'Severity level',
    enum: AlertSeverity,
    example: AlertSeverity.HIGH,
  })
  @Column({ type: 'varchar', length: 20, default: AlertSeverity.MEDIUM })
  severity: AlertSeverity;

  @ApiProperty({ description: 'Triggered at' })
  @Column({ name: 'triggered_at', type: 'timestamptz', default: () => 'NOW()' })
  triggeredAt: Date;

  // resolvedAt = thời điểm fleet manager xác nhận đã xử lý vi phạm
  @ApiProperty({ description: 'Resolved at', nullable: true })
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date;

  @ApiProperty({ description: 'Is resolved', example: false })
  @Column({ name: 'is_resolved', type: 'boolean', default: false })
  isResolved: boolean;

  @ManyToOne(() => Vehicle)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;
}
