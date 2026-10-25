-- 1. RLS y políticas de weight_goals: RLS activa, 2 políticas (ver y eliminar).
select c.relrowsecurity = true and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'weight_goals') = 2 as ok,
  c.relrowsecurity as rls,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'weight_goals') as politicas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'weight_goals';
