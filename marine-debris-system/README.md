# PS 26057 — Sonar Marine Debris & Anomaly Detection Pipeline

Headless, modular backend pipeline for detecting man-made debris in
side-scan sonar (SSS) imagery. No UI code — CLI-driven, designed to be
dropped behind a dashboard, a batch job, or an edge-device inference loop.

## Architecture

```
Raw sonar imagery
      |
      v
Preprocessing (data_pipeline.SonarPreprocessor)
  median filter -> Lee speckle filter -> CLAHE
      |
      v
Detection model (train_pipeline / ultralytics YOLOv8)
      |
      v
Confidence + noise filter (noise_filter.py)
  acoustic highlight/shadow ratio + geometry checks
  C_final = C_yolo * S_acoustic
      |
      v
Geospatial geotagging (geospatial.py)
  tow-path physics engine -> WGS84 lat/lon, physical size
      |
      v
Reports: GeoJSON (QGIS/GIS) + JSON + CSV
```

## Modules

| File | Responsibility |
|---|---|
| `schemas.py` | Shared dataclasses (`BoundingBox`, `Detection`, `TowPathConfig`, `GeoAnomaly`) used by every other module |
| `logging_config.py` | Consistent console + file logging |
| `data_pipeline.py` | `SonarPreprocessor`, `AnnotationConverter` (VOC XML / CSV → YOLO), `DatasetSplitter` (stratified), `SonarDatasetPreparer` (orchestrator) |
| `train_pipeline.py` | `YOLOTrainer` wrapping `ultralytics`, sonar-tuned augmentation policy, mAP50/mAP50-95/precision/recall export |
| `noise_filter.py` | `AcousticShadowValidator` (highlight/shadow + geometry scoring), `ConfidenceRefiner` (`C_final = C_yolo * S_acoustic`) |
| `geospatial.py` | `TowPathEngine` (pixel → WGS84), `GeoReportBuilder` (GeoJSON/JSON/CSV) |
| `cli.py` | `prepare` / `train` / `process` subcommands tying it all together |

## Setup

```bash
pip install -r requirements.txt
```

`ultralytics`/`torch` are only imported inside `train_pipeline.py` and the
`process`/`train` CLI commands — `prepare` and the standalone
`noise_filter`/`geospatial` logic run without them, which is useful for
testing those modules in a lighter environment.

## Usage

### 1. Prepare a dataset

Expects `data_dir/images/*.png|jpg` plus either `data_dir/annotations/*.xml`
(Pascal VOC) or `data_dir/annotations.csv` with columns
`image,class_name,xmin,ymin,xmax,ymax`.

```bash
python cli.py prepare --data-dir ./data --output-dir ./prepared_data
```

Produces an ultralytics-ready `images/{train,val,test}` + `labels/{train,val,test}`
layout, `data.yaml`, `class_map.json`, and `split_report.json` (flags any
class missing from a split — small/imbalanced datasets will warn here, not
fail silently).

### 2. Train

Edit `config.yaml` (model architecture, epochs, augmentation overrides), then:

```bash
python cli.py train --config config.yaml
```

Writes weights + `evaluation_metrics.json` (mAP50, mAP50-95, precision,
recall) under `runs/train/<name>/`.

### 3. Process a sonar log

```bash
python cli.py process \
  --input ./sonar_logs/ \
  --output ./reports/ \
  --sensors sensor_config.json \
  --sensor-id default \
  --weights runs/train/sonar_debris/weights/best.pt
```

Edit `sensor_config.json` with your tow's actual start position, heading,
and per-pixel resolution before running against real data — the shipped
values are placeholder coordinates. Images in `--input` are processed in
filename order and chained into one continuous tow-path (see
`TowPathEngine.shifted`), so sequential tiles from the same log geotag
correctly relative to each other.

Output: `reports/anomaly_report.{geojson,json,csv}` (combined) plus
per-image reports under `reports/per_image/`.

## Design notes / where the shortcuts are

This was built to a hard time budget, so a few things are deliberately
simplified and documented as swap-out points rather than hidden:

- **Geotagging is simulated from a configured tow-path**, not parsed from
  real ping headers (EdgeTech/Klein binary formats are a project of their
  own). Everything downstream only touches `TowPathEngine.pixel_to_latlon`,
  so swapping in real navigation data later doesn't require touching
  `noise_filter.py`, `cli.py`, or the report format.
- **The acoustic shadow heuristic assumes shadows fall in a fixed direction**
  relative to each tile (`AcousticFilterConfig.shadow_direction`). If your
  tiling convention puts the sensor track on the opposite edge, flip that
  one config value rather than the code.
- **Class list defaults to** `shipwreck`, `ghost_net`, `pipe`, `cylinder`
  (from the PS description). Unfamiliar labels encountered during
  `prepare` are auto-registered with a warning rather than crashing the
  conversion — check `class_map.json` after a run on a new dataset.
