#!/usr/bin/env bash
#
# Refuse to deploy into a port conflict.
#
# Docker's own failure mode here is unhelpful: the container that loses the race
# either never starts or silently stops listening, and the symptom shows up
# hours later as an unreachable site. This checks first and names the offender.
#
#   ./scripts/preflight-ports.sh                 # uses .env.production
#   ENV_FILE=.env.staging ./scripts/preflight-ports.sh
#
# Exit 0 = every port SchoolSphere wants is free, or already held by
#          SchoolSphere itself (so `up -d` will just recreate it).
# Exit 1 = a port is held by something else. Nothing was changed.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
PROJECT="${COMPOSE_PROJECT_NAME:-schoolsphere}"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "./$ENV_FILE"; set +a
else
  echo "note: $ENV_FILE not found — checking default ports" >&2
fi

EDGE_HTTP_PORT="${EDGE_HTTP_PORT:-80}"
EDGE_HTTPS_PORT="${EDGE_HTTPS_PORT:-443}"
APP_HOST_PORT="${APP_HOST_PORT:-8100}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

# Which container, if any, publishes this host port?
# Both helpers swallow their own failures: a missing `docker`, a stopped daemon
# or an empty result must not abort the run under `set -e`.
holder_of() {
  local port="$1" out=''
  command -v docker >/dev/null 2>&1 || { printf ''; return 0; }
  out="$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null || true)"
  printf '%s' "$out" |
    awk -v p=":${port}->" -F'\t' '$2 ~ p { print $1; exit }' || true
}

# Something non-Docker (a host nginx, apache, systemd unit) can hold it too.
listener_of() {
  local port="$1"
  command -v ss >/dev/null 2>&1 || { printf ''; return 0; }
  ss -Hltnp "sport = :${port}" 2>/dev/null | head -n1 || true
}

# Last resort when neither docker nor ss can name the owner: just try to connect.
# This cannot say what is listening, only that something is — which is still
# enough to stop the deploy.
in_use() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
}

status=0

check() {
  local port="$1" label="$2"
  local holder listener
  holder="$(holder_of "$port")"

  if [ -n "$holder" ]; then
    case "$holder" in
      "${PROJECT}-"*)
        green "  ok    ${port}  ${label} — held by ${holder} (this stack, will be recreated)"
        return 0
        ;;
      *)
        red   "  CLASH ${port}  ${label} — held by container '${holder}'"
        status=1
        return 0
        ;;
    esac
  fi

  listener="$(listener_of "$port")"
  if [ -n "$listener" ]; then
    red "  CLASH ${port}  ${label} — held by a host process:"
    red "        ${listener}"
    status=1
    return 0
  fi

  if in_use "$port"; then
    red "  CLASH ${port}  ${label} — something is listening (run as root to see what)"
    status=1
    return 0
  fi

  green "  ok    ${port}  ${label} — free"
}

echo "Preflight port check (project: ${PROJECT}, env: ${ENV_FILE})"
check "$EDGE_HTTP_PORT"  "caddy http"
check "$EDGE_HTTPS_PORT" "caddy https"
check "$APP_HOST_PORT"   "app (127.0.0.1 only)"

if [ "$status" -ne 0 ]; then
  cat >&2 <<EOF

Deploy stopped — nothing was changed.

Two ways out:

  1. Move the other stack into its own block. This is the right fix; see
     PORTS.md for which block each stack owns.

  2. Move SchoolSphere, if the other stack legitimately owns the port. Set the
     variable in ${ENV_FILE} and re-run:

       APP_HOST_PORT=8101

     Note that EDGE_HTTP_PORT and EDGE_HTTPS_PORT must stay 80 and 443 for
     certificates and plain-http redirects to work. If another container is
     holding those, that container is the one that has to move.
EOF
  exit 1
fi

green "All clear."
