import os
from pathlib import Path
from sqlalchemy import create_engine, Column, String, Text, Float, Integer
from sqlalchemy.orm import sessionmaker, declarative_base

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DATA_DIR / 'surveillance.db'}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class DailyLog(Base):
    __tablename__ = "daily_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date = Column(String, index=True, nullable=False) # Format: YYYY-MM-DD
    video_path = Column(String)
    summary = Column(Text)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

def migrate_daily_logs_schema():
    """Move older one-log-per-date tables to the multi-log schema."""
    with engine.begin() as conn:
        table_exists = conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='daily_logs'"
        ).fetchone()
        if not table_exists:
            return

        columns = conn.exec_driver_sql("PRAGMA table_info(daily_logs)").fetchall()
        column_names = [column[1] for column in columns]
        primary_key_columns = [column[1] for column in columns if column[5]]

        if "id" in column_names and primary_key_columns == ["id"]:
            return

        conn.exec_driver_sql("ALTER TABLE daily_logs RENAME TO daily_logs_old")
        conn.exec_driver_sql("DROP INDEX IF EXISTS ix_daily_logs_date")
        conn.exec_driver_sql(
            """
            CREATE TABLE daily_logs (
                id INTEGER NOT NULL,
                date VARCHAR NOT NULL,
                video_path VARCHAR,
                summary TEXT,
                latitude FLOAT,
                longitude FLOAT,
                PRIMARY KEY (id)
            )
            """
        )
        conn.exec_driver_sql("CREATE INDEX ix_daily_logs_date ON daily_logs (date)")
        conn.exec_driver_sql(
            """
            INSERT INTO daily_logs (date, video_path, summary, latitude, longitude)
            SELECT date, video_path, summary, latitude, longitude
            FROM daily_logs_old
            """
        )
        conn.exec_driver_sql("DROP TABLE daily_logs_old")

# Create tables
migrate_daily_logs_schema()
Base.metadata.create_all(bind=engine)
