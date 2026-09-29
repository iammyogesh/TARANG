"""
geospatial.py
-------------
Geospatial geotagging engine.

Real side-scan sonar systems geotag pixels using ping-by-ping navigation data
(USBL/GPS fixes fused with heading and layback). Absent real ping headers, we
simulate an AUV/ship tow-path from a compact physical configuration (start
position, heading, speed, sensor resolution) and use it to map every
detection's pixel bounding box to WGS84 latitude/longitude, plus estimate its
physical footprint in meters.

Convention used throughout this module:
    - image row axis  (top -> bottom) = along-track direction (direction of travel)
    - image column axis (left -> right) = cross-track / range direction
    - `along_track_resolution_m` = meters of travel represented by one image row
    - `cross_track_resolution_m` = meters of range represented by one image column
    - cross-track distance is measured from the image's horizontal center
      (assumed to be the sensor's nadir/track line), negative = port (left),
      positive = starboard (right)

This is a deliberate simplification appropriate for a hackathon prototype; it
is documented here so it can be swapped for real ping-header parsing later
without touching any other module (everything downstream only depends on
`TowPathEngine.pixel_to_latlon`).
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Dict, List, Tuple

from logging_config import setup_logger
from schemas import Detection, GeoAnomaly, TowPathConfig

logger = setup_logger("geospatial")

EARTH_RADIUS_M = 6_371_000.0


def _destination_point(lat_deg: float, lon_deg: float, bearing_deg: float, distance_m: float) -> Tuple[float, float]:
    """
    Great-circle destination point given a start point, initial bearing, and
    distance, using the standard spherical-earth formula. Accurate to well
    within acoustic-imaging precision requirements over sonar-survey-scale
    distances (meters to a few kilometers).
    """
    lat1 = math.radians(lat_deg)
    lon1 = math.radians(lon_deg)
    brng = math.radians(bearing_deg)
    delta = distance_m / EARTH_RADIUS_M

    lat2 = math.asin(
        math.sin(lat1) * math.cos(delta) + math.cos(lat1) * math.sin(delta) * math.cos(brng)
    )
    lon2 = lon1 + math.atan2(
        math.sin(brng) * math.sin(delta) * math.cos(lat1),
        math.cos(delta) - math.sin(lat1) * math.sin(lat2),
    )

    return math.degrees(lat2), math.degrees(lon2)


class TowPathEngine:
    """Converts pixel coordinates within one sonar tile to WGS84 lat/lon."""

    def __init__(self, config: TowPathConfig):
        self.config = config

    def pixel_to_latlon(self, row: float, col: float, image_height: int, image_width: int) -> Tuple[float, float]:
        cfg = self.config
        along_track_distance = row * cfg.along_track_resolution_m
        cross_track_distance = (col - image_width / 2.0) * cfg.cross_track_resolution_m

        # Step 1: move along the heading by the along-track distance.
        lat_a, lon_a = _destination_point(cfg.start_lat, cfg.start_lon, cfg.heading_deg, along_track_distance)

        # Step 2: offset perpendicular to the heading by the cross-track distance.
        #         Positive cross-track = starboard = heading + 90 degrees.
        perpendicular_bearing = (cfg.heading_deg + 90.0) % 360.0
        lat_b, lon_b = _destination_point(lat_a, lon_a, perpendicular_bearing, cross_track_distance)

        return lat_b, lon_b

    def bbox_footprint(self, bbox, image_height: int, image_width: int) -> List[List[float]]:
        """Geotag the four corners of a pixel bbox, for GeoJSON polygon output."""
        corners_px = [
            (bbox.ymin, bbox.xmin),
            (bbox.ymin, bbox.xmax),
            (bbox.ymax, bbox.xmax),
            (bbox.ymax, bbox.xmin),
            (bbox.ymin, bbox.xmin),  # close the ring
        ]
        return [list(self.pixel_to_latlon(r, c, image_height, image_width)) for r, c in corners_px]

    def estimate_physical_size(self, bbox_width_px: float, bbox_height_px: float) -> Tuple[float, float]:
        """Return (width_m, length_m) using the configured per-axis resolutions."""
        cfg = self.config
        width_m = bbox_width_px * cfg.cross_track_resolution_m
        length_m = bbox_height_px * cfg.along_track_resolution_m
        return width_m, length_m

    def geotag_detection(self, detection: Detection, image_height: int, image_width: int) -> GeoAnomaly:
        bbox = detection.bbox
        lat, lon = self.pixel_to_latlon(bbox.center_y, bbox.center_x, image_height, image_width)
        width_m, length_m = self.estimate_physical_size(bbox.width, bbox.height)
        footprint = self.bbox_footprint(bbox, image_height, image_width)

        return GeoAnomaly(
            class_name=detection.class_name,
            latitude=lat,
            longitude=lon,
            width_m=round(width_m, 3),
            length_m=round(length_m, 3),
            confidence_yolo=round(detection.confidence_yolo * 100.0, 2),
            confidence_final=detection.confidence_final if detection.confidence_final is not None
            else round(detection.confidence_yolo * 100.0, 2),
            source_image=detection.source_image,
            pixel_bbox=bbox.as_dict(),
            sensor_id=self.config.sensor_id,
            footprint=footprint,
        )

    def geotag_all(self, detections: List[Detection], image_height: int, image_width: int) -> List[GeoAnomaly]:
        return [self.geotag_detection(d, image_height, image_width) for d in detections]

    def shifted(self, along_track_distance_m: float) -> "TowPathEngine":
        """
        Return a new engine whose origin has been advanced along the heading
        by the given distance. Used to chain multiple sequential image tiles
        from one continuous sonar log into a single tow-path, so tile N+1's
        row 0 picks up where tile N's last row left off instead of resetting
        to the tow's start every time.
        """
        new_lat, new_lon = _destination_point(
            self.config.start_lat, self.config.start_lon, self.config.heading_deg, along_track_distance_m
        )
        new_config = TowPathConfig(
            start_lat=new_lat,
            start_lon=new_lon,
            heading_deg=self.config.heading_deg,
            along_track_resolution_m=self.config.along_track_resolution_m,
            cross_track_resolution_m=self.config.cross_track_resolution_m,
            slant_range_m=self.config.slant_range_m,
            sensor_id=self.config.sensor_id,
        )
        return TowPathEngine(new_config)


class GeoReportBuilder:
    """Serializes GeoAnomaly lists to GeoJSON (for QGIS/GIS tools), JSON, and CSV."""

    @staticmethod
    def build_geojson(anomalies: List[GeoAnomaly]) -> Dict:
        features = []
        for a in anomalies:
            properties = {
                k: v for k, v in a.as_dict().items()
                if k not in {"latitude", "longitude", "footprint"}
            }
            geometry = (
                {"type": "Polygon", "coordinates": [[[lon, lat] for lat, lon in a.footprint]]}
                if a.footprint
                else {"type": "Point", "coordinates": [a.longitude, a.latitude]}
            )
            features.append({
                "type": "Feature",
                "geometry": geometry,
                "properties": properties,
            })
        return {"type": "FeatureCollection", "features": features}

    @staticmethod
    def build_json(anomalies: List[GeoAnomaly]) -> List[Dict]:
        return [a.as_dict() for a in anomalies]

    @staticmethod
    def write_csv(anomalies: List[GeoAnomaly], path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not anomalies:
            path.write_text("")
            logger.warning("No anomalies to write; created empty CSV at %s", path)
            return

        fieldnames = [
            "source_image", "class_name", "latitude", "longitude",
            "width_m", "length_m", "confidence_yolo", "confidence_final",
            "sensor_id", "timestamp_utc",
        ]
        with open(path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for a in anomalies:
                row = {k: getattr(a, k) for k in fieldnames}
                writer.writerow(row)

    def save_all(self, anomalies: List[GeoAnomaly], output_dir: Path, basename: str) -> Dict[str, Path]:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        geojson_path = output_dir / f"{basename}.geojson"
        json_path = output_dir / f"{basename}.json"
        csv_path = output_dir / f"{basename}.csv"

        geojson_path.write_text(json.dumps(self.build_geojson(anomalies), indent=2))
        json_path.write_text(json.dumps(self.build_json(anomalies), indent=2))
        self.write_csv(anomalies, csv_path)

        logger.info("Wrote %d anomalies to %s / %s / %s", len(anomalies), geojson_path.name, json_path.name, csv_path.name)
        return {"geojson": geojson_path, "json": json_path, "csv": csv_path}


def load_tow_path_config(sensor_config_path: Path, sensor_id: str = "default") -> TowPathConfig:
    """Load one named sensor/tow-path configuration from a sensor_config.json file."""
    data = json.loads(Path(sensor_config_path).read_text())
    sensors = data.get("sensors", data if isinstance(data, list) else [data])
    for entry in sensors:
        if entry.get("sensor_id", "default") == sensor_id:
            return TowPathConfig(
                start_lat=entry["start_lat"],
                start_lon=entry["start_lon"],
                heading_deg=entry["heading_deg"],
                along_track_resolution_m=entry["along_track_resolution_m"],
                cross_track_resolution_m=entry["cross_track_resolution_m"],
                slant_range_m=entry.get("slant_range_m", 0.0),
                sensor_id=entry.get("sensor_id", "default"),
            )
    raise KeyError(f"sensor_id '{sensor_id}' not found in {sensor_config_path}")
