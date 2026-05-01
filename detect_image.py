import os
import cv2
from ultralytics import YOLO

def calculate_iop(person_box, object_box):
    """
    Calculate the Intersection over Person Area (IoP) of two bounding boxes.
    Box format is expected to be [x1, y1, x2, y2].
    """
    xA = max(person_box[0], object_box[0])
    yA = max(person_box[1], object_box[1])
    xB = min(person_box[2], object_box[2])
    yB = min(person_box[3], object_box[3])

    # Compute the area of intersection
    inter_area = max(0, xB - xA) * max(0, yB - yA)

    # Compute the area of the person bounding box (assumed to be the first argument)
    person_area = (person_box[2] - person_box[0]) * (person_box[3] - person_box[1])
    
    if person_area == 0:
        return 0.0
        
    return inter_area / person_area

def main():
    # 1. Load the pre-trained YOLOv8 nano model
    model = YOLO('yolov8n-oiv7.pt')

    # 2. Hardcode the input path and dynamically generate the output path
    input_image_path = 'data/person/person3.jpeg' 
    
    directory = os.path.dirname(input_image_path)
    filename = os.path.basename(input_image_path)
    output_image_path = os.path.join(directory, f"IOP_{filename}")

    # 3. Define the COCO classes:
    # 0 = person, 56 = chair, 59 = bed, 60 = dining table
    # target_classes = [0, 56, 59, 60]
    target_classes = [34, 104, 153, 381]  # bed, chair, desk, person

    print(f"Running YOLO on {input_image_path}...")

    # 4. Run inference on a single image
    results = model(input_image_path, classes=target_classes)

    # ---------------------------------------------------------
    # Phase 2: Action Detection via IoP
    # ---------------------------------------------------------
    IOP_THRESHOLD = 0.7  # You might want to test this value, 0.7 is a good starting point for IoP
    
    for result in results:
        persons = []
        beds = []
        work_objects = [] # Chairs and dining tables
        
        # Categorize the detected bounding boxes
        for box in result.boxes:
            cls_id = int(box.cls[0])
            coords = box.xyxy[0].tolist() # [x1, y1, x2, y2]
            
            if cls_id == 0:
                persons.append(coords)
            elif cls_id == 59:
                beds.append(coords)
            elif cls_id in [56, 60]:
                work_objects.append(coords)
                
        # Action Logic
        if not persons:
            print("Action: Person not detected")
        else:
            # Evaluate the action for each person in the room
            for i, person_box in enumerate(persons):
                max_bed_iop = max([calculate_iop(person_box, bed) for bed in beds], default=0.0)
                max_work_iop = max([calculate_iop(person_box, obj) for obj in work_objects], default=0.0)
                
                action = "Idle/Other"
                
                # Check thresholds to estimate action
                if max_bed_iop > IOP_THRESHOLD and max_bed_iop > max_work_iop:
                    action = "Sleeping"
                elif max_work_iop > IOP_THRESHOLD and max_work_iop > max_bed_iop:
                    action = "Working"
                # Tie breakers if both exceed threshold equally
                elif max_bed_iop > IOP_THRESHOLD:
                    action = "Sleeping"
                elif max_work_iop > IOP_THRESHOLD:
                    action = "Working"

                print(f"Person {i+1} Action: {action} (Bed IoP: {max_bed_iop:.2f}, Work Object IoP: {max_work_iop:.2f})")

        # 5. Process and save the annotated output
        annotated_frame = result.plot()
        
        # Save the result to disk
        cv2.imwrite(output_image_path, annotated_frame)
        print(f"Annotated image saved to: {output_image_path}")

if __name__ == "__main__":
    main()