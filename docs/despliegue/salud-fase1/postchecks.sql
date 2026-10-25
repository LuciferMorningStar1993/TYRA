-- Comprobaciones POSTERIORES a la migración A en el Supabase remoto. SOLO LECTURA.
-- Uso: supabase db query --linked -f docs/despliegue/salud-fase1/postchecks.sql

-- 1. Conteos: deben ser IGUALES a los de prechecks.sql.
select
  (select count(*) from auth.users) as usuarios,
  (select count(*) from public.profiles) as perfiles,
  (select count(*) from public.profiles where weight_kg is not null) as perfiles_con_peso,
  (select count(*) from public.profiles where onboarded_at is not null) as perfiles_onboarded;

-- 2. Importación única: sin_importar = 0 y heredados_sin_fecha = perfiles_con_peso.
select
  (select count(*) from public.profiles p where p.weight_kg is not null
     and not exists (select 1 from public.weight_legacy_imports i where i.user_id = p.id)) as sin_importar,
  (select count(*) from public.weight_entries where origin = 'legacy_profile' and measured_on is null) as heredados_sin_fecha,
  (select count(*) from public.weight_legacy_imports) as importaciones,
  (select count(*) from public.weight_legacy_client_writes) as escrituras_antiguas,
  (select count(*) from public.weight_entry_audit) as auditoria;

-- 3. RLS activa en las 5 tablas nuevas y políticas esperadas (4 en weight_entries, 1 en la auditoría).
select c.relname, c.relrowsecurity as rls,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'weight_%' and c.relkind = 'r' order by 1;

-- 4. anon sin privilegios sobre tablas, vista ni función de onboarding.
select
  has_table_privilege('anon', 'public.weight_entries', 'select') as anon_lee_mediciones,
  has_table_privilege('anon', 'public.weight_monthly_summaries', 'select') as anon_lee_resumenes,
  has_function_privilege('anon', 'public.complete_onboarding(text,text,text,date,numeric,text,text,text,numeric,date)', 'execute') as anon_onboarding,
  has_function_privilege('authenticated', 'public.purge_weight_entry_audit(interval)', 'execute') as auth_purga;
-- Esperado: todo false.

-- 5. Tarea de retención y migraciones.
select jobname, schedule, command from cron.job where jobname = 'purge-weight-entry-audit';
select version from supabase_migrations.schema_migrations order by version;
