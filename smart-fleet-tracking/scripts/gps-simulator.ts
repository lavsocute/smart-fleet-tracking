/**
 * GPS Simulator — giả lập dữ liệu telemetry từ 5 xe ở khu vực TP.HCM.
 *
 * Gửi message vào RabbitMQ queue theo format NestJS Microservice:
 * { pattern: 'telemetry.gps', data: {...}, id: uuid }
 *
 * Usage: npx ts-node scripts/gps-simulator.ts
 */

import * as amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://fleet_user:fleet_pass@localhost:5672';
const QUEUE_NAME = 'fleet_telemetry';
const PUBLISH_INTERVAL_MS = 2000;

// Xe giả lập — tọa độ ban đầu tại các quận thực tế ở TP.HCM
interface SimulatedVehicle {
    id: number;
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    engineOn: boolean;
}

const vehicles: SimulatedVehicle[] = [
    { id: 1, lat: 10.7769, lng: 106.7009, speed: 40, heading: 0, engineOn: true },   // Quận 1
    { id: 2, lat: 10.8231, lng: 106.6297, speed: 35, heading: 90, engineOn: true },  // Tân Bình
    { id: 3, lat: 10.7628, lng: 106.6602, speed: 50, heading: 180, engineOn: true }, // Quận 5
    { id: 4, lat: 10.8498, lng: 106.7714, speed: 60, heading: 270, engineOn: true }, // Thủ Đức
    { id: 5, lat: 10.7578, lng: 106.7215, speed: 0, heading: 0, engineOn: false },   // Bình Thạnh (đỗ)
];

function randomDelta(range: number): number {
    return (Math.random() - 0.5) * range;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Cập nhật trạng thái xe mỗi tick:
 * - 10% toggle engine (mô phỏng dừng/chạy thực tế)
 * - Random walk cho tọa độ (~0.001° ≈ 111m mỗi bước)
 * - 5% spike tốc độ 90-140 km/h để trigger CRITICAL alert trên Grafana
 */
function updateVehicle(v: SimulatedVehicle): void {
    if (Math.random() < 0.1) {
        v.engineOn = !v.engineOn;
    }

    if (!v.engineOn) {
        v.speed = Math.max(0, v.speed - 5);
        return;
    }

    // Giới hạn tọa độ trong khu vực TP.HCM để DQ Gate không reject
    v.lat = clamp(v.lat + randomDelta(0.002), 10.65, 10.95);
    v.lng = clamp(v.lng + randomDelta(0.002), 106.55, 106.85);

    const speedDelta = randomDelta(20);
    v.speed = clamp(v.speed + speedDelta, 0, 130);

    // Spike tốc độ — kiểm tra alert pipeline hoạt động đúng
    if (Math.random() < 0.05) {
        v.speed = 90 + Math.random() * 50;
    }

    v.heading = clamp(v.heading + randomDelta(45), 0, 360);
}

/**
 * Format payload theo chuẩn NestJS Microservice serialization.
 * Consumer dùng @EventPattern('telemetry.gps') nên pattern phải khớp chính xác.
 */
function buildPayload(v: SimulatedVehicle) {
    return {
        pattern: 'telemetry.gps',
        data: {
            vehicleId: v.id,
            latitude: parseFloat(v.lat.toFixed(6)),
            longitude: parseFloat(v.lng.toFixed(6)),
            speed: parseFloat(v.speed.toFixed(1)),
            heading: parseFloat(v.heading.toFixed(1)),
            engineStatus: v.engineOn,
        },
        id: `sim-${Date.now()}-${v.id}`,
    };
}

async function main() {
    console.log('GPS Simulator starting...');
    console.log(`Connecting to RabbitMQ: ${RABBITMQ_URL}`);

    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // durable: true — queue tồn tại qua restart, khớp với config bên consumer
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    console.log(`Connected! Publishing to queue: ${QUEUE_NAME}`);
    console.log(`Simulating ${vehicles.length} vehicles every ${PUBLISH_INTERVAL_MS}ms`);
    console.log('---');

    let messageCount = 0;

    const interval = setInterval(() => {
        for (const vehicle of vehicles) {
            updateVehicle(vehicle);
            const payload = buildPayload(vehicle);

            // persistent: true — message được ghi vào disk, tránh mất khi RabbitMQ crash
            channel.sendToQueue(
                QUEUE_NAME,
                Buffer.from(JSON.stringify(payload)),
                { persistent: true },
            );

            messageCount++;
        }

        if (messageCount % (vehicles.length * 10) === 0) {
            console.log(`Published ${messageCount} messages total`);
            for (const v of vehicles) {
                const status = v.engineOn ? 'ON' : 'OFF';
                const alert = v.speed > 80 ? ' SPEEDING' : '';
                console.log(
                    `  ${status} Vehicle #${v.id}: ${v.lat.toFixed(4)}, ${v.lng.toFixed(4)} | ${v.speed.toFixed(1)} km/h${alert}`,
                );
            }
            console.log('---');
        }
    }, PUBLISH_INTERVAL_MS);

    // Graceful shutdown — đóng connection trước khi exit, tránh corrupt queue
    process.on('SIGINT', async () => {
        console.log('\nShutting down simulator...');
        clearInterval(interval);
        await channel.close();
        await connection.close();
        console.log(`Total messages published: ${messageCount}`);
        process.exit(0);
    });
}

main().catch((err) => {
    console.error('Simulator failed:', err.message);
    process.exit(1);
});
