-- ⚠️ DESTRUCTIVO Y EXCEPCIONAL — NO ES LA RECUPERACIÓN NORMAL.
-- Elimina las tablas de Salud y TODOS sus datos (mediciones, auditoría, registros de importación).
-- La recuperación prevista conserva esquema y datos y corrige hacia adelante (plan, sección 6).
-- Solo se considera si no existe corrección hacia adelante, con aprobación explícita para este
-- archivo y tras verificar un respaldo de los datos nuevos. No toca profiles.weight_kg ni Auth.
-- Uso (solo con esa aprobación): supabase db query --linked -f docs/despliegue/salud-fase1/excepcional-destructivo-revertir-salud.sql
-- Una sola sentencia (bloque DO): `supabase db query` no admite varias, y el bloque es atómico.
do $revert$
begin
  if exists (select 1 from cron.job where jobname = 'purge-weight-entry-audit') then
    perform cron.unschedule('purge-weight-entry-audit');
  end if;

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
end;
$revert$;
-- pg_cron queda instalado (inofensivo).
