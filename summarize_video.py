import os
import cv2
from collections import Counter
from ultralytics import YOLOWorld

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
    # Load YOLO-World (downloads yolov8s-world.pt automatically)
    model = YOLOWorld('yolov8s-world.pt')
    
    # Define custom open-vocabulary classes. 
    # This automatically assigns IDs based on list order:
    # 0 = person, 1 = chair, 2 = bed, 3 = desk
    custom_classes = ["person", "chair", "bed", "study desk"]
    model.set_classes(custom_classes)
    
    SLEEPING_THRESHOLD = 0.7
    WORKING_THRESHOLD = 0.1
    
    input_video_path = 'data/video/room_video_2.mp4' 
    
    # 2. Dynamically generate the output path
    directory = os.path.dirname(input_video_path)
    filename = os.path.basename(input_video_path)
    output_video_path = os.path.join(directory, f"world_output_{filename}")
    
    if not os.path.exists(input_video_path):
        print(f"Error: Could not find video at {input_video_path}")
        return

    # Setup Video Capture & Writer
    cap = cv2.VideoCapture(input_video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))

    # 3. Buffer Variables for 3-second smoothing
    frames_per_window = int(fps * 3)  
    action_buffer = []                
    window_start_time = 0.0

    print(f"Processing video: {input_video_path} at {fps} FPS")
    print(f"Evaluating actions in 3-second chunks ({frames_per_window} frames/chunk)")
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

        # Run inference 
        results = model(frame, verbose=False)
        result = results[0] 
        
        persons, beds, work_objects = [], [], []
        
        # Categorize using the new YOLO-World class IDs
        for box in result.boxes:
            cls_id = int(box.cls[0])
            coords = box.xyxy[0].tolist()
            
            if cls_id == 0:    # person
                persons.append(coords)
            elif cls_id == 2:  # bed
                beds.append(coords)
            elif cls_id in [1, 3]: # chair or desk
                work_objects.append(coords)

        # Determine instant frame action
        frame_action = "Idle/Other"
        if not persons:
            frame_action = "Person not detected"
        else:
            person_box = persons[0]
            max_bed_iop = max([calculate_iop(person_box, bed) for bed in beds], default=0.0)
            max_work_iop = max([calculate_iop(person_box, obj) for obj in work_objects], default=0.0)
            
            if max_bed_iop > SLEEPING_THRESHOLD and max_bed_iop > max_work_iop:
                frame_action = "Sleeping"
            elif max_work_iop > WORKING_THRESHOLD and max_work_iop > max_bed_iop:
                frame_action = "Working"
            elif max_bed_iop > SLEEPING_THRESHOLD:
                frame_action = "Sleeping"
            elif max_work_iop > WORKING_THRESHOLD:
                frame_action = "Working"

        # 5. Add to buffer and evaluate every 3 seconds
        action_buffer.append(frame_action)
        
        if len(action_buffer) == frames_per_window:
            # Find the most common action and log the counts
            action_counts = Counter(action_buffer)
            most_common_action = action_counts.most_common(1)[0][0]
            
            start_str = format_time(window_start_time)
            end_str = format_time(current_time_sec)
            
            counts_str = ", ".join([f"{k}: {v}" for k, v in action_counts.items()])
            print(f"{start_str} - {end_str}: {most_common_action} | (Breakdown -> {counts_str})")
            
            # Reset buffer for the next window
            action_buffer.clear()
            window_start_time = current_time_sec

        # Annotate output video
        annotated_frame = result.plot()
        out.write(annotated_frame)

    # Evaluate any remaining frames at the end of the video
    if len(action_buffer) > 0:
        action_counts = Counter(action_buffer)
        most_common_action = action_counts.most_common(1)[0][0]
        start_str = format_time(window_start_time)
        end_str = format_time(frame_count / fps)
        counts_str = ", ".join([f"{k}: {v}" for k, v in action_counts.items()])
        print(f"{start_str} - {end_str}: {most_common_action} | (Breakdown -> {counts_str})")

    print("-" * 40)
    print(f"Done. Output video saved to: {output_video_path}")
    
    cap.release()
    out.release()

if __name__ == "__main__":
    main()