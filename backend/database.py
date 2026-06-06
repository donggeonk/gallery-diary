import os
from pathlib import Path
from sqlalchemy import create_engine, Column, String, Text, Float
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

    date = Column(String, primary_key=True, index=True) # Format: YYYY-MM-DD
    video_path = Column(String)
    summary = Column(Text)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

# Create tables
Base.metadata.create_all(bind=engine)
