-- 4c. Funciones: solo complete_onboarding es ejecutable por authenticated; anon no ejecuta ninguna.
with expected(funcion, rol, esperado) as (
  values
    ('public.complete_onboarding(text,text,text,date,numeric,text,text,text,numeric,date)', 'authenticated', true),
    ('public.complete_onboarding(text,text,text,date,numeric,text,text,text,numeric,date)', 'anon', false),
    ('public.purge_weight_entry_audit(interval)', 'authenticated', false),
    ('public.purge_weight_entry_audit(interval)', 'anon', false),
    ('public.import_profile_weights()', 'authenticated', false),
    ('public.import_legacy_profile_weight(uuid,numeric,text)', 'authenticated', false),
    ('public.capture_legacy_profile_weight()', 'authenticated', false),
    ('public.audit_weight_entry()', 'authenticated', false)
)
select funcion, rol, esperado,
  has_function_privilege(rol, funcion, 'execute') as real,
  has_function_privilege(rol, funcion, 'execute') = esperado as ok
from expected
order by ok, funcion, rol;
