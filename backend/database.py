import os
from sqlalchemy import create_engine, Column, String, Text
from sqlalchemy.orm import sessionmaker, declarative_base

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

SQLALCHEMY_DATABASE_URL = "sqlite:///./data/surveillance.db"

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

# Create tables
Base.metadata.create_all(bind=engine)
