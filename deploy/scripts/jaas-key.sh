#!/usr/bin/env bash
# Turn the private key file you downloaded from jaas.8x8.vc into the one-line JAAS_PRIVATE_KEY value.
#   ./scripts/jaas-key.sh path/to/key.pk             print the line
#   ./scripts/jaas-key.sh path/to/key.pk --write     also store it in deploy/.env
#   ./scripts/jaas-key.sh path/to/key.pk --write-to ../.env.local    store it in another env file (e.g. for testing on your computer)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

file="${1:-}"
[ -n "$file" ] && [ -f "$file" ] || die "Usage: ./scripts/jaas-key.sh <private key file> [--write]"
grep -q "PRIVATE KEY" "$file" || die "That file does not look like a PEM private key."
value="$(awk 'BEGIN { ORS = "\\n" } { sub(/\r$/, ""); print }' "$file")"
value="${value%\\n}"
if [ "${2:-}" = "--write" ] || [ "${2:-}" = "--write-to" ]; then
  if [ "${2:-}" = "--write-to" ]; then
    [ -n "${3:-}" ] || die "--write-to needs a file path"
    ENV_FILE="$(cd "$(dirname "$3")" && pwd)/$(basename "$3")"
  fi
  env_set JAAS_PRIVATE_KEY "'$value'"
  say "Saved JAAS_PRIVATE_KEY in $ENV_FILE. Do not forget JAAS_APP_ID and JAAS_KEY_ID."
else
  printf "JAAS_PRIVATE_KEY='%s'\n" "$value"
fi
