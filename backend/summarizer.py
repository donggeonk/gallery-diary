import os
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai


PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env", override=True)


class VLMProcessingError(RuntimeError):
    """Raised when Gemini cannot process a video."""


def _get_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key == "your_api_key_here":
        raise VLMProcessingError(
            "GEMINI_API_KEY is missing. Add a valid Gemini API key to the project .env file."
        )
    return api_key


def generate_summary(input_video_path: str) -> str:
    """
    Process video with Google Gemini 2.5 Flash VLM and return the textual log.
    """
    api_key = _get_api_key()
    client = genai.Client(api_key=api_key)
    
    if not os.path.exists(input_video_path):
        raise VLMProcessingError(f"Could not find video at {input_video_path}")

    video_file = None
    try:
        # 1. Upload the file to Gemini via the Client's files API
        print(f"Uploading {input_video_path} to Gemini...")
        video_file = client.files.upload(file=input_video_path)
        
        # 2. Wait for the file to finish processing on Google's servers
        print("Waiting for video processing on Gemini servers...")
        while video_file.state.name == "PROCESSING":
            time.sleep(3)
            # Fetch the updated file status
            video_file = client.files.get(name=video_file.name)
            
        if video_file.state.name == "FAILED":
            raise VLMProcessingError("Gemini failed to process the video file.")
            
        # 3. Generate the summary using the multimodal model
        print("Generating semantic summary...")
        
        prompt = (
            "You are a smart diary assistant. Please watch the uploaded video and provide a brief one-paragraph summary "
            "of the video. Format your output strictly with a summary title and then the paragraph of the summary, like: "
            "Title: [summary title]\nSummary: [summary paragraph]. The summary should be a person's log of the daily activities, "
            "as if the person is writing a diary."
        )
        
        # Pass the model name and the inputs directly into generate_content
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[video_file, prompt]
        )

        if not response.text:
            raise VLMProcessingError("Gemini returned an empty summary.")

        return response.text.strip()
        
    except Exception as e:
        if isinstance(e, VLMProcessingError):
            raise

        message = str(e)
        if "API_KEY_INVALID" in message or "API key not valid" in message:
            raise VLMProcessingError(
                "Gemini API key is invalid. Replace GEMINI_API_KEY in .env with a valid key."
            ) from e

        raise VLMProcessingError(f"Error during VLM processing: {message}") from e
    finally:
        if video_file is not None:
            try:
                client.files.delete(name=video_file.name)
            except Exception as cleanup_error:
                print(f"Could not delete Gemini upload {video_file.name}: {cleanup_error}")
