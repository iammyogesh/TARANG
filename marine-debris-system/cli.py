#!/usr/bin/env python3
"""
cli.py
------
Unified command-line entry point for the PS 26057 sonar debris pipeline.

Usage:
    python cli.py prepare --data-dir ./data --output-dir ./prepared_data
    python cli.py train --config config.yaml
    python cli.py process --input ./sonar_logs/ --output ./reports/ --sensors sensor_config.json \\
                           --weights runs/train/sonar_debris/weights/best.pt

Run `python cli.py <command> --help` for per-command options.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List

import cv2

from logging_config import setup_logger

logger = setup_logger("cli")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}


# --------------------------------------------------------------------------- #
# prepare
# --------------------------------------------------------------------------- #
def cmd_prepare(args: argparse.Namespace) -> int:
    from data_pipeline import SonarDatasetPreparer

    preparer = SonarDatasetPreparer(
        data_dir=args.data_dir,
        output_dir=args.output_dir,
        class_names=args.classes.split(",") if args.classes else None,
    )
    try:
        summary = preparer.run()
    except FileNotFoundError as exc:
        logger.error("Dataset preparation failed: %s", exc)
        return 1

    logger.info("Dataset preparation complete: %s", json.dumps(summary["splits"]))
    if summary["report"].get("_warnings"):
        logger.warning("Class balance warnings were recorded in split_report.json")
    return 0


# --------------------------------------------------------------------------- #
# train
# --------------------------------------------------------------------------- #
def cmd_train(args: argparse.Namespace) -> int:
    from train_pipeline import train_from_config

    try:
        metrics = train_from_config(args.config)
    except ImportError as exc:
        logger.error(
            "Training requires the 'ultralytics' package (pip install -r requirements.txt): %s", exc
        )
        return 1
    except FileNotFoundError as exc:
        logger.error("Training config or data.yaml not found: %s", exc)
        return 1

    logger.info("Training + evaluation complete: %s", json.dumps(metrics))
    return 0


# --------------------------------------------------------------------------- #
# process
# --------------------------------------------------------------------------- #
def _discover_images(input_dir: Path) -> List[Path]:
    images = sorted(p for p in input_dir.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS)
    return images


def cmd_process(args: argparse.Namespace) -> int:
    from data_pipeline import SonarPreprocessor
    from geospatial import GeoReportBuilder, TowPathEngine, load_tow_path_config
    from noise_filter import AcousticFilterConfig, ConfidenceRefiner
    from schemas import BoundingBox, Detection

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        logger.error(
            "Processing requires the 'ultralytics' package (pip install -r requirements.txt): %s", exc
        )
        return 1

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    if not input_dir.exists():
        logger.error("Input directory does not exist: %s", input_dir)
        return 1

    images = _discover_images(input_dir)
    if not images:
        logger.error("No images with extensions %s found in %s", IMAGE_EXTENSIONS, input_dir)
        return 1
    logger.info("Found %d sonar images to process in %s", len(images), input_dir)

    base_tow_config = load_tow_path_config(Path(args.sensors), sensor_id=args.sensor_id)
    base_engine = TowPathEngine(base_tow_config)

    model = YOLO(args.weights)
    preprocessor = SonarPreprocessor()
    filter_config = AcousticFilterConfig(min_confidence_final_pct=args.min_confidence)
    refiner = ConfidenceRefiner()
    report_builder = GeoReportBuilder()

    all_anomalies = []
    cumulative_along_track_m = 0.0

    for idx, image_path in enumerate(images):
        raw_image = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)
        if raw_image is None:
            logger.warning("Could not read image, skipping: %s", image_path)
            continue

        processed = preprocessor.preprocess(raw_image)
        h, w = processed.shape[:2]

        results = model.predict(source=processed, conf=args.detector_conf, verbose=False)
        result = results[0]

        detections: List[Detection] = []
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist()
            class_id = int(box.cls[0].item())
            class_name = model.names.get(class_id, str(class_id)) if hasattr(model.names, "get") else model.names[class_id]
            confidence = float(box.conf[0].item())
            detections.append(
                Detection(
                    class_name=class_name,
                    confidence_yolo=confidence,
                    bbox=BoundingBox(*xyxy),
                    source_image=image_path.name,
                )
            )

        filtered = refiner.refine(processed, detections)
        filtered = refiner.filter(filtered, min_confidence_pct=args.min_confidence)
        logger.info("%s: %d raw detections -> %d after acoustic filtering", image_path.name, len(detections), len(filtered))

        # Chain this tile onto the running tow-path so sequential tiles form one continuous log.
        engine = base_engine.shifted(cumulative_along_track_m)
        anomalies = engine.geotag_all(filtered, image_height=h, image_width=w)
        all_anomalies.extend(anomalies)

        cumulative_along_track_m += h * base_tow_config.along_track_resolution_m

        # Per-image report, for traceability back to a specific sonar tile.
        report_builder.save_all(anomalies, output_dir / "per_image", basename=image_path.stem)

    # Combined report across the whole log/directory.
    report_builder.save_all(all_anomalies, output_dir, basename="anomaly_report")
    logger.info(
        "Processing complete: %d total validated anomalies across %d images. Reports in %s",
        len(all_anomalies), len(images), output_dir,
    )
    return 0


# --------------------------------------------------------------------------- #
# argument parser
# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cli.py",
        description="PS 26057 -- AI-powered underwater marine debris & anomaly detection pipeline.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_prepare = subparsers.add_parser("prepare", help="Prepare a raw sonar dataset for training.")
    p_prepare.add_argument("--data-dir", required=True, help="Directory with images/ and annotations (VOC xml or csv).")
    p_prepare.add_argument("--output-dir", default="./prepared_data", help="Where to write the YOLO-ready dataset.")
    p_prepare.add_argument("--classes", default=None, help="Comma-separated class list, overriding the default set.")
    p_prepare.set_defaults(func=cmd_prepare)

    p_train = subparsers.add_parser("train", help="Fine-tune YOLOv8 on a prepared dataset.")
    p_train.add_argument("--config", required=True, help="Path to a training config YAML (see config.yaml).")
    p_train.set_defaults(func=cmd_train)

    p_process = subparsers.add_parser("process", help="Run the full inference pipeline on a directory of sonar images.")
    p_process.add_argument("--input", required=True, help="Directory of raw sonar images/log tiles.")
    p_process.add_argument("--output", required=True, help="Directory to write anomaly reports into.")
    p_process.add_argument("--sensors", required=True, help="Path to sensor_config.json describing the tow-path.")
    p_process.add_argument("--sensor-id", default="default", help="Which sensor entry in sensor_config.json to use.")
    p_process.add_argument("--weights", required=True, help="Path to trained YOLO weights (best.pt).")
    p_process.add_argument("--detector-conf", type=float, default=0.25, help="Raw YOLO confidence threshold before acoustic filtering.")
    p_process.add_argument("--min-confidence", type=float, default=15.0, help="Final (acoustic-adjusted) confidence percentage threshold to keep a detection.")
    p_process.set_defaults(func=cmd_process)

    return parser


def main(argv: List[str] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
