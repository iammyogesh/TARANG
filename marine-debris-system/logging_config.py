"""
logging_config.py
------------------
Centralized logging so every module and the CLI produce consistent,
timestamped output to both stdout and a per-module log file.
"""

import logging
import sys
from pathlib import Path


def setup_logger(name: str, log_dir: str = "./logs", level: int = logging.INFO) -> logging.Logger:
    """Return a configured logger. Safe to call repeatedly with the same name."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger  # already configured, avoid duplicate handlers

    logger.setLevel(level)

    fmt = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(fmt)
    logger.addHandler(console_handler)

    try:
        Path(log_dir).mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(Path(log_dir) / f"{name}.log")
        file_handler.setFormatter(fmt)
        logger.addHandler(file_handler)
    except OSError:
        logger.warning("Could not create log file under %s; continuing with console logging only.", log_dir)

    logger.propagate = False
    return logger
