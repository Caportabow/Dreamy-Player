#!/usr/bin/env bash
set -euo pipefail

# Deploy Dreamy in production mode (uses docker-compose.prod.yml).
#
#   scripts/deploy.sh          build + start detached + follow logs
#   scripts/deploy.sh up       build + start detached (no log tail)
#   scripts/deploy.sh down     stop the stack
#   scripts/deploy.sh logs     follow logs
#   scripts/deploy.sh ps       show stack status

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

cmd="${1:-}"
if [ $# -gt 0 ]; then
  shift
fi

case "$cmd" in
  up)
    "${COMPOSE[@]}" up -d --build "$@"
    "${COMPOSE[@]}" ps
    ;;
  down)
    "${COMPOSE[@]}" down "$@"
    ;;
  logs)
    "${COMPOSE[@]}" logs -f --tail=100 "$@"
    ;;
  ps)
    "${COMPOSE[@]}" ps "$@"
    ;;
  "")
    echo "==> Building and starting the production stack"
    "${COMPOSE[@]}" up -d --build

    echo
    echo "==> Status"
    "${COMPOSE[@]}" ps

    echo
    echo "==> Following logs (Ctrl+C to stop watching — services keep running)"
    exec "${COMPOSE[@]}" logs -f --tail=50
    ;;
  *)
    echo "Usage: $0 [up|down|logs|ps]" >&2
    exit 1
    ;;
esac
