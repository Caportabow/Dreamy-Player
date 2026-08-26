#!/usr/bin/env bash
set -euo pipefail

# Start the Dreamy development stack (docker-compose.yml).
#
#   scripts/dev.sh up       build + start detached + show status (default)
#   scripts/dev.sh down     stop the stack
#   scripts/dev.sh logs     follow logs
#   scripts/dev.sh ps       show stack status
#
# The Cloudflare tunnel is enabled automatically when TUNNEL_TOKEN is set in
# .env (or the environment), so no --profile flag is needed.

cd "$(dirname "$0")/.."

COMPOSE=(docker compose)

# Enable the Cloudflare tunnel only when a token is configured (via the
# environment or .env). Without a token, cloudflared stays off by design.
if [ -n "${TUNNEL_TOKEN:-}" ] || grep -Eq '^TUNNEL_TOKEN=.+' .env 2>/dev/null; then
  COMPOSE+=(--profile tunnel)
fi

cmd="${1:-up}"
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
  *)
    echo "Usage: $0 [up|down|logs|ps] [compose args...]" >&2
    exit 1
    ;;
esac
