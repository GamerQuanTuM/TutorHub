#!/usr/bin/env bash
# Build and start TutorHub from deploy/.env. Safe to run again after every change to .env or to the code.
#   ./scripts/deploy.sh
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

check_docker
[ -f "$ENV_FILE" ] || die "deploy/.env not found. Run ./scripts/setup.sh first."

DB_MODE="$(env_get DATABASE_MODE)"; VIDEO="$(env_get VIDEO_PROVIDER)"
APP_DOMAIN="$(env_get APP_DOMAIN)"; API_DOMAIN="$(env_get API_DOMAIN)"; VIDEO_DOMAIN="$(env_get VIDEO_DOMAIN)"

# ---- check what the chosen modes need
missing=()
require() { [ -n "$(env_get "$1")" ] || missing+=("$1"); }
for k in APP_DOMAIN ACME_EMAIL SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY CRON_SECRET; do require "$k"; done
case "$DB_MODE" in
  self-hosted) for k in API_DOMAIN POSTGRES_PASSWORD JWT_SECRET REALTIME_DB_ENC_KEY REALTIME_SECRET_KEY_BASE; do require "$k"; done ;;
  cloud) ;;
  *) die "DATABASE_MODE must be self-hosted or cloud (is '$DB_MODE')." ;;
esac
case "$VIDEO" in
  self-hosted) for k in VIDEO_DOMAIN JVB_PUBLIC_IP JICOFO_AUTH_PASSWORD JICOFO_COMPONENT_SECRET JVB_AUTH_PASSWORD; do require "$k"; done ;;
  jaas) for k in JAAS_APP_ID JAAS_KEY_ID JAAS_PRIVATE_KEY; do require "$k"; done ;;
  public) warn "VIDEO_PROVIDER=public uses meet.jit.si, which disconnects embedded calls after 5 minutes. Fine for a demo, not for real lessons." ;;
  *) die "VIDEO_PROVIDER must be self-hosted, jaas or public (is '$VIDEO')." ;;
esac
[ ${#missing[@]} -eq 0 ] || die "Fill these in deploy/.env first: ${missing[*]}"
case "$APP_DOMAIN" in *example.com) warn "APP_DOMAIN is still $APP_DOMAIN. HTTPS will not work until it is your real domain." ;; esac
for k in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_CONNECT_WEBHOOK_SECRET STRIPE_PRO_PRICE_ID RESEND_API_KEY EMAIL_FROM; do
  if [ -z "$(env_get "$k")" ]; then
    if [ "$k" = "STRIPE_CONNECT_WEBHOOK_SECRET" ]; then warn "$k is empty: payments to tutors, refunds and Stripe onboarding status will not update until it is set."
    else warn "$k is empty: the app will show its 'Setup required' page until it is set."; fi
  fi
done

# ---- derived settings
if [ "$VIDEO" = "self-hosted" ]; then
  if [ "$(env_get JITSI_REQUIRE_TOKEN)" = "false" ]; then env_set JITSI_ENABLE_AUTH 0; env_set JITSI_ENABLE_GUESTS 1
  else env_default JITSI_JWT_APP_SECRET "$(rand_hex 24)"; env_set JITSI_ENABLE_AUTH 1; env_set JITSI_ENABLE_GUESTS 0; fi
fi

# ---- Caddyfile from the snippets that are needed
{
  cat "$DEPLOY_DIR/caddy/global.caddy" "$DEPLOY_DIR/caddy/app.caddy"
  [ "$DB_MODE" = "self-hosted" ] && cat "$DEPLOY_DIR/caddy/api.caddy"
  [ "$VIDEO" = "self-hosted" ] && cat "$DEPLOY_DIR/caddy/video.caddy"
  true
} > "$DEPLOY_DIR/Caddyfile"

say "Starting: database=$DB_MODE, video=$VIDEO"
compose up -d --build --remove-orphans

[ "$DB_MODE" = "self-hosted" ] && "$DEPLOY_DIR/scripts/migrate.sh"

cat <<EOF

$(printf '\033[1;32mTutorHub is starting.\033[0m')

  App         https://$APP_DOMAIN
$( [ "$DB_MODE" = "self-hosted" ] && echo "  API         https://$API_DOMAIN   (your Supabase)" )
$( [ "$VIDEO" = "self-hosted" ] && echo "  Video       https://$VIDEO_DOMAIN   (open UDP 10000 on the firewall)" )

  Stripe webhook URL to add in the Stripe dashboard:  https://$APP_DOMAIN/api/webhooks/stripe
  Check everything:   ./scripts/doctor.sh      Logs:   docker compose -f deploy/docker-compose.yml logs -f app
EOF
