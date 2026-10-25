-- 3. Función: solo authenticated ejecuta set_weight_goal; es security definer con search_path fijo.
select
  has_function_privilege('authenticated', 'public.set_weight_goal(numeric,uuid,integer,boolean)', 'execute') as authenticated_ejecuta,
  has_function_privilege('anon', 'public.set_weight_goal(numeric,uuid,integer,boolean)', 'execute') as anon_ejecuta,
  p.prosecdef as security_definer,
  p.proconfig as configuracion,
  has_function_privilege('authenticated', 'public.set_weight_goal(numeric,uuid,integer,boolean)', 'execute')
    and not has_function_privilege('anon', 'public.set_weight_goal(numeric,uuid,integer,boolean)', 'execute')
    and p.prosecdef
    and 'search_path=""' = any (p.proconfig) as ok
from pg_proc p
where p.oid = 'public.set_weight_goal(numeric,uuid,integer,boolean)'::regprocedure;
