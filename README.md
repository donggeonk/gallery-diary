# Surveillance Analysis: Video Diary Dashboard

This project transforms standard room surveillance video into an interactive "activity diary". By uploading video files into a web dashboard, the system utilizes AI models to semantically analyze the video and logs the activities onto a monthly calendar UI. 

Currently, the app leverages a FastAPI backend, a vanilla HTML/JS frontend, and SQLite database to track daily logs. Upcoming updates will introduce advanced Vision-Language Models (VLMs), an interactive map, and search functionalities.

## Current Features
*   **Calendar-Based Daily Logs**: Navigate through months and click dates to view saved logs.
*   **Video Upload Interface**: Clean UI to upload local surveillance clips.
*   **Asynchronous Processing**: FastAPI backend processes videos in the background using `BackgroundTasks` without blocking the user.
*   **Activity Breakdown**: Analyzes frames locally (currently via object matching, migrating to VLM) to output timestamped summaries (e.g. `00:00 - 00:03: Working | Breakdown -> Working: 81`).

## Tech Stack
*   **Frontend**: Vanilla HTML5, CSS3, JavaScript (Fetch API).
*   **Backend**: Python, FastAPI, Uvicorn, SQLAlchemy.
*   **Database**: SQLite (`database.py`).
*   **AI/ML**: Ultralytics YOLO-World (Currently handling frame-by-frame object detection).

## Setup & Running

1. **Activate Virtual Environment**
   ```bash
   source venv/bin/activate
   ```

2. **Run Backend (FastAPI)**
   ```bash
   uvicorn backend.main:app --reload
   ```

3. **Run Frontend**
   Open a separate terminal, navigate to the `frontend/` folder, and run:
   ```bash
   python -m http.server 8080
   ```
   Then navigate to `http://localhost:8080` in your web browser.

## Future Plans (Roadmap)
1. **Migration to VLM**: Replace YOLO-based bounding box intersections with Vision-Language Models (VLM) using Google Gemini 1.5 Flash for true, generalized semantic summary generation.
2. **Interactive Map**: Add spatial mapping of the analyzed room to see *where* activities frequently occur.
3. **Advanced Search Bar**: Query past diaries (e.g., "When did I drink coffee last week?").