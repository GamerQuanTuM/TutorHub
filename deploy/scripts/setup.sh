#!/usr/bin/env bash
# First-time setup. Asks a few questions, writes deploy/.env with generated secrets, then runs deploy.sh.
#   ./scripts/setup.sh
# Run it again any time: it never overwrites a secret that already exists. To answer without prompts, set the
# variables named in the questions below (APP_DOMAIN, DATABASE_MODE, VIDEO_PROVIDER, ...) before running it.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

need openssl
need curl
check_docker

[ -f "$ENV_FILE" ] || cp "$DEPLOY_DIR/.env.example" "$ENV_FILE"
chmod 600 "$ENV_FILE"

say "Where will TutorHub live?"
APP_DOMAIN_ANSWER="$(ask 'App domain (e.g. app.example.com)' "$(env_get APP_DOMAIN)" APP_DOMAIN)"
env_set APP_DOMAIN "$APP_DOMAIN_ANSWER"
env_set ACME_EMAIL "$(ask "Email for HTTPS certificate notices" "$(env_get ACME_EMAIL)" ACME_EMAIL)"

say "Database: self-hosted (your own Supabase on this server) or cloud (supabase.com)?"
DB_MODE="$(ask 'DATABASE_MODE (self-hosted/cloud)' "$(env_get DATABASE_MODE)" DATABASE_MODE)"
case "$DB_MODE" in self-hosted|cloud) ;; *) die "DATABASE_MODE must be self-hosted or cloud";; esac
env_set DATABASE_MODE "$DB_MODE"

if [ "$DB_MODE" = "self-hosted" ]; then
  API_DOMAIN_ANSWER="$(ask 'API domain for your Supabase (e.g. api.example.com)' "$(env_get API_DOMAIN)" API_DOMAIN)"
  env_set API_DOMAIN "$API_DOMAIN_ANSWER"
  env_set SUPABASE_URL "https://$API_DOMAIN_ANSWER"
  env_default POSTGRES_PASSWORD "$(rand_hex 24)"
  env_default JWT_SECRET "$(rand_hex 32)"
  env_default REALTIME_DB_ENC_KEY "$(rand_hex 8)"          # exactly 16 characters
  env_default REALTIME_SECRET_KEY_BASE "$(rand_hex 32)"
  # The API keys are signed with JWT_SECRET, so they are only (re)generated while they are empty
  env_default SUPABASE_ANON_KEY "$(mk_jwt anon "$(env_get JWT_SECRET)")"
  env_default SUPABASE_SERVICE_ROLE_KEY "$(mk_jwt service_role "$(env_get JWT_SECRET)")"
else
  say "Using supabase.com: paste its values into deploy/.env (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)."
  say "Then run the SQL files in supabase/migrations once, in order, in its SQL editor."
fi

say "Video: self-hosted (open-source Jitsi on this server), jaas (8x8 hosted), or public (meet.jit.si, demo only)?"
VIDEO="$(ask 'VIDEO_PROVIDER (self-hosted/jaas/public)' "$(env_get VIDEO_PROVIDER)" VIDEO_PROVIDER)"
case "$VIDEO" in self-hosted|jaas|public) ;; *) die "VIDEO_PROVIDER must be self-hosted, jaas or public";; esac
env_set VIDEO_PROVIDER "$VIDEO"

if [ "$VIDEO" = "self-hosted" ]; then
  env_set VIDEO_DOMAIN "$(ask 'Video domain (e.g. video.example.com)' "$(env_get VIDEO_DOMAIN)" VIDEO_DOMAIN)"
  detected="$(curl -fsS -m 8 https://api.ipify.org 2>/dev/null || true)"
  env_set JVB_PUBLIC_IP "$(ask 'This server public IP (for the video traffic)' "${detected:-$(env_get JVB_PUBLIC_IP)}" JVB_PUBLIC_IP)"
  env_default JICOFO_AUTH_PASSWORD "$(rand_hex 16)"
  env_default JICOFO_COMPONENT_SECRET "$(rand_hex 16)"
  env_default JVB_AUTH_PASSWORD "$(rand_hex 16)"
  env_default JITSI_JWT_APP_SECRET "$(rand_hex 24)"
elif [ "$VIDEO" = "jaas" ]; then
  say "JaaS: create an API key at https://jaas.8x8.vc, then put JAAS_APP_ID, JAAS_KEY_ID and JAAS_PRIVATE_KEY in deploy/.env."
  say "./scripts/jaas-key.sh <private key file> prints the JAAS_PRIVATE_KEY line for you."
fi

env_default CRON_SECRET "$(rand_hex 24)"

say "Saved deploy/.env (permissions 600)."
say "Still empty and needed for a real launch: STRIPE_*, RESEND_API_KEY, EMAIL_FROM. Fill them in deploy/.env, then run ./scripts/deploy.sh again."
[ "${1:-}" = "--no-deploy" ] && exit 0

if [ -t 0 ]; then
  read -r -p "Build and start everything now? [Y/n] " go || true
  case "${go:-Y}" in [nN]*) say "Run ./scripts/deploy.sh when you are ready."; exit 0;; esac
fi
exec "$DEPLOY_DIR/scripts/deploy.sh"
