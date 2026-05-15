import os
import time
import google.generativeai as genai

def generate_summary(input_video_path: str) -> str:
    """
    Process video with Google Gemini 1.5 Flash VLM and return the textual log.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_api_key_here":
        return "Error: GEMINI_API_KEY is missing. Please add it to your .env file."
        
    genai.configure(api_key=api_key)
    
    if not os.path.exists(input_video_path):
        return f"Error: Could not find video at {input_video_path}"

    try:
        # 1. Upload the file to Gemini
        print(f"Uploading {input_video_path} to Gemini...")
        video_file = genai.upload_file(path=input_video_path)
        
        # 2. Wait for the file to finish processing on Google's servers
        print("Waiting for video processing on Gemini servers...")
        while video_file.state.name == "PROCESSING":
            time.sleep(3)
            video_file = genai.get_file(video_file.name)
            
        if video_file.state.name == "FAILED":
            return "Error: Gemini failed to process the video file."
            
        # 3. Generate the summary using the multimodal model
        print("Generating semantic summary...")
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        prompt = (
            "You are a smart diary assistant. Please watch the uploaded video and provide a brief one-paragraph summary "
            "of the video. Format your output strictly with a summary title and then the paragraph of the summary, like" \
            "Title: [summary title]\nSummary: [summary paragraph]."
        )
        
        response = model.generate_content([video_file, prompt])
        
        # 4. Clean up: Delete the file from Google's servers after processing to maintain privacy
        genai.delete_file(video_file.name)
        
        return response.text
        
    except Exception as e:
        return f"Error during VLM processing: {str(e)}"
