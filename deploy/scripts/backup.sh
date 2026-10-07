#!/usr/bin/env bash
# Back up your own Supabase (database dump + uploaded files) into deploy/backups. Keeps the newest 14 of each.
#   ./scripts/backup.sh          run it daily, e.g.:  0 3 * * *  /home/you/tutorhub/deploy/scripts/backup.sh
# supabase.com projects back themselves up (Dashboard > Database > Backups): this script is for DATABASE_MODE=self-hosted.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

check_docker
[ "$(env_get DATABASE_MODE)" = "self-hosted" ] || die "Nothing to back up here: DATABASE_MODE is not self-hosted."
dir="$DEPLOY_DIR/backups"; mkdir -p "$dir"; ts="$(date +%Y%m%d-%H%M%S)"

say "Dumping the database..."
compose exec -T db pg_dump -U supabase_admin -d postgres --no-owner --no-privileges | gzip > "$dir/db-$ts.sql.gz"

say "Archiving uploaded files..."
docker run --rm -v tutorhub_storage-data:/data:ro -v "$dir":/backup alpine tar czf "/backup/storage-$ts.tar.gz" -C /data .

for prefix in db storage; do
  ls -1t "$dir"/$prefix-* 2>/dev/null | tail -n +15 | xargs -r rm -f
done
say "Done: $dir/db-$ts.sql.gz and $dir/storage-$ts.tar.gz"
say "Copy these off the server too (a backup on the same disk does not survive losing the disk)."
