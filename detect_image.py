import os
import cv2
from ultralytics import YOLO

def main():
    # 1. Load the pre-trained YOLOv8 nano model
    model = YOLO('yolov8n.pt')

    # 2. Hardcode the input path and dynamically generate the output path
    input_image_path = 'data/room3.jpeg' 
    
    directory = os.path.dirname(input_image_path)
    filename = os.path.basename(input_image_path)
    output_image_path = os.path.join(directory, f"output_{filename}")

    # 3. Define the COCO classes:
    # 0 = person, 56 = chair, 59 = bed, 60 = dining table
    target_classes = [0, 56, 59, 60]

    print(f"Running YOLO on {input_image_path}...")

    # 4. Run inference on a single image by filtering classes directly in the model call
    results = model(input_image_path, classes=target_classes)

    # 5. Process and save the annotated output
    # `results` is a list, but we only passed one image, so we access the first element
    for result in results:
        # result.plot() automatically generates the image array with bounding boxes, 
        # class labels, and confidence (accuracy) scores drawn on it.
        annotated_frame = result.plot()
        
        # Save the result to disk
        cv2.imwrite(output_image_path, annotated_frame)
        print(f"Annotated image saved to: {output_image_path}")

if __name__ == "__main__":
    main()