"""
data_pipeline.py
-----------------
Advanced data preparation and sonar-specific signal processing for PS 26057.

Responsibilities:
  1. SonarPreprocessor   - speckle filtering + CLAHE contrast optimization
  2. AnnotationConverter - Pascal-VOC XML / CSV annotations -> normalized YOLO labels
  3. DatasetSplitter      - stratified train/val/test split with class-balance verification
  4. SonarDatasetPreparer - orchestrates the above into an ultralytics-ready dataset dir

Expected raw input layout (flexible, but this is the default the CLI assumes):

    data_dir/
        images/            *.png / *.jpg raw sonar tiles
        annotations/        *.xml (Pascal VOC)   -- OR --
        annotations.csv     image,class_name,xmin,ymin,xmax,ymax

Output layout (ultralytics-compatible):

    output_dir/
        images/{train,val,test}/*.png
        labels/{train,val,test}/*.txt
        data.yaml
        split_report.json
"""

from __future__ import annotations

import csv
import json
import random
import shutil
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
import yaml

from logging_config import setup_logger
from schemas import AnomalyClass, BoundingBox

logger = setup_logger("data_pipeline")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
DEFAULT_CLASSES = [c.value for c in AnomalyClass if c != AnomalyClass.UNKNOWN]


# --------------------------------------------------------------------------- #
# Signal processing
# --------------------------------------------------------------------------- #
class SonarPreprocessor:
    """
    Sonar-specific signal preprocessing.

    Side-scan sonar imagery suffers from multiplicative speckle noise (unlike
    the additive Gaussian noise typical of optical cameras) and very low
    contrast between man-made anomalies and seafloor geology. This class
    applies, in order:

        1. Median filtering (fast, removes salt-and-pepper style speckle)
        2. Lee speckle filtering (adaptive, preserves edges better than median
           alone -- important so we don't blur away debris outlines)
        3. CLAHE contrast optimization (amplifies local contrast without
           blowing out already-bright specular returns)
    """

    def __init__(
        self,
        median_kernel: int = 5,
        speckle_window: int = 7,
        speckle_damping: float = 1.0,
        clahe_clip_limit: float = 2.0,
        clahe_tile_grid: Tuple[int, int] = (8, 8),
    ):
        if median_kernel % 2 == 0:
            raise ValueError("median_kernel must be odd")
        if speckle_window % 2 == 0:
            raise ValueError("speckle_window must be odd")

        self.median_kernel = median_kernel
        self.speckle_window = speckle_window
        self.speckle_damping = speckle_damping
        self.clahe = cv2.createCLAHE(clipLimit=clahe_clip_limit, tileGridSize=clahe_tile_grid)

    @staticmethod
    def _to_grayscale(image: np.ndarray) -> np.ndarray:
        if image.ndim == 3:
            return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        return image

    def apply_median_filter(self, image: np.ndarray) -> np.ndarray:
        """Fast first-pass despeckle."""
        return cv2.medianBlur(image, self.median_kernel)

    def apply_lee_filter(self, image: np.ndarray) -> np.ndarray:
        """
        Adaptive Lee speckle filter.

        For multiplicative noise, the minimum mean-square-error estimate at
        each pixel is:

            out = mean + W * (pixel - mean)
            W   = local_var / (local_var + noise_var)

        where `local_var` is the variance in a local window and `noise_var`
        is the overall image variance (scaled by a damping factor to control
        aggressiveness). Areas of high local variance (edges, debris
        boundaries) get W close to 1 and are left mostly unchanged; flat,
        noisy regions (open seafloor) get W close to 0 and are smoothed
        toward the local mean.
        """
        img_f = image.astype(np.float64)
        k = (self.speckle_window, self.speckle_window)

        mean = cv2.boxFilter(img_f, ddepth=-1, ksize=k, borderType=cv2.BORDER_REFLECT)
        mean_sq = cv2.boxFilter(img_f**2, ddepth=-1, ksize=k, borderType=cv2.BORDER_REFLECT)
        local_var = np.clip(mean_sq - mean**2, a_min=0.0, a_max=None)

        overall_var = float(np.var(img_f))
        if overall_var <= 1e-6:
            return image  # flat image, nothing to do

        noise_var = overall_var / max(self.speckle_damping, 1e-6)
        weight = local_var / (local_var + noise_var + 1e-8)

        output = mean + weight * (img_f - mean)
        return np.clip(output, 0, 255).astype(np.uint8)

    def apply_clahe(self, image: np.ndarray) -> np.ndarray:
        """Contrast Limited Adaptive Histogram Equalization."""
        return self.clahe.apply(image)

    def preprocess(self, image: np.ndarray) -> np.ndarray:
        """Full pipeline: grayscale -> median -> Lee filter -> CLAHE."""
        gray = self._to_grayscale(image)
        despeckled = self.apply_median_filter(gray)
        despeckled = self.apply_lee_filter(despeckled)
        contrast_optimized = self.apply_clahe(despeckled)
        return contrast_optimized

    def preprocess_file(self, image_path: Path, output_path: Path) -> bool:
        """Read, preprocess, and write a single image file. Returns success."""
        image = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)
        if image is None:
            logger.warning("Could not read image, skipping: %s", image_path)
            return False
        processed = self.preprocess(image)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(output_path), processed)
        return True


