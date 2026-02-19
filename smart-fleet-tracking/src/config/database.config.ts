import { registerAs } from '@nestjs/config';

// Dùng registerAs để namespace config — tránh xung đột key giữa DB và RabbitMQ
// synchronize: false — schema quản lý bằng init.sql, KHÔNG cho TypeORM tự tạo bảng
// Lý do: TimescaleDB hypertable cần lệnh riêng (SELECT create_hypertable) mà TypeORM không hỗ trợ
export default registerAs('database', () => ({
  type: 'postgres' as const,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'fleet_user',
  password: process.env.DB_PASSWORD || 'fleet_pass',
  database: process.env.DB_NAME || 'fleet_tracking',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
}));
