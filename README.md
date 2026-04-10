## Plan: Room Action Recognition using YOLOv8

This project detects objects (person, bed, chair, desk/table) in a room video and logs actions (sleeping, working, etc.) based on the Intersection over Union (IoU) of bounding boxes. We will use YOLOv8 via Python's `ultralytics` package for state-of-the-art detection out of the box.

**Steps**

1. **Setup & Single Image Detection (Phase 1)**
   - Create a Python script (`detect_image.py`) and a `requirements.txt` containing `opencv-python` and `ultralytics`.
   - Initialize a pre-trained YOLOv8 model (`yolov8n.pt`).
   - Run inference on a test image from the `data/` folder.
   - Filter YOLO detections for specific classes: person (0), chair (56), bed (59), and dining table (60) as a proxy for "desk".
   - Draw tight bounding boxes around these four identified objects and output the annotated image.

2. **Bounding Box Logging & IoU Logic (Phase 2)**
   - *Depends on Phase 1*
   - Implement an IoU (Intersection over Union) / target-overlap calculation function.
   - Define thresholds:
     - IF person & bed overlap > threshold -> Action = "Sleeping".
     - IF person & desk/chair overlap > threshold -> Action = "Working".
     - Else -> Action = "Idle/Other".

3. **Video Processing & Timeline Generation (Phase 3)**
   - *Depends on Phase 2*
   - Create a main script (`analyze_video.py`) that reads a video frame-by-frame.
   - Run the YOLO model per frame and calculate bounding box overlaps.
   - Track actions frame-over-frame (state machine), capturing start time and end time for each sustained action.
   - Print a text-based terminal output summarizing the timeline (e.g. `00:00:15 - 00:04:30: Sleeping`).

**Relevant files**
- `requirements.txt` — to store basic Python dependencies.
- `detect_image.py` — script to validate object classes (bed, chair, dining table, person) on a single test frame.
- `analyze_video.py` — logic for video parsing, bounding box IoU state tracking, and formatted text output.

**Verification**
1. Run `detect_image.py` on a sample frame to visually confirm that the chosen COCO classes robustly detect your specific bed, desk, chair, and person.
2. Run `analyze_video.py` on a short (10-30s) sample target video to confirm that start/end timestamps are accurately captured when a user enters/exits the "sleeping" or "working" overlap zones.

**Decisions**
- Using YOLOv8 (`ultralytics`) due to superior out-of-the-box accuracy compared to OpenCV Haarcascades/DNN.
- Using Python as the development language.
- Using the standard COCO "dining table" (class 60) as a proxy for "desk" to avoid immediate need for custom model training.