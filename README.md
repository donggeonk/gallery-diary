# VLM Project: Video Diary Dashboard

This project turns videos into text-based summary as an interactive "diary". By uploading video files into a web dashboard, the system utilizes Vision-Language Model (VLM) to semantically analyze the video and logs the activities onto a calendar UI and map.

Currently, the app leverages a FastAPI backend, an HTML/JS frontend, and SQLite database to track daily logs. For video summarization, the system uses Google Gemini 2.5 Flash VLM.

## Current Features
*   **Calendar-Based Logs**: Navigate through months and click dates to view saved logs.
*   **Map-Based Logs**: Navigate through map and click different locations the video was taken to view saved logs.
*   **Video Upload Interface**: Clean UI to upload and play videos.
*   **Asynchronous Processing**: FastAPI backend processes videos through VLM in the background using `BackgroundTasks` without blocking the user.
*   **Activity Breakdown**: Analyzes videos using Google Gemini VLM to generate a semantic summary of the activities in a diary-format.
*   **Advanced Search Bar**: Query past diaries dynamically to find videos containing specific keywords.

## Tech Stack
*   **Frontend**: Vanilla HTML5, CSS3, JavaScript (Fetch API).
*   **Backend**: Python, FastAPI, Uvicorn, SQLAlchemy.
*   **Database**: SQLite (`database.py`).
*   **AI/ML**: Google Gemini VLM (via `google-genai`).

## Setup

Run these commands from the project root:

1. **Create and Activate a Virtual Environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. **Install Python Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Add a Gemini API Key**
   Create a `.env` file in the project root:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

4. **Install ffmpeg for Video Metadata**
   The app can run without this, but date/GPS extraction from uploaded videos requires `ffprobe`, which is included with `ffmpeg`.
   ```bash
   brew install ffmpeg
   ```
   Verify it is available:
   ```bash
   ffprobe -version
   ```

## Running the App

Use two terminal windows.

1. **Start the Backend**
   From the project root:
   ```bash
   source venv/bin/activate
   uvicorn backend.main:app --reload
   ```
   The backend API runs at `http://127.0.0.1:8000`.

2. **Start the Frontend**
   In a second terminal, from the project root:
   ```bash
   cd frontend
   python3 -m http.server 8080
   ```
   Open `http://localhost:8080` in your browser.

3. **Use the Dashboard**
   Upload an `.mp4` or `.mov` video. The backend will extract available metadata, send the video to Gemini, save the summary in SQLite, and show the
   result on the calendar and map.

## Troubleshooting

*   **Port 8000 is already in use**: Stop the old backend process, or run the backend on another port:
   ```bash
   uvicorn backend.main:app --reload --port 8001
   ```
   If you use another backend port, update `API_URL` in
   `frontend/script.js`.
*   **No date/GPS data appears**: Install `ffmpeg` and make sure `ffprobe -version` works in your terminal.
*   **Gemini API key error**: Check that `.env` exists in the project root and contains a valid `GEMINI_API_KEY`.