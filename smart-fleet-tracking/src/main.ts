import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // Chặn dữ liệu rác từ client — whitelist chỉ cho phép các field đã khai báo trong DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Hybrid Application: vừa là REST API (HTTP) vừa là RabbitMQ consumer (Microservice)
  // Dùng Hybrid thay vì tách 2 service riêng để đơn giản hóa deployment cho quy mô nhỏ
  const rabbitmqUrl =
    configService.get<string>('rabbitmq.url') ||
    'amqp://fleet_user:fleet_pass@localhost:5672';
  const rabbitmqQueue =
    configService.get<string>('rabbitmq.queue') || 'fleet_telemetry';

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: rabbitmqQueue,
      queueOptions: {
        durable: true, // Queue tồn tại sau khi RabbitMQ restart — tránh mất message khi deploy
      },
      noAck: true, // Dùng auto-acknowledge vì EventPattern là fire-and-forget
    },
  });

  // Swagger — tự sinh API docs, giúp frontend/QA test mà không cần đọc code
  const config = new DocumentBuilder()
    .setTitle('Fleet Tracking API')
    .setDescription(
      'Smart Fleet Tracking & Alerting System - Real-time GPS Telemetry',
    )
    .setVersion('1.0')
    .addTag('vehicles', 'Quản lý phương tiện')
    .addTag('telemetry', 'Dữ liệu GPS telemetry')
    .addTag('alerts', 'Cảnh báo vi phạm')
    .addTag('health', 'Health checks')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Khởi động cả 2 transport: HTTP (REST) + RabbitMQ (Message Queue)
  await app.startAllMicroservices();
  const port = process.env.APP_PORT || 3000;
  await app.listen(port);

  logger.log(`Fleet Tracking API running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
  logger.log(`RabbitMQ consumer listening on queue: ${rabbitmqQueue}`);
}
void bootstrap();
