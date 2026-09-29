"""
schemas.py
----------
Shared data models used across the sonar debris detection pipeline
(data_pipeline, train_pipeline, noise_filter, geospatial, cli).

Keeping these in one place avoids the modules silently drifting apart
on field names as the pipeline grows.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


class AnomalyClass(str, Enum):
    """Canonical anomaly classes for PS 26057."""

    SHIPWRECK = "shipwreck"
    GHOST_NET = "ghost_net"
    PIPE = "pipe"
    CYLINDER = "cylinder"
    UNKNOWN = "unknown"

    @classmethod
    def from_label(cls, label: str) -> "AnomalyClass":
        """Best-effort mapping from an arbitrary dataset label to our enum."""
        normalized = label.strip().lower().replace(" ", "_").replace("-", "_")
        try:
            return cls(normalized)
        except ValueError:
            return cls.UNKNOWN


@dataclass
class BoundingBox:
    """Pixel-space bounding box with helpers to/from YOLO's normalized format."""

    xmin: float
    ymin: float
    xmax: float
    ymax: float

    @property
    def width(self) -> float:
        return max(0.0, self.xmax - self.xmin)

    @property
    def height(self) -> float:
        return max(0.0, self.ymax - self.ymin)

    @property
    def center_x(self) -> float:
        return self.xmin + self.width / 2.0

    @property
    def center_y(self) -> float:
        return self.ymin + self.height / 2.0

    @property
    def area(self) -> float:
        return self.width * self.height

    def to_yolo(self, image_width: int, image_height: int) -> tuple:
        """Return (cx, cy, w, h) normalized to [0, 1]."""
        return (
            self.center_x / image_width,
            self.center_y / image_height,
            self.width / image_width,
            self.height / image_height,
        )

    @classmethod
    def from_yolo(
        cls, cx: float, cy: float, w: float, h: float, image_width: int, image_height: int
    ) -> "BoundingBox":
        px_w = w * image_width
        px_h = h * image_height
        px_cx = cx * image_width
        px_cy = cy * image_height
        return cls(
            xmin=px_cx - px_w / 2.0,
            ymin=px_cy - px_h / 2.0,
            xmax=px_cx + px_w / 2.0,
            ymax=px_cy + px_h / 2.0,
        )

    def clip(self, image_width: int, image_height: int) -> "BoundingBox":
        return BoundingBox(
            xmin=max(0.0, min(self.xmin, image_width - 1)),
            ymin=max(0.0, min(self.ymin, image_height - 1)),
            xmax=max(0.0, min(self.xmax, image_width - 1)),
            ymax=max(0.0, min(self.ymax, image_height - 1)),
        )

    def as_dict(self) -> Dict[str, float]:
        return {"xmin": self.xmin, "ymin": self.ymin, "xmax": self.xmax, "ymax": self.ymax}


@dataclass
class Detection:
    """A single raw detector output, prior to acoustic filtering / geotagging."""

    class_name: str
    confidence_yolo: float
    bbox: BoundingBox
    source_image: str
    confidence_acoustic: Optional[float] = None
    confidence_final: Optional[float] = None
    acoustic_metrics: Dict[str, float] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["bbox"] = self.bbox.as_dict()
        return d


@dataclass
class TowPathConfig:
    """Physical configuration of one AUV/ship sonar tow used for geotagging."""

    start_lat: float
    start_lon: float
    heading_deg: float  # compass bearing of travel, 0 = north, 90 = east
    along_track_resolution_m: float  # meters of seafloor per image row (direction of travel)
    cross_track_resolution_m: float  # meters of seafloor per image column (across-track / range)
    slant_range_m: float = 0.0  # max range per side, for reference/metadata only
    sensor_id: str = "default"

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class GeoAnomaly:
    """A validated, geotagged anomaly ready for reporting."""

    class_name: str
    latitude: float
    longitude: float
    width_m: float
    length_m: float
    confidence_yolo: float
    confidence_final: float
    source_image: str
    pixel_bbox: Dict[str, float]
    sensor_id: str = "default"
    footprint: Optional[List[List[float]]] = None  # [[lat, lon], ...] bbox corners, for GeoJSON polygons
    timestamp_utc: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)
