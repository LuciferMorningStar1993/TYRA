-- RECUPERACIÓN REMOTA de la migración A (Salud). Ejecutar SOLO con aprobación explícita y después de
-- respaldar los datos nuevos (ver plan, sección «Recuperación»). No toca profiles.weight_kg ni Auth.
-- Uso: supabase db query --linked -f docs/despliegue/salud-fase1/rollback-remoto.sql
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

delete from supabase_migrations.schema_migrations where version = '20261025052742';

commit;
-- pg_cron queda instalado (inofensivo). Solo se quita si prechecks indicaba que no estaba instalado.
