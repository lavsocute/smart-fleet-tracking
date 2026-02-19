"""
Daily Vehicle Summary — Batch Aggregation Job

Tính toán chỉ số vận hành hàng ngày cho từng xe từ dữ liệu GPS thô:
- Tổng quãng đường (công thức Haversine)
- Thống kê tốc độ (trung bình, tối đa)
- Số lần vi phạm (vượt tốc, nghiêm trọng, engine tắt nhưng xe chạy)
- Tổng thời gian lái xe

Thiết kế:
    Dùng Python thuần + psycopg2 thay vì NestJS/TypeORM vì:
    1. Batch job không cần web framework — thêm overhead không cần thiết
    2. Pure SQL + Python là pattern phổ biến trong Data Engineering thực tế
    3. Dễ schedule bằng cron / Airflow / Kubernetes CronJob

Usage:
    python scripts/daily_aggregation.py                    # hôm qua
    python scripts/daily_aggregation.py --date 2026-02-17  # ngày cụ thể
"""

import os
import sys
import math
import argparse
import logging
from datetime import date, timedelta, datetime
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("daily_aggregation")

# Config từ environment — giống .env của Docker Compose, dễ deploy lên server khác
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_NAME", "fleet_tracking"),
    "user": os.getenv("DB_USER", "fleet_user"),
    "password": os.getenv("DB_PASSWORD", "fleet_pass"),
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Tính khoảng cách giữa 2 điểm GPS bằng công thức Haversine (đơn vị: km).
    Dùng Haversine thay vì Euclidean vì Trái Đất là hình cầu —
    Euclidean sai lệch lớn ở khoảng cách > 1km.
    """
    R = 6371.0  # Bán kính Trái Đất (km)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def fetch_daily_telemetry(conn, vehicle_id: int, target_date: date) -> list:
    """Lấy tất cả GPS points của 1 xe trong 1 ngày, sắp theo thời gian."""
    query = """
        SELECT ts, latitude, longitude, speed, engine_status
        FROM vehicle_telemetry
        WHERE vehicle_id = %s
          AND ts >= %s
          AND ts < %s
        ORDER BY ts ASC;
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, (vehicle_id, target_date, target_date + timedelta(days=1)))
        return cur.fetchall()


def compute_summary(vehicle_id: int, target_date: date, rows: list) -> dict:
    """
    Tổng hợp metrics từ dữ liệu GPS thô.
    Chạy trên Python thay vì SQL window function vì:
    - Haversine không có native function trong PostgreSQL
    - Logic lọc GPS noise (>50km) cần xử lý tuần tự
    """
    if not rows:
        return {
            "vehicle_id": vehicle_id,
            "summary_date": target_date,
            "total_distance_km": 0,
            "avg_speed": 0,
            "max_speed": 0,
            "total_points": 0,
            "speeding_violations": 0,
            "critical_violations": 0,
            "engine_off_moving": 0,
            "total_driving_minutes": 0,
        }

    total_distance = 0.0
    speeds = []
    speeding = 0
    critical = 0
    engine_off_moving = 0
    driving_seconds = 0.0

    for i, row in enumerate(rows):
        speed = float(row["speed"])
        speeds.append(speed)

        # Tính khoảng cách giữa 2 điểm liên tiếp
        if i > 0:
            prev = rows[i - 1]
            dist = haversine_km(
                float(prev["latitude"]),
                float(prev["longitude"]),
                float(row["latitude"]),
                float(row["longitude"]),
            )
            # Lọc GPS noise: >50km giữa 2 điểm liên tiếp = GPS jump, bỏ qua
            if dist < 50:
                total_distance += dist

        # Đếm vi phạm tốc độ theo ngưỡng VN
        if speed > 120:
            critical += 1
        elif speed > 80:
            speeding += 1

        # Engine tắt mà xe vẫn chạy: nghi ngờ kéo xe / trộm xe
        if not row["engine_status"] and speed > 0:
            engine_off_moving += 1

        # Ước lượng thời gian lái: engine ON + gap < 5 phút giữa 2 points
        # Gap > 5 phút = xe dừng hoặc mất tín hiệu, không tính vào driving time
        if i > 0 and row["engine_status"]:
            prev_ts = rows[i - 1]["ts"]
            curr_ts = row["ts"]
            delta = (curr_ts - prev_ts).total_seconds()
            if delta < 300:
                driving_seconds += delta

    return {
        "vehicle_id": vehicle_id,
        "summary_date": target_date,
        "total_distance_km": round(total_distance, 2),
        "avg_speed": round(sum(speeds) / len(speeds), 2) if speeds else 0,
        "max_speed": round(max(speeds), 2) if speeds else 0,
        "total_points": len(rows),
        "speeding_violations": speeding,
        "critical_violations": critical,
        "engine_off_moving": engine_off_moving,
        "total_driving_minutes": round(driving_seconds / 60, 2),
    }


