#!/usr/bin/env sh
# Arranque para Linux (Ubuntu/EC2). Lee la configuración desde .env y el entorno.
set -eu

: "${API_HOST:=0.0.0.0}"
: "${API_PORT:=${PORT:-8000}}"
: "${SKIP_INIT_DB:=1}"
export API_HOST API_PORT SKIP_INIT_DB

exec python serve.py
