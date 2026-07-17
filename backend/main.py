import os
import uuid
import shutil
import subprocess
import json
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Dict
from dotenv import load_dotenv
import cv2
from fastapi.responses import FileResponse

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env", override=True)

from .database import SessionLocal, DailyLog
from .summarizer import VLMProcessingError, generate_summary

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

def extract_metadata_from_video(video_path: str):
    """
    Attempts to extract GPS and Date metadata using ffprobe.
    Checks general tags as well as Apple-specific QuickTime tags and stream tags.
    If unavailable, falls back to a simulated location and None for date.
    """
    lat, lon, creation_date = None, None, None
    if not shutil.which("ffprobe"):
        print("Metadata extraction skipped: ffprobe is not installed. Install ffmpeg to read video date/GPS tags.")
        return lat, lon, creation_date

    try:
        cmd = [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_format", "-show_streams", video_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        data = json.loads(result.stdout)
        
        import re
        
        lat_found = False
        date_found = False
        
        # 1. Check top-level format tags
        tags = data.get("format", {}).get("tags", {})
        
        # Apple stores location in com.apple.quicktime.location.ISO6709
        location_str = tags.get("location") or tags.get("location-eng") or tags.get("com.apple.quicktime.location.ISO6709")
        if location_str:
            # Matches formats like +37.7749-122.4194/ or +38.7167-009.1333+000.000/
            match = re.search(r'([+-]\d+\.\d+)([+-]\d+\.\d+)', location_str)
            if match:
                lat = float(match.group(1))
                lon = float(match.group(2))
                lat_found = True
        
        c_time = tags.get("creation_time")
        if c_time:
            creation_date = c_time.split("T")[0]
            date_found = True
            
        # 2. Check stream-level tags if missing
        if not lat_found or not date_found:
            for stream in data.get("streams", []):
                stream_tags = stream.get("tags", {})
                
                if not lat_found:
                    loc = stream_tags.get("location") or stream_tags.get("location-eng") or stream_tags.get("com.apple.quicktime.location.ISO6709")
                    if loc:
                        match = re.search(r'([+-]\d+\.\d+)([+-]\d+\.\d+)', loc)
                        if match:
                            lat = float(match.group(1))
                            lon = float(match.group(2))
                            lat_found = True
                            
                if not date_found:
                    st_time = stream_tags.get("creation_time")
                    if st_time:
                        creation_date = st_time.split("T")[0]
                        date_found = True
                        
    except Exception as e:
        print(f"Metadata extraction failed: {e}")
        
    return lat, lon, creation_date

# In-memory dictionary to track async tasks (since we don't have Celery)
# Format: { "task_uuid": { "status": "processing"|"completed"|"error", "summary": "...", "date": "..." } }
tasks: Dict[str, dict] = {}

def extract_summary_title(summary_text: str) -> str:
    """Use the VLM's Title line as the gallery menu label."""
    for line in (summary_text or "").splitlines():
        clean_line = line.strip()
        if clean_line.lower().startswith("title:"):
            title = clean_line.split(":", 1)[1].strip()
            if title:
                return title

    fallback = " ".join((summary_text or "").split())
    return fallback[:60] + ("..." if len(fallback) > 60 else "") if fallback else "Untitled log"

def process_video_task(task_id: str, video_path: str, date: str, lat: float, lon: float):
    """Background task to run Yolo processing and save to DB."""
    try:
        # Run Heavy ML Logic
        summary_text = generate_summary(video_path)
        
        # Save to Database using a fresh session
        db = SessionLocal()
        try:
            new_log = DailyLog(date=date, video_path=video_path, summary=summary_text, latitude=lat, longitude=lon)
            db.add(new_log)
            db.commit()
            db.refresh(new_log)
            log_id = new_log.id
        finally:
            db.close()
        
        # Update Task Status
        tasks[task_id] = {
            "status": "completed",
            "log_id": log_id,
            "title": extract_summary_title(summary_text),
            "summary": summary_text,
            "date": date,
            "lat": lat,
            "lon": lon
        }
    except VLMProcessingError as e:
        tasks[task_id] = {"status": "error", "error": str(e), "date": date}
    except Exception as e:
        tasks[task_id] = {"status": "error", "error": str(e)}

@app.post("/api/upload")
async def upload_video(
    background_tasks: BackgroundTasks, 
    date: str = Form(...), 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    content_type = file.content_type or ""
    filename = file.filename or ""
    is_video = content_type.startswith("video/") or filename.lower().endswith((".mov", ".mp4"))
    if not is_video:
        return {"error": "File not supported. Please upload a video."}
        
    import tempfile
    upload_dir = os.path.join(tempfile.gettempdir(), "room_detection_videos")
    os.makedirs(upload_dir, exist_ok=True)
    video_path = os.path.join(upload_dir, filename)
    
    # Save video chunk by chunk
    with open(video_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Extract metadata immediately to correct the tracking date if present
    lat, lon, creation_date = extract_metadata_from_video(video_path)
    actual_date = creation_date if creation_date else date
    
    # Generate unique task id
    task_id = str(uuid.uuid4())
    tasks[task_id] = {"status": "processing", "date": actual_date}
    
    # Run the heavy video parsing in the background
    background_tasks.add_task(process_video_task, task_id, video_path, actual_date, lat, lon)
    
    return {"task_id": task_id, "message": "Logging Video...", "date": actual_date}

@app.get("/api/status/{task_id}")
def get_task_status(task_id: str):
    """Poll endpoint to check background task status."""
    return tasks.get(task_id, {"status": "not_found"})

@app.get("/api/logs")
def get_all_logs(db: Session = Depends(get_db)):
    """Fetch all saved video summaries from DB."""
    logs = db.query(DailyLog).order_by(DailyLog.date.desc(), DailyLog.id.desc()).all()
    grouped_logs = {}
    for log in logs:
        grouped_logs.setdefault(log.date, []).append({
            "id": log.id,
            "date": log.date,
            "title": extract_summary_title(log.summary),
            "summary": log.summary,
            "lat": log.latitude,
            "lon": log.longitude
        })
    return grouped_logs

@app.delete("/api/logs/{log_id}")
def delete_log(log_id: int, db: Session = Depends(get_db)):
    """Delete a single log from the database."""
    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()
    if not log:
        return {"error": "Log not found"}

    db.delete(log)
    db.commit()
    return {"status": "deleted", "log_id": log_id}

def thumbnail_response_for_log(log: DailyLog, thumb_name: str):
    if not log or not log.video_path or not os.path.exists(log.video_path):
        return {"error": "Video not found"}

    thumb_dir = PROJECT_ROOT / "data" / "thumbnails"
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumb_dir / thumb_name

    # Generate thumbnail if it doesn't exist yet
    if not thumb_path.exists():
        cap = cv2.VideoCapture(log.video_path)
        success, frame = cap.read()
        cap.release()
        if success:
            cv2.imwrite(str(thumb_path), frame)
        else:
            return {"error": "Could not extract thumbnail"}

    return FileResponse(thumb_path)

@app.get("/api/thumbnail/log/{log_id}")
def get_log_thumbnail(log_id: int, db: Session = Depends(get_db)):
    """Extracts and returns the first frame for a specific log."""
    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()
    return thumbnail_response_for_log(log, f"log-{log_id}.jpg")

@app.get("/api/thumbnail/{date}")
def get_thumbnail(date: str, db: Session = Depends(get_db)):
    """Extracts and returns the newest first frame for a specific date."""
    log = db.query(DailyLog).filter(DailyLog.date == date).order_by(DailyLog.id.desc()).first()
    return thumbnail_response_for_log(log, f"{date}.jpg")