def upsert_summary(conn, summary: dict):
    """
    Ghi kết quả vào bảng daily_vehicle_summary.
    Dùng ON CONFLICT DO UPDATE (Idempotent Upsert) để:
    - Chạy lại batch job không tạo duplicate
    - Fix bug rồi re-run mà không cần xóa data cũ
    """
    query = """
        INSERT INTO daily_vehicle_summary
            (vehicle_id, summary_date, total_distance_km, avg_speed, max_speed,
             total_points, speeding_violations, critical_violations,
             engine_off_moving, total_driving_minutes)
        VALUES
            (%(vehicle_id)s, %(summary_date)s, %(total_distance_km)s, %(avg_speed)s,
             %(max_speed)s, %(total_points)s, %(speeding_violations)s,
             %(critical_violations)s, %(engine_off_moving)s, %(total_driving_minutes)s)
        ON CONFLICT (vehicle_id, summary_date) DO UPDATE SET
            total_distance_km     = EXCLUDED.total_distance_km,
            avg_speed             = EXCLUDED.avg_speed,
            max_speed             = EXCLUDED.max_speed,
            total_points          = EXCLUDED.total_points,
            speeding_violations   = EXCLUDED.speeding_violations,
            critical_violations   = EXCLUDED.critical_violations,
            engine_off_moving     = EXCLUDED.engine_off_moving,
            total_driving_minutes = EXCLUDED.total_driving_minutes,
            created_at            = NOW();
    """
    with conn.cursor() as cur:
        cur.execute(query, summary)
    conn.commit()


def get_active_vehicles(conn) -> list:
    """Lấy danh sách xe active — chỉ chạy batch cho xe đang hoạt động."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT id FROM vehicles WHERE status = 'active' ORDER BY id;")
        return [row["id"] for row in cur.fetchall()]


def run(target_date: date):
    """Entry point — xử lý tuần tự từng xe để kiểm soát memory."""
    logger.info(f"{'='*50}")
    logger.info(f"Daily Aggregation Job — {target_date}")
    logger.info(f"{'='*50}")

    conn = psycopg2.connect(**DB_CONFIG)
    try:
        vehicles = get_active_vehicles(conn)
        logger.info(f"Found {len(vehicles)} active vehicles")

        total_points = 0
        total_violations = 0

        for vid in vehicles:
            rows = fetch_daily_telemetry(conn, vid, target_date)
            summary = compute_summary(vid, target_date, rows)
            upsert_summary(conn, summary)

            total_points += summary["total_points"]
            total_violations += summary["speeding_violations"] + summary["critical_violations"]

            logger.info(
                f"  Vehicle #{vid}: {summary['total_points']} points, "
                f"{summary['total_distance_km']} km, "
                f"max {summary['max_speed']} km/h, "
                f"{summary['speeding_violations']} speeding + "
                f"{summary['critical_violations']} critical violations"
            )

        logger.info(f"{'='*50}")
        logger.info(f"DONE — {len(vehicles)} vehicles, {total_points} points, {total_violations} violations")
        logger.info(f"{'='*50}")

    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Daily Vehicle Summary Aggregation")
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Target date (YYYY-MM-DD). Default: yesterday",
    )
    args = parser.parse_args()

    if args.date:
        target = datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        target = date.today() - timedelta(days=1)

    run(target)
