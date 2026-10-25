-- 4d. Vista con security_invoker (si no, ignoraría la RLS de quien consulta).
select c.relname, coalesce('security_invoker=true' = any (c.reloptions), false) as security_invoker
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'weight_monthly_summaries';
