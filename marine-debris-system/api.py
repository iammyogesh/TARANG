import cv2
import time
import uuid
import numpy as np
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

# Import existing marine-debris-system logic
from ultralytics import YOLO
from data_pipeline import SonarPreprocessor
from geospatial import TowPathEngine, load_tow_path_config
from noise_filter import ConfidenceRefiner
from schemas import BoundingBox, Detection

app = Flask(__name__)
CORS(app)

# Load Model Once Globally at startup (fast inference after that)
MODEL_PATH = "best.pt"
print(f"Loading YOLOv8 model from {MODEL_PATH}...")
model = YOLO(MODEL_PATH)
preprocessor = SonarPreprocessor()
refiner = ConfidenceRefiner()

# Load Geospatial engine from sensor_config.json
sensor_config_path = Path("sensor_config.json")
base_tow_config = load_tow_path_config(sensor_config_path, sensor_id="default")
tow_engine = TowPathEngine(base_tow_config)

print("TARANG ML API ready. Listening on port 5000.")


@app.route('/api/predict', methods=['POST'])
def predict():
    start_time = time.time()

    # TARANG frontend sends file under field "scan" (tarangConfig.scanField)
    # Accept both "scan" and "image" for flexibility
    file = request.files.get('scan') or request.files.get('image')
    if file is None:
        return jsonify({"error": "No image provided. Expected multipart field 'scan'."}), 400

    file_bytes = np.frombuffer(file.read(), np.uint8)
    raw_image = cv2.imdecode(file_bytes, cv2.IMREAD_UNCHANGED)

    if raw_image is None:
        return jsonify({"error": "Invalid image — could not decode file."}), 400

    h, w = raw_image.shape[:2]

    # 1. Sonar preprocessing (CLAHE contrast + speckle filter)
    processed = preprocessor.preprocess(raw_image)

    # 2. YOLO inference
    results = model.predict(source=processed, conf=0.15, verbose=False)
    result = results[0]

    raw_detections = []
    for box in result.boxes:
        xyxy = box.xyxy[0].tolist()
        class_id = int(box.cls[0].item())
        class_name = (
            model.names.get(class_id, str(class_id))
            if hasattr(model.names, "get")
            else model.names[class_id]
        )
        confidence = float(box.conf[0].item())
        raw_detections.append(
            Detection(
                class_name=class_name,
                confidence_yolo=confidence,
                bbox=BoundingBox(*xyxy),
                source_image=secure_filename(file.filename or "upload.png"),
            )
        )

    # 3. Acoustic noise filtering (removes rock/shadow false positives)
    filtered = refiner.refine(processed, raw_detections)
    final = refiner.filter(filtered, min_confidence_pct=15.0)

    # 4. Geotagging (pixel coords → WGS84 lat/lon + physical dimensions)
    anomalies = tow_engine.geotag_all(final, image_height=h, image_width=w)

    # 5. Build response — must match tarangApi.ts InferenceDetection interface exactly:
    #    { label, category, confidence (0-1), bbox, coordinates:{lat,lon}, dimensions_m:{length,width} }
    response_detections = []
    for anomaly in anomalies:
        pb = anomaly.pixel_bbox
        nx = pb['xmin'] / w
        ny = pb['ymin'] / h
        nw = (pb['xmax'] - pb['xmin']) / w
        nh = (pb['ymax'] - pb['ymin']) / h

        response_detections.append({
            "label": anomaly.class_name.capitalize(),
            "category": "Unknown object",          # TARANG UI categories
            "confidence": round(anomaly.confidence_final / 100.0, 4),
            "bbox": {
                "x": round(nx, 4),
                "y": round(ny, 4),
                "width": round(nw, 4),
                "height": round(nh, 4),
            },
            # tarangApi.ts InferenceDetection.coordinates expects {lat, lon}
            "coordinates": {
                "lat": round(anomaly.latitude, 6),
                "lon": round(anomaly.longitude, 6),
            },
            # tarangApi.ts InferenceDetection.dimensions_m expects {length, width}
            "dimensions_m": {
                "length": round(anomaly.length_m, 2),
                "width": round(anomaly.width_m, 2),
            },
        })

    processing_ms = int((time.time() - start_time) * 1000)

    return jsonify({
        "request_id": f"REQ-{uuid.uuid4().hex[:8].upper()}",
        "model_version": "YOLOv8m-Sonar-94.3",
        "processing_ms": processing_ms,
        "image_width": w,
        "image_height": h,
        "detections": response_detections,
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
