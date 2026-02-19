import { registerAs } from '@nestjs/config';

// Chọn RabbitMQ thay vì Kafka vì:
// - Quy mô fleet ~100 xe, throughput vài trăm msg/s — không cần Kafka scale
// - RabbitMQ hỗ trợ flexible routing (topic exchange) phù hợp cho tương lai (thêm sensor types)
// - Durable queue đảm bảo message không mất khi restart
export default registerAs('rabbitmq', () => ({
  url:
    process.env.RABBITMQ_URL || 'amqp://fleet_user:fleet_pass@localhost:5672',
  queue: 'fleet_telemetry',
  exchange: 'fleet_exchange',
  queueOptions: {
    durable: true,
  },
}));
