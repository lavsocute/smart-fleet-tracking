import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Entity phương tiện — mỗi xe có biển số duy nhất (UNIQUE constraint).
 * status dùng soft delete: 'inactive' thay vì xóa, bảo toàn FK với telemetry.
 */
@Entity('vehicles')
export class Vehicle {
  @ApiProperty({ description: 'Vehicle ID' })
  @PrimaryGeneratedColumn()
  id: number;

  // Biển số theo format VN: vùng + seri (ví dụ: 59A-12345 = TP.HCM)
  @ApiProperty({ description: 'Biển số xe', example: '59A-12345' })
  @Column({ name: 'plate_number', type: 'varchar', length: 20, unique: true })
  plateNumber: string;

  @ApiProperty({ description: 'Loại xe', example: 'truck' })
  @Column({
    name: 'vehicle_type',
    type: 'varchar',
    length: 50,
    default: 'truck',
  })
  vehicleType: string;

  @ApiProperty({ description: 'Trạng thái', example: 'active' })
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @ApiProperty({ description: 'Created at' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated at' })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