# --------------------------------------------------------------------------- #
# Annotation conversion
# --------------------------------------------------------------------------- #
@dataclass
class RawAnnotation:
    image_name: str
    class_name: str
    bbox: BoundingBox


class AnnotationConverter:
    """
    Converts raw dataset annotations (Pascal VOC XML or flat CSV) into
    normalized YOLO-format label files: one `.txt` per image, one line per
    object as `class_id cx cy w h` (all normalized to [0, 1]).
    """

    def __init__(self, class_map: Optional[Dict[str, int]] = None):
        self.class_map = class_map or {name: idx for idx, name in enumerate(DEFAULT_CLASSES)}

    def _class_id(self, class_name: str) -> int:
        normalized = AnomalyClass.from_label(class_name).value
        if normalized not in self.class_map:
            # Unknown label encountered in the dataset: register it rather than crash,
            # but warn loudly since it likely needs a manual mapping decision.
            new_id = max(self.class_map.values(), default=-1) + 1
            logger.warning(
                "Unmapped class label '%s' (normalized '%s') -- assigning new id %d",
                class_name, normalized, new_id,
            )
            self.class_map[normalized] = new_id
            normalized_key = normalized
        else:
            normalized_key = normalized
        return self.class_map[normalized_key]

    # ---- VOC XML ---- #
    def parse_voc_xml(self, xml_path: Path) -> List[RawAnnotation]:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        filename_node = root.find("filename")
        image_name = filename_node.text if filename_node is not None else xml_path.stem

        annotations = []
        for obj in root.findall("object"):
            name_node = obj.find("name")
            bbox_node = obj.find("bndbox")
            if name_node is None or bbox_node is None:
                continue
            xmin = float(bbox_node.find("xmin").text)
            ymin = float(bbox_node.find("ymin").text)
            xmax = float(bbox_node.find("xmax").text)
            ymax = float(bbox_node.find("ymax").text)
            annotations.append(
                RawAnnotation(
                    image_name=image_name,
                    class_name=name_node.text,
                    bbox=BoundingBox(xmin, ymin, xmax, ymax),
                )
            )
        return annotations

    def convert_voc_directory(
        self, xml_dir: Path, images_dir: Path, labels_out_dir: Path
    ) -> Dict[str, List[RawAnnotation]]:
        """Convert every VOC XML in xml_dir. Returns {image_name: [RawAnnotation]}."""
        labels_out_dir.mkdir(parents=True, exist_ok=True)
        by_image: Dict[str, List[RawAnnotation]] = defaultdict(list)

        for xml_path in sorted(xml_dir.glob("*.xml")):
            for ann in self.parse_voc_xml(xml_path):
                by_image[ann.image_name].append(ann)

        for image_name, anns in by_image.items():
            self._write_yolo_label(image_name, anns, images_dir, labels_out_dir)

        return by_image

    # ---- CSV ---- #
    def parse_csv(self, csv_path: Path) -> Dict[str, List[RawAnnotation]]:
        """Expected columns: image,class_name,xmin,ymin,xmax,ymax"""
        by_image: Dict[str, List[RawAnnotation]] = defaultdict(list)
        with open(csv_path, newline="") as f:
            reader = csv.DictReader(f)
            required = {"image", "class_name", "xmin", "ymin", "xmax", "ymax"}
            missing = required - set(reader.fieldnames or [])
            if missing:
                raise ValueError(f"CSV annotations missing required columns: {missing}")
            for row in reader:
                bbox = BoundingBox(
                    xmin=float(row["xmin"]), ymin=float(row["ymin"]),
                    xmax=float(row["xmax"]), ymax=float(row["ymax"]),
                )
                by_image[row["image"]].append(
                    RawAnnotation(image_name=row["image"], class_name=row["class_name"], bbox=bbox)
                )
        return by_image

    def convert_csv(self, csv_path: Path, images_dir: Path, labels_out_dir: Path) -> Dict[str, List[RawAnnotation]]:
        labels_out_dir.mkdir(parents=True, exist_ok=True)
        by_image = self.parse_csv(csv_path)
        for image_name, anns in by_image.items():
            self._write_yolo_label(image_name, anns, images_dir, labels_out_dir)
        return by_image

    # ---- shared ---- #
    def _write_yolo_label(
        self, image_name: str, anns: List[RawAnnotation], images_dir: Path, labels_out_dir: Path
    ) -> None:
        image_path = images_dir / image_name
        if not image_path.exists():
            logger.warning("Annotated image not found on disk, skipping labels: %s", image_path)
            return

        image = cv2.imread(str(image_path))
        if image is None:
            logger.warning("Could not read image for dimensions, skipping: %s", image_path)
            return
        h, w = image.shape[:2]

        lines = []
        for ann in anns:
            class_id = self._class_id(ann.class_name)
            cx, cy, bw, bh = ann.bbox.clip(w, h).to_yolo(w, h)
            lines.append(f"{class_id} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")

        label_path = labels_out_dir / f"{Path(image_name).stem}.txt"
        label_path.write_text("\n".join(lines) + ("\n" if lines else ""))

    def save_class_map(self, path: Path) -> None:
        path.write_text(json.dumps(self.class_map, indent=2))


