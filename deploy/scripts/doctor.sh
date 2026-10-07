#!/usr/bin/env bash
# Quick health check of a running deployment: services, DNS, HTTPS, API and video.
#   ./scripts/doctor.sh
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; fails=$((fails + 1)); }
fails=0

check_docker
[ -f "$ENV_FILE" ] || die "deploy/.env not found."
APP_DOMAIN="$(env_get APP_DOMAIN)"; API_DOMAIN="$(env_get API_DOMAIN)"; VIDEO_DOMAIN="$(env_get VIDEO_DOMAIN)"
DB_MODE="$(env_get DATABASE_MODE)"; VIDEO="$(env_get VIDEO_PROVIDER)"

say "Containers"
compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}' 2>/dev/null || true
not_running="$(compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | awk '$2 != "running" {print $1}' | tr '\n' ' ')"
if [ -z "$not_running" ]; then ok "all containers running"; else bad "not running: $not_running"; fi

ip="$(curl -fsS -m 8 https://api.ipify.org 2>/dev/null || true)"
say "DNS (this server is ${ip:-unknown})"
domains="$APP_DOMAIN"
[ "$DB_MODE" = "self-hosted" ] && domains="$domains $API_DOMAIN"
[ "$VIDEO" = "self-hosted" ] && domains="$domains $VIDEO_DOMAIN"
for d in $domains; do
  got="$(getent hosts "$d" 2>/dev/null | awk '{print $1; exit}')"
  if [ -z "$got" ]; then bad "$d does not resolve yet"
  elif [ -n "$ip" ] && [ "$got" != "$ip" ]; then bad "$d points to $got, not to this server ($ip)"
  else ok "$d -> $got"; fi
done

status() { curl -sS -o /dev/null -m 15 -w '%{http_code}' "$@" 2>/dev/null || echo 000; }

say "HTTPS"
code="$(status "https://$APP_DOMAIN/login")"
if [ "$code" = "200" ]; then ok "https://$APP_DOMAIN/login answers 200"; else bad "https://$APP_DOMAIN/login answered $code (certificates can take a minute on the first start)"; fi
if [ "$DB_MODE" = "self-hosted" ]; then
  key="$(env_get SUPABASE_ANON_KEY)"
  code="$(status -H "apikey: $key" "https://$API_DOMAIN/auth/v1/health")"
  if [ "$code" = "200" ]; then ok "Supabase auth is healthy"; else bad "https://$API_DOMAIN/auth/v1/health answered $code"; fi
  code="$(status -H "apikey: $key" "https://$API_DOMAIN/rest/v1/")"
  if [ "$code" = "200" ]; then ok "Supabase REST API answers"; else bad "https://$API_DOMAIN/rest/v1/ answered $code (did migrate.sh run?)"; fi
fi
if [ "$VIDEO" = "self-hosted" ]; then
  code="$(status "https://$VIDEO_DOMAIN/external_api.js")"
  if [ "$code" = "200" ]; then ok "Jitsi serves external_api.js"; else bad "https://$VIDEO_DOMAIN/external_api.js answered $code"; fi
  warn "Cannot test UDP 10000 from here: make sure the firewall (and your provider's firewall) allows 10000/udp."
fi

if [ "$fails" -eq 0 ]; then say "All good."; else warn "$fails problem(s) found."; exit 1; fi
