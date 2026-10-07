#!/usr/bin/env bash
# Shared helpers for the deploy scripts. Source it; do not run it.

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"

say()  { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m  %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not installed."; }

check_docker() {
  need docker
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' command)."
  docker info >/dev/null 2>&1 || die "Cannot talk to the Docker daemon. Is it running, and are you in the 'docker' group (or using sudo)?"
}

# env_get KEY  -> value from .env (surrounding quotes removed), empty if missing
env_get() {
  local line
  line="$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

# env_set KEY VALUE  -> replace the line in .env (or append it). Safe for any characters in VALUE.
env_set() {
  [ -f "$ENV_FILE" ] || : > "$ENV_FILE"
  K="$1" V="$2" awk 'BEGIN { FS = "="; done = 0 }
    $1 == ENVIRON["K"] { print ENVIRON["K"] "=" ENVIRON["V"]; done = 1; next }
    { print }
    END { if (!done) print ENVIRON["K"] "=" ENVIRON["V"] }' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
}

# env_default KEY VALUE -> set only when the key is empty/missing
env_default() { [ -n "$(env_get "$1")" ] || env_set "$1" "$2"; }

rand_hex() { openssl rand -hex "$1"; }

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# mk_jwt ROLE SECRET -> a 10-year HS256 token like the ones Supabase calls "anon key" and "service_role key"
mk_jwt() {
  local role="$1" secret="$2" iat exp header payload sig
  iat="$(date +%s)"; exp=$((iat + 315360000))
  header="$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)"
  payload="$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$role" "$iat" "$exp" | b64url)"
  sig="$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)"
  printf '%s.%s.%s' "$header" "$payload" "$sig"
}

# ask "Question" "default" -> value (a preset environment variable named in $3 wins and skips the question)
ask() {
  local question="$1" default="$2" preset="${3:-}" answer
  if [ -n "$preset" ] && [ -n "${!preset:-}" ]; then printf '%s' "${!preset}"; return; fi
  if [ ! -t 0 ]; then printf '%s' "$default"; return; fi
  read -r -p "$question [$default]: " answer >&2 || true
  printf '%s' "${answer:-$default}"
}

# Which compose profiles the current .env asks for
profile_args() {
  PROFILE_ARGS=()
  [ "$(env_get DATABASE_MODE)" = "self-hosted" ] && PROFILE_ARGS+=(--profile supabase)
  [ "$(env_get VIDEO_PROVIDER)" = "self-hosted" ] && PROFILE_ARGS+=(--profile jitsi)
  return 0
}

compose() {
  profile_args
  (cd "$DEPLOY_DIR" && docker compose --env-file "$ENV_FILE" "${PROFILE_ARGS[@]}" "$@")
}
