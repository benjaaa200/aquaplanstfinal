#!/usr/bin/env python3
"""AquaPlants - Prueba de carga y estrés (manual).

Envía peticiones concurrentes contra una API en ejecución y resume latencias,
errores y throughput. No modifica datos: solo usa endpoints de lectura y un
inicio de sesión para obtener el token.

Ejemplos:
    # 200 peticiones, 20 en paralelo, endpoints por defecto
    python scripts/load_test.py --username admin

    # 1000 peticiones contra históricos con 50 hilos
    python scripts/load_test.py --requests 1000 --concurrency 50 \
        --endpoints /api/historicos/?limit=200

    # Sin autenticación (solo /api/health)
    python scripts/load_test.py --anonymous --endpoints /api/health

Variables de entorno opcionales:
    AQUAPLANTS_API_URL, AQUAPLANTS_USERNAME, AQUAPLANTS_PASSWORD
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

DEFAULT_API = os.getenv("AQUAPLANTS_API_URL", "http://127.0.0.1:8000")
DEFAULT_ENDPOINTS = (
    "/api/health",
    "/api/cultivos/",
    "/api/mediciones/?limit=20",
    "/api/alertas/?limit=20",
)


def _request(
    base_url: str, path: str, token: str | None, timeout: float
) -> Tuple[int, float, int]:
    """Return (status_code, seconds, response_bytes) for one GET request."""
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(base_url + path, headers=headers)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            return response.status, time.perf_counter() - started, len(body)
    except urllib.error.HTTPError as exc:
        exc.read()
        return exc.code, time.perf_counter() - started, 0
    except Exception:
        return 0, time.perf_counter() - started, 0


def login(base_url: str, username: str, password: str, timeout: float) -> str:
    payload = urllib.parse.urlencode(
        {"username": username, "password": password}
    ).encode("utf-8")
    request = urllib.request.Request(
        base_url + "/api/auth/login",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data["access_token"]


def percentile(values: List[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round(ratio * (len(ordered) - 1))))
    return ordered[index]


def main() -> int:
    parser = argparse.ArgumentParser(description="Prueba de carga de AquaPlants")
    parser.add_argument("--base-url", default=DEFAULT_API)
    parser.add_argument("--username", default=os.getenv("AQUAPLANTS_USERNAME", ""))
    parser.add_argument("--password", default=os.getenv("AQUAPLANTS_PASSWORD", ""))
    parser.add_argument("--requests", type=int, default=200)
    parser.add_argument("--concurrency", type=int, default=20)
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument(
        "--endpoints",
        nargs="+",
        default=list(DEFAULT_ENDPOINTS),
        help="Rutas relativas a consultar en cada iteración.",
    )
    parser.add_argument(
        "--anonymous",
        action="store_true",
        help="No iniciar sesión (útil solo con /api/health).",
    )
    args = parser.parse_args()

    if args.requests < 1 or args.concurrency < 1:
        print("--requests y --concurrency deben ser positivos", file=sys.stderr)
        return 2

    token = None
    if not args.anonymous:
        if not args.username or not args.password:
            print(
                "Indica --username/--password o usa --anonymous.",
                file=sys.stderr,
            )
            return 2
        token = login(
            args.base_url, args.username, args.password, args.timeout
        )
        print(f"Sesión iniciada como {args.username}")

    jobs: List[str] = [
        args.endpoints[index % len(args.endpoints)]
        for index in range(args.requests)
    ]

    started = time.perf_counter()
    results: List[Tuple[int, float, int]] = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = [
            executor.submit(_request, args.base_url, path, token, args.timeout)
            for path in jobs
        ]
        for future in as_completed(futures):
            results.append(future.result())
    elapsed = time.perf_counter() - started

    latencies = [latency for _, latency, _ in results]
    ok = sum(1 for status, _, _ in results if 200 <= status < 300)
    errors = len(results) - ok
    total_bytes = sum(size for _, _, size in results)

    print("\n=== Resumen de carga ===")
    print(f"Peticiones      : {len(results)}")
    print(f"Concurrencia    : {args.concurrency}")
    print(f"Éxitos (2xx)    : {ok}")
    print(f"Errores         : {errors}")
    print(f"Tiempo total    : {elapsed:.2f} s")
    print(f"Throughput      : {len(results) / elapsed:.1f} req/s")
    print(f"Bytes recibidos : {total_bytes / 1024:.1f} KiB")
    print(f"Latencia media  : {statistics.mean(latencies) * 1000:.1f} ms")
    print(f"Latencia p50    : {percentile(latencies, 0.50) * 1000:.1f} ms")
    print(f"Latencia p95    : {percentile(latencies, 0.95) * 1000:.1f} ms")
    print(f"Latencia p99    : {percentile(latencies, 0.99) * 1000:.1f} ms")
    print(f"Latencia máx.   : {max(latencies) * 1000:.1f} ms")

    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
