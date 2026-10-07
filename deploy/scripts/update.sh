#!/usr/bin/env bash
# Pull the latest code and redeploy. Your .env and data are kept.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

need git
git -C "$REPO_DIR" pull --ff-only
exec "$DEPLOY_DIR/scripts/deploy.sh"
