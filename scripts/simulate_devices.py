#!/usr/bin/env python3
"""
AquaPlants - Simulador de dispositivos IoT

Envía mediciones virtuales al backend usando el mismo contrato que tendrá
el ESP32 real. Sirve para probar dashboards, históricos, alertas y riego
sin necesidad del hardware.

Ejemplos:
    # Un ciclo de prueba
    python scripts/simulate_devices.py --once

    # Simulación continua cada 15 segundos
    python scripts/simulate_devices.py --interval 15

    # 24 horas de historial, una lectura cada 30 minutos
    python scripts/simulate_devices.py --backfill-hours 24 --backfill-step 30

    # Forzar alertas para probar el centro de alertas
    python scripts/simulate_devices.py --scenario alert --once
"""
from __future__ import annotations

import argparse
import getpass
import json
import math
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

DEFAULT_API = os.getenv("AQUAPLANTS_API_URL", "http://127.0.0.1:8000")
DEFAULT_USER = os.getenv("AQUAPLANTS_USERNAME", "")
DEFAULT_PASSWORD = os.getenv("AQUAPLANTS_PASSWORD", "")

DEVICE_PROFILES = [
    {
        "id": "SIM-INV-A",
        "name": "Sensor Invernadero A",
        "cultivo_id": 1,
        "temp_base": 23.5,
        "hum_base": 66.0,
        "water_base": 82.0,
        "battery": 94.0,
    },
    {
        "id": "SIM-MOD-3",
        "name": "Sensor Módulo 3",
        "cultivo_id": 2,
        "temp_base": 24.2,
        "hum_base": 62.0,
        "water_base": 74.0,
        "battery": 81.0,
    },
    {
        "id": "SIM-INV-B",
        "name": "Sensor Invernadero B",
        "cultivo_id": 3,
        "temp_base": 22.8,
        "hum_base": 69.0,
        "water_base": 88.0,
        "battery": 57.0,
    },
    {
        "id": "SIM-MOD-1",
        "name": "Sensor Módulo 1",
        "cultivo_id": 4,
        "temp_base": 23.1,
        "hum_base": 64.0,
        "water_base": 79.0,
        "battery": 35.0,
    },
    {
        "id": "SIM-INV-C",
        "name": "Sensor Invernadero C",
        "cultivo_id": 5,
        "temp_base": 24.0,
        "hum_base": 61.0,
        "water_base": 76.0,
        "battery": 72.0,
    },
]


class ApiError(RuntimeError):
    pass


