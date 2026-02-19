-- ============================================
-- Smart Fleet Tracking — Database Schema
-- TimescaleDB + PostgreSQL 16
-- ============================================
-- Lý do chọn TimescaleDB thay vì PostgreSQL thường:
-- 1. Hypertable tự động partition theo thời gian → INSERT nhanh, query theo time range O(1) chunks
-- 2. time_bucket() + continuous aggregate → pre-computed dashboard metrics
-- 3. Compression policy tự động → tiết kiệm 90%+ disk cho data cũ

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================
-- 1. Bảng master phương tiện
-- ============================================
-- plate_number UNIQUE — biển số VN không trùng lặp, dùng làm business key
CREATE TABLE IF NOT EXISTS vehicles (
    id              SERIAL PRIMARY KEY,
    plate_number    VARCHAR(20) UNIQUE NOT NULL,
    vehicle_type    VARCHAR(50) DEFAULT 'truck',
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Bảng telemetry GPS (Time-series chính)
-- ============================================
-- Composite PK (id, ts) bắt buộc cho TimescaleDB hypertable
-- vì partitioning key (ts) phải nằm trong PK
CREATE TABLE IF NOT EXISTS vehicle_telemetry (
    id              BIGSERIAL,
    vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id),
    ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    speed           DOUBLE PRECISION DEFAULT 0,
    heading         DOUBLE PRECISION DEFAULT 0,
    engine_status   BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (id, ts)
);

-- Chuyển thành Hypertable — mỗi chunk = 1 ngày dữ liệu
-- TimescaleDB tự động tạo/xóa chunks, không cần quản lý partition thủ công
SELECT create_hypertable(
    'vehicle_telemetry',
    'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- ============================================
-- 3. Bảng cảnh báo vi phạm
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
    id              BIGSERIAL PRIMARY KEY,
    vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id),
    alert_type      VARCHAR(50) NOT NULL,
    message         TEXT,
    severity        VARCHAR(20) DEFAULT 'MEDIUM',
    triggered_at    TIMESTAMPTZ DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    is_resolved     BOOLEAN DEFAULT FALSE
);

-- ============================================
-- 4. Indexes — tối ưu cho các query pattern thực tế
-- ============================================
-- Composite index (vehicle_id, ts DESC): phục vụ "lấy N điểm gần nhất của xe X"
-- Đây là query phổ biến nhất trên dashboard (gọi mỗi 5s)
CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle_ts
    ON vehicle_telemetry (vehicle_id, ts DESC);

-- Alert lookup: "tất cả cảnh báo của xe X, mới nhất trước"
CREATE INDEX IF NOT EXISTS idx_alerts_vehicle
    ON alerts (vehicle_id, triggered_at DESC);

-- ============================================
-- 5. Dữ liệu mẫu — 5 xe ở TP.HCM
-- ============================================
-- ON CONFLICT DO NOTHING: chạy lại init script không bị lỗi duplicate
INSERT INTO vehicles (plate_number, vehicle_type, status) VALUES
    ('59A-12345', 'truck', 'active'),
    ('59A-67890', 'van', 'active'),
    ('51B-11111', 'truck', 'active'),
    ('51B-22222', 'motorcycle', 'active'),
    ('30A-99999', 'truck', 'maintenance')
ON CONFLICT (plate_number) DO NOTHING;

-- ============================================
-- 6. Compression Policy — nén data cũ tự động
-- ============================================
-- Segment by vehicle_id: mỗi xe được nén riêng → query 1 xe không decompress tất cả
-- Order by ts DESC: tối ưu cho range query (WHERE ts > ...)
-- Chunk > 7 ngày được nén tự động, tiết kiệm ~90% disk
ALTER TABLE vehicle_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'vehicle_id',
    timescaledb.compress_orderby = 'ts DESC'
);

SELECT add_compression_policy('vehicle_telemetry', INTERVAL '7 days', if_not_exists => TRUE);

-- ============================================
-- 7. Continuous Aggregate — pre-compute thống kê theo giờ
-- ============================================
-- Continuous aggregate = materialized view tự động refresh
-- Dashboard đọc từ view này thay vì query trực tiếp hypertable → nhanh hơn 10-100x
-- Refresh policy: cập nhật data từ 3h trước đến 1h trước, mỗi giờ 1 lần
CREATE MATERIALIZED VIEW IF NOT EXISTS vehicle_speed_hourly
WITH (timescaledb.continuous) AS
SELECT
    vehicle_id,
    time_bucket('1 hour', ts) AS bucket,
    AVG(speed) AS avg_speed,
    MAX(speed) AS max_speed,
    MIN(speed) AS min_speed,
    COUNT(*) AS total_points
FROM vehicle_telemetry
GROUP BY vehicle_id, time_bucket('1 hour', ts)
WITH NO DATA;

SELECT add_continuous_aggregate_policy('vehicle_speed_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- ============================================
-- 8. Bảng tổng hợp hàng ngày (target của Batch Job)
-- ============================================
-- UNIQUE(vehicle_id, summary_date): cho phép ON CONFLICT DO UPDATE (idempotent upsert)
-- Batch job Python ghi vào bảng này mỗi ngày
CREATE TABLE IF NOT EXISTS daily_vehicle_summary (
    id                    SERIAL PRIMARY KEY,
    vehicle_id            INT NOT NULL REFERENCES vehicles(id),
    summary_date          DATE NOT NULL,
    total_distance_km     NUMERIC(10, 2) DEFAULT 0,
    avg_speed             NUMERIC(6, 2) DEFAULT 0,
    max_speed             NUMERIC(6, 2) DEFAULT 0,
    total_points          INT DEFAULT 0,
    speeding_violations   INT DEFAULT 0,
    critical_violations   INT DEFAULT 0,
    engine_off_moving     INT DEFAULT 0,
    total_driving_minutes NUMERIC(8, 2) DEFAULT 0,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vehicle_id, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_summary_date
    ON daily_vehicle_summary(summary_date DESC);

-- ============================================
-- 9. Bảng ghi nhận dữ liệu bị reject (Data Quality)
-- ============================================
-- Lưu raw_payload dạng JSONB để audit trail — xem lại data gốc khi debug
-- vehicle_id nullable vì bản ghi với vehicleId không hợp lệ cũng cần được log
CREATE TABLE IF NOT EXISTS data_quality_rejected (
    id               SERIAL PRIMARY KEY,
    vehicle_id       INT,
    raw_payload      JSONB NOT NULL,
    rejection_reason TEXT NOT NULL,
    rejected_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dq_rejected_at
    ON data_quality_rejected(rejected_at DESC);
