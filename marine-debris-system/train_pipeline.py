"""
train_pipeline.py
------------------
Fine-tunes a YOLOv8 model (via ultralytics) on the prepared sonar dataset.

Augmentation policy is deliberately different from ultralytics' optical-image
defaults: side-scan sonar is single-channel/grayscale (so hue jitter is
meaningless), can be mirrored across-track without changing the physics
(fliplr is fine), but should generally NOT be flipped along the direction of
travel or aggressively rotated, since debris orientation relative to the tow
direction is sometimes informative and large rotations don't reflect how
these tiles are actually produced.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional

import yaml

from logging_config import setup_logger

logger = setup_logger("train_pipeline")

# Sonar-tuned augmentation overrides for ultralytics' `model.train(**overrides)`.
SONAR_AUGMENTATION_CONFIG: Dict[str, float] = {
    "hsv_h": 0.0,     # no hue jitter -- sonar imagery is grayscale
    "hsv_s": 0.0,     # no saturation jitter, same reason
    "hsv_v": 0.4,     # brightness/intensity jitter -- simulates gain/TVG variation
    "degrees": 5.0,   # small rotation only; large rotations are physically implausible
    "translate": 0.1,
    "scale": 0.3,     # simulates varying altitude / range
    "shear": 2.0,
    "perspective": 0.0,
    "flipud": 0.0,    # do not flip along the direction of travel
    "fliplr": 0.5,    # across-track mirroring is physically valid
    "mosaic": 1.0,
    "mixup": 0.1,
    "copy_paste": 0.1,
}


@dataclass
class TrainConfig:
    data_yaml: str
    model_arch: str = "yolov8n.pt"
    epochs: int = 100
    imgsz: int = 640
    batch: int = 16
    device: str = "cpu"
    project: str = "runs/train"
    name: str = "sonar_debris"
    patience: int = 20
    augmentation: Dict[str, float] = field(default_factory=lambda: dict(SONAR_AUGMENTATION_CONFIG))

    @classmethod
    def from_yaml(cls, path: str) -> "TrainConfig":
        raw = yaml.safe_load(Path(path).read_text()) or {}
        aug = dict(SONAR_AUGMENTATION_CONFIG)
        aug.update(raw.pop("augmentation", {}) or {})
        return cls(augmentation=aug, **raw)


class YOLOTrainer:
    """Thin, testable wrapper around ultralytics.YOLO for training + evaluation."""

    def __init__(self, config: TrainConfig):
        self.config = config
        self._model = None

    def _load_model(self):
        # Imported lazily so the rest of the pipeline can be imported/tested
        # in environments without ultralytics/torch installed (e.g. CI for
        # the data_pipeline / noise_filter / geospatial modules alone).
        from ultralytics import YOLO

        if self._model is None:
            logger.info("Loading base model architecture: %s", self.config.model_arch)
            self._model = YOLO(self.config.model_arch)
        return self._model

    def train(self):
        model = self._load_model()
        cfg = self.config
        logger.info(
            "Starting training: data=%s epochs=%d imgsz=%d batch=%d device=%s",
            cfg.data_yaml, cfg.epochs, cfg.imgsz, cfg.batch, cfg.device,
        )
        results = model.train(
            data=cfg.data_yaml,
            epochs=cfg.epochs,
            imgsz=cfg.imgsz,
            batch=cfg.batch,
            device=cfg.device,
            project=cfg.project,
            name=cfg.name,
            patience=cfg.patience,
            **cfg.augmentation,
        )
        logger.info("Training complete. Artifacts under %s/%s", cfg.project, cfg.name)
        return results

    def evaluate(self, weights_path: Optional[str] = None) -> Dict:
        from ultralytics import YOLO

        weights = weights_path or f"{self.config.project}/{self.config.name}/weights/best.pt"
        logger.info("Evaluating weights: %s", weights)
        model = YOLO(weights)
        metrics = model.val(data=self.config.data_yaml)

        # ultralytics' `DetMetrics` exposes these as attributes on `.box`.
        summary = {
            "map50": float(metrics.box.map50),
            "map50_95": float(metrics.box.map),
            "precision": float(metrics.box.mp),
            "recall": float(metrics.box.mr),
        }

        out_dir = Path(self.config.project) / self.config.name
        out_dir.mkdir(parents=True, exist_ok=True)
        metrics_path = out_dir / "evaluation_metrics.json"
        metrics_path.write_text(json.dumps(summary, indent=2))
        logger.info("Evaluation summary: %s (saved to %s)", summary, metrics_path)
        return summary


def train_from_config(config_path: str) -> Dict:
    """CLI entry point: load a YAML training config, train, then evaluate."""
    config = TrainConfig.from_yaml(config_path)
    trainer = YOLOTrainer(config)
    trainer.train()
    return trainer.evaluate()