# --------------------------------------------------------------------------- #
# Stratified split
# --------------------------------------------------------------------------- #
class DatasetSplitter:
    """
    Stratified train/val/test split.

    Stratification key is the *dominant class* present in each image (the
    class with the most bounding boxes in that image; images with no
    annotations are treated as a 'background' stratum). This keeps rare
    classes represented across all three splits instead of, e.g., every
    'ghost_net' example ending up in train by chance.
    """

    def __init__(self, train_ratio: float = 0.7, val_ratio: float = 0.2, test_ratio: float = 0.1, seed: int = 42):
        total = train_ratio + val_ratio + test_ratio
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"Split ratios must sum to 1.0, got {total}")
        self.train_ratio = train_ratio
        self.val_ratio = val_ratio
        self.test_ratio = test_ratio
        self.seed = seed

    @staticmethod
    def _dominant_class(label_path: Path) -> str:
        if not label_path.exists() or label_path.stat().st_size == 0:
            return "background"
        counts: Counter = Counter()
        for line in label_path.read_text().splitlines():
            if not line.strip():
                continue
            counts[line.split()[0]] += 1
        if not counts:
            return "background"
        return counts.most_common(1)[0][0]

    def split(self, image_names: List[str], labels_dir: Path) -> Dict[str, List[str]]:
        strata: Dict[str, List[str]] = defaultdict(list)
        for name in image_names:
            key = self._dominant_class(labels_dir / f"{Path(name).stem}.txt")
            strata[key].append(name)

        rng = random.Random(self.seed)
        train, val, test = [], [], []

        for key, names in strata.items():
            rng.shuffle(names)
            n = len(names)
            n_train = max(1, round(n * self.train_ratio)) if n > 0 else 0
            n_val = max(1, round(n * self.val_ratio)) if n - n_train > 0 else 0
            # Guard against rounding pushing us past the available count for tiny strata.
            n_train = min(n_train, n)
            n_val = min(n_val, n - n_train)
            n_test = n - n_train - n_val

            train.extend(names[:n_train])
            val.extend(names[n_train:n_train + n_val])
            test.extend(names[n_train + n_val:n_train + n_val + n_test])

            if n < 3:
                logger.warning(
                    "Stratum '%s' has only %d image(s); split may not include all three sets for it.", key, n
                )

        rng.shuffle(train)
        rng.shuffle(val)
        rng.shuffle(test)
        return {"train": train, "val": val, "test": test}

    def verify(self, splits: Dict[str, List[str]], labels_dir: Path) -> Dict[str, Dict[str, int]]:
        """Per-split class distribution, plus a flag for classes missing from any split."""
        report: Dict[str, Dict[str, int]] = {}
        all_classes: set = set()

        for split_name, names in splits.items():
            counts: Counter = Counter()
            for name in names:
                label_path = labels_dir / f"{Path(name).stem}.txt"
                if not label_path.exists():
                    continue
                for line in label_path.read_text().splitlines():
                    if line.strip():
                        counts[line.split()[0]] += 1
            report[split_name] = dict(counts)
            all_classes.update(counts.keys())

        warnings = []
        for cls in all_classes:
            missing_from = [s for s in splits if cls not in report.get(s, {})]
            if missing_from:
                warnings.append(f"class '{cls}' is missing from split(s): {missing_from}")
                logger.warning("Class balance issue: %s", warnings[-1])

        report["_warnings"] = warnings
        return report


