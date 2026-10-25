-- 3. RLS activa en las 5 tablas nuevas y políticas esperadas (4 en weight_entries, 1 en la auditoría).
select c.relname, c.relrowsecurity as rls,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'weight_%' and c.relkind = 'r' order by 1;
