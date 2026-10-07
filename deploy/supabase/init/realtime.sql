-- Runs once when the database is first created: the schema Realtime keeps its own tables in.
create schema if not exists _realtime;
alter schema _realtime owner to supabase_admin;
