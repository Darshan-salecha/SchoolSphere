#!/usr/bin/env bash
#
# Build and start the production stack, refusing to start into a port conflict.
#
#   ./scripts/deploy.sh              # build + up
#   ./scripts/deploy.sh --no-build   # restart with the current images
#
# Everything it runs is in DEPLOYMENT.md; this just removes the chance of
# getting one of the flags wrong at 1am.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)

if [ ! -f "$ENV_FILE" ]; then
  echo "error: $ENV_FILE is missing. Start from .env.production.example." >&2
  exit 1
fi

ENV_FILE="$ENV_FILE" ./scripts/preflight-ports.sh

# shellcheck disable=SC1090
set -a; . "./$ENV_FILE"; set +a

BUILD=(--build)
[ "${1:-}" = "--no-build" ] && BUILD=()

echo
echo "Starting stack…"
"${COMPOSE[@]}" up -d "${BUILD[@]}"

echo
"${COMPOSE[@]}" ps

# The app port is loopback-only, so this reaches the Next.js server directly and
# skips TLS entirely — a clean answer here means the only thing left to look at
# is Caddy.
APP_HOST_PORT="${APP_HOST_PORT:-8100}"

echo
echo "App health (direct, no TLS):"
for _ in $(seq 1 15); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${APP_HOST_PORT}/api/health"; then
    echo
    break
  fi
  sleep 2
done

echo
echo "Edge health (through Caddy):"
curl -sS -k --max-time 5 "https://${APP_DOMAIN:-localhost}/api/health" || {
  echo
  echo "Caddy did not answer. Its log is the next thing to read:"
  echo "  ${COMPOSE[*]} logs --tail=80 caddy"
}
echo
