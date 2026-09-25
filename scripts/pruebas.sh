#!/usr/bin/env bash
# Ejecuta todas las pruebas automáticas de Plan 20 (interfaz y lógica, con componentes nativos simulados).
# Requisitos: Node 20+, Python 3 y el navegador de Playwright (npx playwright install chromium).
set -u
cd "$(dirname "$0")/.."
PORT="${PORT:-8765}"
# Las pruebas usan fechas y horas de Colombia/Ecuador (UTC-5); fija la zona para que den igual en cualquier máquina.
export TZ="America/Bogota"
python3 -m http.server "$PORT" -d www >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/index.html" && break; sleep 0.3; done
export PLAN20_URL="http://localhost:$PORT/index.html"
FALLOS=0
for f in pruebas_regresion.js pruebas_microfono.js pruebas_escudo.js pruebas_brujula.js; do
  echo "=== $f"
  node "$f" || FALLOS=$((FALLOS+1))
done
if [ "$FALLOS" -gt 0 ]; then echo "Hubo fallos en $FALLOS archivo(s) de pruebas."; exit 1; fi
echo "Todas las pruebas superadas."