# --------------------------------------------------------------------------- #
# Orchestrator
# --------------------------------------------------------------------------- #
class SonarDatasetPreparer:
    """
    End-to-end dataset preparation:
        raw images + annotations  ->  preprocessed images + YOLO labels
                                    ->  stratified train/val/test layout
                                    ->  data.yaml + split_report.json
    """

    def __init__(
        self,
        data_dir: str,
        output_dir: str,
        class_names: Optional[List[str]] = None,
        preprocessor: Optional[SonarPreprocessor] = None,
        splitter: Optional[DatasetSplitter] = None,
    ):
        self.data_dir = Path(data_dir)
        self.output_dir = Path(output_dir)
        self.class_names = class_names or DEFAULT_CLASSES
        self.preprocessor = preprocessor or SonarPreprocessor()
        self.splitter = splitter or DatasetSplitter()
        self.converter = AnnotationConverter(
            class_map={name: idx for idx, name in enumerate(self.class_names)}
        )

    def _discover_images(self) -> List[Path]:
        images_dir = self.data_dir / "images"
        if not images_dir.exists():
            raise FileNotFoundError(f"Expected raw images at {images_dir}")
        images = [p for p in sorted(images_dir.iterdir()) if p.suffix.lower() in IMAGE_EXTENSIONS]
        if not images:
            raise FileNotFoundError(f"No images with extensions {IMAGE_EXTENSIONS} found in {images_dir}")
        logger.info("Discovered %d raw images in %s", len(images), images_dir)
        return images

    def _convert_annotations(self, images_dir: Path, raw_labels_dir: Path) -> None:
        voc_dir = self.data_dir / "annotations"
        csv_path = self.data_dir / "annotations.csv"

        if voc_dir.exists() and any(voc_dir.glob("*.xml")):
            logger.info("Converting Pascal VOC annotations from %s", voc_dir)
            self.converter.convert_voc_directory(voc_dir, images_dir, raw_labels_dir)
        elif csv_path.exists():
            logger.info("Converting CSV annotations from %s", csv_path)
            self.converter.convert_csv(csv_path, images_dir, raw_labels_dir)
        else:
            raise FileNotFoundError(
                f"No annotations found. Expected either {voc_dir}/*.xml or {csv_path}"
            )

    def run(self) -> Dict:
        logger.info("Starting dataset preparation: %s -> %s", self.data_dir, self.output_dir)
        images = self._discover_images()
        raw_images_dir = self.data_dir / "images"

        # 1) Convert annotations against the RAW images (pixel dimensions are unchanged
        #    by preprocessing, so this can happen before or after filtering).
        raw_labels_dir = self.output_dir / "_raw_labels"
        self._convert_annotations(raw_images_dir, raw_labels_dir)

        # 2) Preprocess every image into a flat staging directory.
        staged_images_dir = self.output_dir / "_staged_images"
        ok_count = 0
        for image_path in images:
            out_path = staged_images_dir / image_path.name
            if self.preprocessor.preprocess_file(image_path, out_path):
                ok_count += 1
        logger.info("Preprocessed %d/%d images", ok_count, len(images))

        # 3) Stratified split on the label distribution.
        staged_names = [p.name for p in sorted(staged_images_dir.iterdir())]
        splits = self.splitter.split(staged_names, raw_labels_dir)
        logger.info(
            "Split sizes -> train: %d, val: %d, test: %d",
            len(splits["train"]), len(splits["val"]), len(splits["test"]),
        )

        # 4) Materialize ultralytics-style directory layout.
        for split_name, names in splits.items():
            img_out = self.output_dir / "images" / split_name
            lbl_out = self.output_dir / "labels" / split_name
            img_out.mkdir(parents=True, exist_ok=True)
            lbl_out.mkdir(parents=True, exist_ok=True)
            for name in names:
                shutil.copy2(staged_images_dir / name, img_out / name)
                label_src = raw_labels_dir / f"{Path(name).stem}.txt"
                if label_src.exists():
                    shutil.copy2(label_src, lbl_out / f"{Path(name).stem}.txt")
                else:
                    (lbl_out / f"{Path(name).stem}.txt").write_text("")

        # 5) Verification report.
        report = self.splitter.verify(splits, raw_labels_dir)
        report_path = self.output_dir / "split_report.json"
        report_path.write_text(json.dumps(report, indent=2))
        logger.info("Wrote split verification report to %s", report_path)

        # 6) data.yaml for ultralytics.
        data_yaml = {
            "path": str(self.output_dir.resolve()),
            "train": "images/train",
            "val": "images/val",
            "test": "images/test",
            "nc": len(self.converter.class_map),
            "names": [name for name, _ in sorted(self.converter.class_map.items(), key=lambda kv: kv[1])],
        }
        data_yaml_path = self.output_dir / "data.yaml"
        data_yaml_path.write_text(yaml.safe_dump(data_yaml, sort_keys=False))
        self.converter.save_class_map(self.output_dir / "class_map.json")
        logger.info("Wrote %s", data_yaml_path)

        # Clean up staging dirs.
        shutil.rmtree(staged_images_dir, ignore_errors=True)
        shutil.rmtree(raw_labels_dir, ignore_errors=True)

        return {"splits": {k: len(v) for k, v in splits.items()}, "data_yaml": str(data_yaml_path), "report": report}
