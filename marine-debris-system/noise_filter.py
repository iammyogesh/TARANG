"""
noise_filter.py
----------------
Acoustic shadow & false-positive noise filtering.

A raw YOLO confidence score says nothing about whether a detection is
physically consistent with how side-scan sonar forms images: a real solid
object produces a bright acoustic highlight (strong return toward the
sensor) immediately followed, along the range direction, by a dark acoustic
shadow (the object blocks the beam from reaching the seafloor behind it).
Natural rock clusters and sand ripples can produce bright returns too, but
rarely with as clean/consistent a highlight-then-shadow signature, and their
aspect ratios differ from man-made debris (pipes/nets are elongated, most
rock clusters are not).

This module scores that physical consistency and combines it with the
detector's own confidence:

    C_final = C_yolo * S_acoustic      (scaled to a 0-100 percentage)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import cv2
import numpy as np

from logging_config import setup_logger
from schemas import BoundingBox, Detection

logger = setup_logger("noise_filter")


@dataclass
class AcousticFilterConfig:
    # Direction along which acoustic shadows fall, relative to the bbox, in image
    # row-axis terms. Side-scan sonar conventionally lays range out along image
    # columns (across-track) with the shadow falling *away* from the sensor track
    # (typically "downward" in a nadir-centered tile, i.e. increasing row index).
    # Flip to -1 if your tiling convention puts the sensor track at the bottom.
    shadow_direction: int = 1  # +1 = shadow expected below the bbox, -1 = above
    shadow_search_ratio: float = 1.0  # shadow region height, as a multiple of bbox height
    min_highlight_shadow_ratio: float = 1.15  # highlight must be at least this much brighter than shadow
    ideal_highlight_shadow_ratio: float = 2.5  # ratio at/above which the acoustic score saturates at 1.0
    min_aspect_ratio: float = 0.15  # w/h or h/w below this looks like a thin scan-line artifact
    max_aspect_ratio: float = 8.0  # above this looks like a long geological ridge, not discrete debris
    min_area_px: float = 20.0  # smaller than this is almost certainly speckle noise
    max_area_fraction: float = 0.25  # bbox covering more than this fraction of the image is suspect
    acoustic_weight_highlight_shadow: float = 0.6
    acoustic_weight_geometry: float = 0.4
    min_confidence_final_pct: float = 15.0  # detections scoring below this are dropped


class AcousticShadowValidator:
    """Computes a physics-consistency score S_acoustic in [0, 1] for one detection."""

    def __init__(self, config: AcousticFilterConfig = None):
        self.config = config or AcousticFilterConfig()

    def _shadow_region(self, bbox: BoundingBox, image_shape: Tuple[int, int]) -> BoundingBox:
        h_img, w_img = image_shape
        shadow_h = bbox.height * self.config.shadow_search_ratio
        if self.config.shadow_direction >= 0:
            ymin = bbox.ymax
            ymax = bbox.ymax + shadow_h
        else:
            ymin = bbox.ymin - shadow_h
            ymax = bbox.ymin
        shadow_box = BoundingBox(xmin=bbox.xmin, ymin=ymin, xmax=bbox.xmax, ymax=ymax)
        return shadow_box.clip(w_img, h_img)

    @staticmethod
    def _mean_intensity(image: np.ndarray, box: BoundingBox) -> float:
        x0, y0, x1, y1 = int(box.xmin), int(box.ymin), int(box.xmax), int(box.ymax)
        if x1 <= x0 or y1 <= y0:
            return 0.0
        patch = image[y0:y1, x0:x1]
        if patch.size == 0:
            return 0.0
        return float(np.mean(patch))

    def highlight_shadow_ratio(self, image: np.ndarray, bbox: BoundingBox) -> float:
        """Ratio of mean highlight (inside bbox) to mean shadow (adjacent region) intensity."""
        h_img, w_img = image.shape[:2]
        highlight = self._mean_intensity(image, bbox.clip(w_img, h_img))
        shadow_box = self._shadow_region(bbox, (h_img, w_img))
        shadow = self._mean_intensity(image, shadow_box)
        return highlight / max(shadow, 1e-3)

    def highlight_shadow_score(self, ratio: float) -> float:
        """Map a raw ratio onto [0, 1] via the configured min/ideal thresholds."""
        cfg = self.config
        if ratio <= cfg.min_highlight_shadow_ratio:
            return 0.0
        if ratio >= cfg.ideal_highlight_shadow_ratio:
            return 1.0
        span = cfg.ideal_highlight_shadow_ratio - cfg.min_highlight_shadow_ratio
        return (ratio - cfg.min_highlight_shadow_ratio) / span

    def geometry_score(self, bbox: BoundingBox, image_shape: Tuple[int, int]) -> float:
        """Penalize bounding boxes whose shape/size is inconsistent with discrete debris."""
        cfg = self.config
        h_img, w_img = image_shape
        image_area = float(h_img * w_img)

        w, h = bbox.width, bbox.height
        if w <= 0 or h <= 0:
            return 0.0
        aspect = max(w, h) / max(min(w, h), 1e-6)

        score = 1.0

        if aspect < cfg.min_aspect_ratio or aspect > cfg.max_aspect_ratio:
            score *= 0.3  # heavily discount, but don't zero out -- large debris fields exist

        if bbox.area < cfg.min_area_px:
            score *= 0.1  # almost certainly speckle

        if image_area > 0 and (bbox.area / image_area) > cfg.max_area_fraction:
            score *= 0.4  # suspiciously large relative to the tile

        return float(np.clip(score, 0.0, 1.0))

    def acoustic_score(self, image: np.ndarray, bbox: BoundingBox) -> Tuple[float, dict]:
        """Combined S_acoustic in [0, 1], plus the raw metrics for reporting/debugging."""
        h_img, w_img = image.shape[:2]
        ratio = self.highlight_shadow_ratio(image, bbox)
        hs_score = self.highlight_shadow_score(ratio)
        geo_score = self.geometry_score(bbox, (h_img, w_img))

        cfg = self.config
        combined = (
            cfg.acoustic_weight_highlight_shadow * hs_score
            + cfg.acoustic_weight_geometry * geo_score
        )
        metrics = {
            "highlight_shadow_ratio": ratio,
            "highlight_shadow_score": hs_score,
            "geometry_score": geo_score,
        }
        return float(np.clip(combined, 0.0, 1.0)), metrics


class ConfidenceRefiner:
    """Applies AcousticShadowValidator across a full detection list and refines scores."""

    def __init__(self, validator: AcousticShadowValidator = None):
        self.validator = validator or AcousticShadowValidator()

    def refine(self, image: np.ndarray, detections: List[Detection]) -> List[Detection]:
        refined = []
        for det in detections:
            s_acoustic, metrics = self.validator.acoustic_score(image, det.bbox)
            c_final_pct = det.confidence_yolo * s_acoustic * 100.0
            det.confidence_acoustic = s_acoustic
            det.confidence_final = round(c_final_pct, 2)
            det.acoustic_metrics = metrics
            refined.append(det)
        return refined

    def filter(self, detections: List[Detection], min_confidence_pct: float = None) -> List[Detection]:
        threshold = min_confidence_pct
        if threshold is None:
            threshold = self.validator.config.min_confidence_final_pct
        kept = [d for d in detections if (d.confidence_final or 0.0) >= threshold]
        dropped = len(detections) - len(kept)
        if dropped:
            logger.info("Noise filter dropped %d/%d detections below %.1f%% confidence", dropped, len(detections), threshold)
        return kept


def filter_detections(
    image: np.ndarray,
    detections: List[Detection],
    config: AcousticFilterConfig = None,
) -> List[Detection]:
    """Convenience entry point: refine confidences, then drop low-confidence detections."""
    refiner = ConfidenceRefiner(AcousticShadowValidator(config))
    refined = refiner.refine(image, detections)
    return refiner.filter(refined)
