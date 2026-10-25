-- Comprobaciones PREVIAS en el Supabase remoto de TYRA. SOLO LECTURA (únicamente SELECT).
-- Uso: supabase db query --linked -f docs/despliegue/salud-fase1/prechecks.sql
-- Guardar la salida: los conteos se comparan con los de postchecks.sql.

select current_database() as base, now() as consultado;

-- 1. Conteos que la migración A no debe cambiar.
select
  (select count(*) from auth.users) as usuarios,
  (select count(*) from public.profiles) as perfiles,
  (select count(*) from public.profiles where weight_kg is not null) as perfiles_con_peso,
  (select count(*) from public.profiles where onboarded_at is not null) as perfiles_onboarded;

-- 2. Historial de migraciones remoto (debe terminar en 20261024080547).
select version from supabase_migrations.schema_migrations order by version;

-- 3. Los objetos nuevos aún no existen (si alguno existe, DETENERSE y revisar).
select
  to_regclass('public.weight_entries') as weight_entries,
  to_regclass('public.weight_entry_audit') as weight_entry_audit,
  to_regclass('public.weight_legacy_imports') as weight_legacy_imports,
  to_regclass('public.weight_legacy_client_writes') as weight_legacy_client_writes,
  to_regclass('public.weight_monthly_summaries') as weight_monthly_summaries,
  to_regprocedure('public.complete_onboarding(text,text,text,date,numeric,text,text,text,numeric,date)') as complete_onboarding;

-- 4. Dependencias: función de updated_at y pg_cron disponible.
select to_regprocedure('public.set_updated_at()') as set_updated_at;
select name, default_version, installed_version from pg_available_extensions where name = 'pg_cron';

-- 5. Perfiles con peso: el valor que se importará como heredado (sin fecha). No incluye datos personales.
select count(*) filter (where weight_kg not between 20 and 400) as pesos_fuera_de_rango
from public.profiles where weight_kg is not null;
