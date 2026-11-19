"""Launch the AquaPlants API, optionally with multiple worker processes.

Examples:
    python serve.py                         # single worker (development)
    set API_WORKERS=4 && python serve.py     # several workers (more users)

Environment variables:
    API_HOST, API_PORT, API_WORKERS
"""
import os

import uvicorn

from backend.logging_config import configure_logging


if __name__ == "__main__":
    configure_logging()
    uvicorn.run(
        "main:app",
        host=os.getenv("API_HOST", "127.0.0.1"),
        port=int(os.getenv("API_PORT") or os.getenv("PORT") or "8000"),
        workers=int(os.getenv("API_WORKERS", "1")),
        log_config=None,
    )
