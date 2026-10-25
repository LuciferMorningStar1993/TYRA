-- ⚠️ DESTRUCTIVO Y EXCEPCIONAL. SOLO SUPABASE LOCAL DE TYRA. Elimina las tablas de Salud y sus datos.
-- La recuperación normal conserva esquema y datos y corrige hacia adelante; esto solo con aprobación.
-- No toca profiles.weight_kg (la migración A nunca la modifica), así que los pesos originales siguen ahí.
-- Se pierden solo los datos creados en las tablas nuevas durante la prueba local.
-- Reemplaza <TIMESTAMP> por la versión de la migración (nombre del archivo en supabase/migrations/).
begin;

select cron.unschedule('purge-weight-entry-audit')
where exists (select 1 from cron.job where jobname = 'purge-weight-entry-audit');

drop trigger if exists profiles_capture_legacy_weight on public.profiles;
drop function if exists public.complete_onboarding(text, text, text, date, numeric, text, text, text, numeric, date);
drop function if exists public.capture_legacy_profile_weight();
drop function if exists public.import_profile_weights();
drop function if exists public.import_legacy_profile_weight(uuid, numeric, text);
drop function if exists public.purge_weight_entry_audit(interval);
drop view if exists public.weight_monthly_summaries;
drop table if exists public.weight_legacy_client_writes;
drop table if exists public.weight_legacy_imports;
drop table if exists public.weight_entry_audit;
drop table if exists public.weight_entries;
drop function if exists public.audit_weight_entry();
drop function if exists public.weight_entries_before_update();
comment on column public.profiles.weight_kg is null;

delete from supabase_migrations.schema_migrations where version = '<TIMESTAMP>';

commit;
-- pg_cron queda instalado si no lo estaba antes (inofensivo). Para quitarlo: drop extension pg_cron;
-- solo si la comprobación previa (paso 2 del procedimiento) indicaba que no estaba instalado.
