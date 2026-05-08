import os
import uuid
import shutil
from fastapi import FastAPI, UploadFile, File, Form, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Dict
from dotenv import load_dotenv

load_dotenv()

from .database import SessionLocal, DailyLog
from .summarizer import generate_summary

app = FastAPI()

# Allow frontend to access API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# In-memory dictionary to track async tasks (since we don't have Celery)
# Format: { "task_uuid": { "status": "processing"|"completed"|"error", "summary": "...", "date": "..." } }
tasks: Dict[str, dict] = {}

def process_video_task(task_id: str, video_path: str, date: str, db: Session):
    """Background task to run Yolo processing and save to DB."""
    try:
        # Run Heavy ML Logic
        summary_text = generate_summary(video_path)
        
        # Save to Database
        existing_log = db.query(DailyLog).filter(DailyLog.date == date).first()
        if existing_log:
            existing_log.video_path = video_path
            existing_log.summary = summary_text
        else:
            new_log = DailyLog(date=date, video_path=video_path, summary=summary_text)
            db.add(new_log)
        db.commit()
        
        # Update Task Status
        tasks[task_id] = {"status": "completed", "summary": summary_text, "date": date}
    except Exception as e:
        tasks[task_id] = {"status": "error", "error": str(e)}

@app.post("/api/upload")
async def upload_video(
    background_tasks: BackgroundTasks, 
    date: str = Form(...), 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    if not file.content_type.startswith("video/"):
        return {"error": "File not supported. Please upload a video."}
        
    os.makedirs("data/uploaded_videos", exist_ok=True)
    video_path = f"data/uploaded_videos/{file.filename}"
    
    # Save video chunk by chunk
    with open(video_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Generate unique task id
    task_id = str(uuid.uuid4())
    tasks[task_id] = {"status": "processing", "date": date}
    
    # Run the heavy video parsing in the background
    background_tasks.add_task(process_video_task, task_id, video_path, date, db)
    
    return {"task_id": task_id, "message": "Logging Video..."}

@app.get("/api/status/{task_id}")
def get_task_status(task_id: str):
    """Poll endpoint to check background task status."""
    return tasks.get(task_id, {"status": "not_found"})

@app.get("/api/logs")
def get_all_logs(db: Session = Depends(get_db)):
    """Fetch all saved video summaries from DB."""
    logs = db.query(DailyLog).all()
    # Return as { "2026-05-01": "00:00 - 00:03 Working...", ... }
    return {log.date: log.summary for log in logs}
