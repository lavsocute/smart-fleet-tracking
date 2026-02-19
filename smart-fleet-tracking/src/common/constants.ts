// Message Queue config
export const RABBITMQ_QUEUE = 'fleet_telemetry';
export const RABBITMQ_EXCHANGE = 'fleet_exchange';

// Ngưỡng tốc độ theo quy định giao thông VN (Nghị định 100/2019/NĐ-CP)
// 80 km/h: giới hạn tốc độ đường cao tốc cho xe tải
// 120 km/h: mức vi phạm nghiêm trọng — có thể tước giấy phép lái xe
export const SPEED_LIMIT = 80;
export const CRITICAL_SPEED_LIMIT = 120;
export const IDLE_TIMEOUT_MINUTES = 30;
