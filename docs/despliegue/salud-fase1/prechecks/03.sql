-- 2. Historial de migraciones remoto (debe terminar en 20261024080547).
select version from supabase_migrations.schema_migrations order by version;
