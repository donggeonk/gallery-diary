import os
import cv2
from ultralytics import YOLO

def calculate_iop(person_box, object_box):
    """Intersection over Person Area (IoP)"""
    xA = max(person_box[0], object_box[0])
    yA = max(person_box[1], object_box[1])
    xB = min(person_box[2], object_box[2])
    yB = min(person_box[3], object_box[3])

    inter_area = max(0, xB - xA) * max(0, yB - yA)
    person_area = (person_box[2] - person_box[0]) * (person_box[3] - person_box[1])
    
    if person_area == 0:
        return 0.0
        
    return inter_area / person_area

def format_time(seconds):
    """Convert seconds to MM:SS format"""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}"

def main():
    # 1. Configuration
    model = YOLO('yolov8n.pt')
    target_classes = [0, 56, 59, 60]  # person, chair, bed, dining table
    IOP_THRESHOLD = 0.7
    
    # Path to your test video (you'll need to add a video to your data folder)
    input_video_path = 'data/video/room_video.mp4' 
    output_video_path = 'data/video/output_room_video.mp4'
    
    if not os.path.exists(input_video_path):
        print(f"Error: Could not find video at {input_video_path}")
        return

    # 2. Setup Video Capture & Writer
    cap = cv2.VideoCapture(input_video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))

    # 3. State Machine Variables
    current_action = None
    action_start_time = 0.0

    print(f"Processing video: {input_video_path} at {fps} FPS")
    print("-" * 40)
    print("TIMELINE LOG:")

    frame_count = 0

    # 4. Process Frame by Frame
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break

        frame_count += 1
        current_time_sec = frame_count / fps

        # Run inference (stream=True is memory efficient for videos)
        results = model(frame, classes=target_classes, verbose=False)
        result = results[0] # Only one frame at a time
        
        persons, beds, work_objects = [], [], []
        
        # Categorize
        for box in result.boxes:
            cls_id = int(box.cls[0])
            coords = box.xyxy[0].tolist()
            if cls_id == 0:
                persons.append(coords)
            elif cls_id == 59:
                beds.append(coords)
            elif cls_id in [56, 60]:
                work_objects.append(coords)

        # Determine Frame Action (Assuming 1 primary person for timeline simplicity)
        frame_action = "Idle/Other"
        if not persons:
            frame_action = "Person not detected"
        else:
            # We take the first person found [0] to simplify timeline logging
            person_box = persons[0]
            max_bed_iop = max([calculate_iop(person_box, bed) for bed in beds], default=0.0)
            max_work_iop = max([calculate_iop(person_box, obj) for obj in work_objects], default=0.0)
            
            if max_bed_iop > IOP_THRESHOLD and max_bed_iop > max_work_iop:
                frame_action = "Sleeping"
            elif max_work_iop > IOP_THRESHOLD and max_work_iop > max_bed_iop:
                frame_action = "Working"
            elif max_bed_iop > IOP_THRESHOLD:
                frame_action = "Sleeping"
            elif max_work_iop > IOP_THRESHOLD:
                frame_action = "Working"

        # 5. State Machine: Check if the action changed
        if frame_action != current_action:
            # If we were tracking a previous action, log how long it lasted before switching
            if current_action is not None:
                start_str = format_time(action_start_time)
                end_str = format_time(current_time_sec)
                print(f"{start_str} - {end_str}: {current_action}")
            
            # Start tracking the new action
            current_action = frame_action
            action_start_time = current_time_sec

        # Write the annotated frame to the output video
        annotated_frame = result.plot()
        out.write(annotated_frame)

    # Log the final action when the video ends
    if current_action is not None:
        start_str = format_time(action_start_time)
        end_str = format_time(frame_count / fps)
        print(f"{start_str} - {end_str}: {current_action}")

    print("-" * 40)
    print(f"Done. Output video saved to: {output_video_path}")
    
    cap.release()
    out.release()

if __name__ == "__main__":
    main()