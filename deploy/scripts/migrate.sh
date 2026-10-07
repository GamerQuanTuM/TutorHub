#!/usr/bin/env bash
# Apply supabase/migrations/*.sql to YOUR OWN Supabase (DATABASE_MODE=self-hosted), once each and in order.
# Safe to run repeatedly: finished files are remembered in _tutorhub.migrations. deploy.sh calls this for you.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

check_docker
[ "$(env_get DATABASE_MODE)" = "self-hosted" ] || die "DATABASE_MODE is not self-hosted: with supabase.com run the SQL files in its SQL editor instead."

# supabase_admin is the database superuser inside the container (the 'postgres' role cannot create policies on storage.objects)
PSQL() { compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }

wait_for() { # wait_for "what" "sql returning t" service
  local i
  for i in $(seq 1 90); do
    [ "$(PSQL -tA -c "$2" 2>/dev/null || true)" = "t" ] && return 0
    sleep 2
  done
  die "Timed out waiting for $1. Look at the logs: docker compose -f deploy/docker-compose.yml logs $3"
}

say "Waiting for the database and the Supabase services to prepare their schemas..."
wait_for "the database" "select true" db
wait_for "auth (auth.users)" "select to_regclass('auth.users') is not null" auth
wait_for "storage (storage.buckets)" "select to_regclass('storage.buckets') is not null" storage

PSQL -q -c "create schema if not exists _tutorhub; create table if not exists _tutorhub.migrations (name text primary key, applied_at timestamptz not null default now());"

applied=0
for f in "$REPO_DIR"/supabase/migrations/*.sql; do
  name="$(basename "$f")"
  if [ "$(PSQL -tA -c "select 1 from _tutorhub.migrations where name = '$name'")" = "1" ]; then continue; fi
  say "Applying $name"
  { cat "$f"; printf "\ninsert into _tutorhub.migrations (name) values ('%s');\n" "$name"; } | PSQL -q --single-transaction -f - >/dev/null
  applied=$((applied + 1))
done

# Same defaults as supabase.com: the API roles may touch public objects, and row level security decides what they see
PSQL -q >/dev/null <<'SQL'
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
notify pgrst, 'reload schema';
SQL

say "Migrations done ($applied new)."