def api_request(
    url: str,
    method: str = "GET",
    body: Optional[bytes] = None,
    token: Optional[str] = None,
    content_type: str = "application/json",
    timeout: int = 15,
) -> Any:
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = content_type
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ApiError(f"HTTP {exc.code} en {url}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise ApiError(f"No se pudo conectar con {url}: {exc.reason}") from exc


def login(api: str, username: str, password: str) -> str:
    form = urllib.parse.urlencode({"username": username, "password": password}).encode()
    data = api_request(
        f"{api}/api/auth/login",
        method="POST",
        body=form,
        content_type="application/x-www-form-urlencoded",
    )
    token = (data or {}).get("access_token")
    if not token:
        raise ApiError("El login no devolvió access_token")
    return token


def load_cultivos(api: str, token: str) -> Dict[int, Dict[str, Any]]:
    cultivos = api_request(f"{api}/api/cultivos/", token=token)
    return {int(c["id"]): c for c in (cultivos or []) if c.get("id") is not None}


def get_profiles(limit: int, cultivos: Dict[int, Dict[str, Any]]) -> List[Dict[str, Any]]:
    available = [p for p in DEVICE_PROFILES if not cultivos or p["cultivo_id"] in cultivos]
    if not available:
        raise ApiError("No hay cultivos accesibles para esta cuenta.")
    if not cultivos:
        raise ApiError("La cuenta no tiene cultivos asignados para simular.")

    profiles = []
    for index in range(limit):
        profile = dict(available[index % len(available)])
        cultivo = cultivos.get(profile["cultivo_id"])
        profile["cultivo_nombre"] = (cultivo or {}).get("nombre", f"Cultivo {profile['cultivo_id']}")
        profile["water"] = float(profile["water_base"])
        profile["battery"] = float(profile["battery"])
        profiles.append(profile)
    return profiles


def daily_cycle(now: datetime) -> float:
    hour = now.hour + now.minute / 60.0
    return math.sin(2 * math.pi * (hour - 6) / 24.0)


def measure(
    profile: Dict[str, Any],
    now: datetime,
    scenario: str,
    force_alert: bool = False,
) -> Dict[str, float]:
    cycle = daily_cycle(now)

    temp = profile["temp_base"] + 2.8 * cycle + random.gauss(0, 0.35)
    hum = profile["hum_base"] - 7.0 * cycle + random.gauss(0, 1.2)

    profile["water"] -= random.uniform(0.12, 0.35)
    if profile["water"] < 32:
        profile["water"] = random.uniform(82, 92)
        print(f"[{profile['id']}] Recarga automática de estanque simulada")
    water = profile["water"] + random.gauss(0, 0.4)

    profile["battery"] = max(5.0, profile["battery"] - random.uniform(0.005, 0.02))

    if force_alert or (scenario == "mixed" and random.random() < 0.10):
        anomaly = random.choice(["temp", "hum", "water"])
        if anomaly == "temp":
            temp = random.uniform(31.0, 35.5)
        elif anomaly == "hum":
            hum = random.uniform(22.0, 35.0)
        else:
            water = random.uniform(8.0, 17.0)

    temp = round(max(8.0, min(45.0, temp)), 2)
    hum = round(max(0.0, min(100.0, hum)), 1)
    water = round(max(0.0, min(100.0, water)), 1)
    ph = round(random.uniform(5.7, 6.7), 2)
    conductivity = round(random.uniform(1.1, 2.4), 2)

    return {
        "temperatura": temp,
        "humedad": hum,
        "nivel_agua": water,
        "ph": ph,
        "conductividad": conductivity,
    }


def send_measurement(
    api: str,
    token: str,
    profile: Dict[str, Any],
    values: Dict[str, float],
    when: Optional[datetime] = None,
) -> None:
    payload: Dict[str, Any] = {"cultivo_id": profile["cultivo_id"], **values}
    if when is not None:
        payload["fecha_hora"] = when.isoformat()

    api_request(
        f"{api}/api/mediciones/",
        method="POST",
        body=json.dumps(payload).encode("utf-8"),
        token=token,
    )
    timestamp = (when or datetime.now()).strftime("%H:%M:%S")
    print(
        f"[{timestamp}] {profile['id']} | {profile['cultivo_nombre']} | "
        f"{values['temperatura']} C | {values['humedad']}% HR | {values['nivel_agua']}% agua"
    )


def run_backfill(
    api: str,
    token: str,
    profiles: List[Dict[str, Any]],
    hours: float,
    step_minutes: int,
) -> None:
    now = datetime.now().replace(microsecond=0)
    start = now - timedelta(hours=hours)
    steps = max(1, int((hours * 60) / step_minutes))
    total = steps * len(profiles)
    print(f"Generando {total} mediciones históricas ({hours:g} h, cada {step_minutes} min)...")

    sent = 0
    for index in range(steps):
        when = start + timedelta(minutes=index * step_minutes)
        for profile in profiles:
            values = measure(profile, when, scenario="normal")
            send_measurement(api, token, profile, values, when=when)
            sent += 1
            if sent % 50 == 0:
                print(f"  ... {sent}/{total}")

    print(f"Historial completado: {sent} mediciones enviadas.")


def run_live(
    api: str,
    token: str,
    profiles: List[Dict[str, Any]],
    interval: int,
    cycles: int,
    scenario: str,
) -> None:
    print(f"Simulador activo: {len(profiles)} dispositivos, cada {interval}s. Ctrl+C para detener.")
    cycle = 0
    while cycles <= 0 or cycle < cycles:
        cycle += 1
        now = datetime.now().replace(microsecond=0)
        force_index = random.randrange(len(profiles)) if scenario == "alert" else -1

        for index, profile in enumerate(profiles):
            values = measure(profile, now, scenario, force_alert=(index == force_index))
            try:
                send_measurement(api, token, profile, values)
            except ApiError as exc:
                print(f"[error] {profile['id']}: {exc}")

        if cycles <= 0 or cycle < cycles:
            time.sleep(interval)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulador de dispositivos AquaPlants")
    parser.add_argument("--api", default=DEFAULT_API, help="URL base del backend")
    parser.add_argument("--username", default=DEFAULT_USER, help="Usuario para autenticarse")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Contraseña del usuario")
    parser.add_argument("--devices", type=int, default=3, help="Cantidad de dispositivos virtuales")
    parser.add_argument("--interval", type=int, default=15, help="Segundos entre ciclos")
    parser.add_argument("--cycles", type=int, default=0, help="Ciclos a ejecutar (0 = infinito)")
    parser.add_argument("--once", action="store_true", help="Ejecutar un solo ciclo")
    parser.add_argument(
        "--scenario",
        choices=["normal", "mixed", "alert"],
        default="mixed",
        help="normal: valores estables | mixed: anomalias ocasionales | alert: fuerza alertas",
    )
    parser.add_argument(
        "--backfill-hours",
        type=float,
        default=0,
        help="Generar historial hacia atrás durante N horas",
    )
    parser.add_argument(
        "--backfill-step",
        type=int,
        default=30,
        help="Minutos entre mediciones del historial",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not args.username:
        args.username = input("Usuario AquaPlants: ").strip()
    if not args.password:
        args.password = getpass.getpass("Contraseña AquaPlants: ")
    if not args.username or not args.password:
        print("Se requieren usuario y contraseña.", file=sys.stderr)
        return 2
    if args.devices < 1:
        print("--devices debe ser al menos 1", file=sys.stderr)
        return 2
    if args.interval < 1:
        print("--interval debe ser al menos 1 segundo", file=sys.stderr)
        return 2
    if args.backfill_step < 1:
        print("--backfill-step debe ser al menos 1 minuto", file=sys.stderr)
        return 2

    try:
        print(f"Conectando con {args.api} ...")
        token = login(args.api, args.username, args.password)
        cultivos = load_cultivos(args.api, token)
        profiles = get_profiles(args.devices, cultivos)

        print("Dispositivos virtuales:")
        for profile in profiles:
            print(f"  - {profile['id']} -> {profile['cultivo_nombre']} (cultivo {profile['cultivo_id']})")

        if args.backfill_hours > 0:
            run_backfill(args.api, token, profiles, args.backfill_hours, args.backfill_step)

        if args.once:
            run_live(args.api, token, profiles, args.interval, 1, args.scenario)
        elif args.backfill_hours <= 0:
            run_live(args.api, token, profiles, args.interval, args.cycles, args.scenario)

        return 0
    except KeyboardInterrupt:
        print("\nSimulador detenido.")
        return 0
    except ApiError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
