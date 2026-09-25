#!/usr/bin/env bash
# Simula 2 meses de uso en una Galaxy Tab S9 FE (componentes nativos simulados). Tarda ~4 minutos.
# Resultado: docs/simulacion-2meses-resultado.json. Termina con código 1 si hay hallazgos.
set -u
cd "$(dirname "$0")/.."
PORT="${PORT:-8765}"
export TZ="America/Guayaquil"
python3 -m http.server "$PORT" -d www >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/index.html" && break; sleep 0.3; done
export PLAN20_URL="http://localhost:$PORT/index.html"
node pruebas_simulacion_2meses.js
