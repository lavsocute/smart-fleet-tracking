import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VehicleModule } from './vehicle/vehicle.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { AlertModule } from './alert/alert.module';
import { HealthModule } from './health/health.module';
import databaseConfig from './config/database.config';
import rabbitmqConfig from './config/rabbitmq.config';

@Module({
  imports: [
    // Tải config từ .env — tách biệt credentials khỏi code để an toàn khi push GitHub
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, rabbitmqConfig],
    }),

    // Dùng forRootAsync để inject ConfigService — tránh hardcode DB credentials
    // synchronize: false vì schema được quản lý bằng init.sql (migration thủ công)
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.database'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
      }),
    }),

    // Feature modules — mỗi module đóng gói 1 domain: Vehicle, Telemetry, Alert
    VehicleModule,
    TelemetryModule,
    AlertModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
