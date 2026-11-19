"""Logging configuration for the AquaPlants backend."""
import logging
import os
import sys


def configure_logging() -> None:
    """Set up a single, predictable logger for the whole application."""
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Access logs are noisy during polling; keep only warnings and errors.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
