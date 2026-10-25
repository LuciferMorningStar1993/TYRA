-- 4. Permisos previstos sobre TODOS los objetos nuevos, para anon y authenticated.
--    Cada fila compara el permiso real con el esperado: todas deben tener ok = true.
with expected(objeto, rol, permiso, esperado) as (
  values
    -- weight_entries: authenticated lee y elimina a nivel de tabla; inserta/corrige solo columnas (abajo).
    ('public.weight_entries', 'authenticated', 'SELECT', true),
    ('public.weight_entries', 'authenticated', 'INSERT', false),
    ('public.weight_entries', 'authenticated', 'UPDATE', false),
    ('public.weight_entries', 'authenticated', 'DELETE', true),
    ('public.weight_entries', 'authenticated', 'TRUNCATE', false),
    -- Auditoría: solo lectura.
    ('public.weight_entry_audit', 'authenticated', 'SELECT', true),
    ('public.weight_entry_audit', 'authenticated', 'INSERT', false),
    ('public.weight_entry_audit', 'authenticated', 'UPDATE', false),
    ('public.weight_entry_audit', 'authenticated', 'DELETE', false),
    -- Tablas de transición: sin acceso desde la app.
    ('public.weight_legacy_imports', 'authenticated', 'SELECT', false),
    ('public.weight_legacy_imports', 'authenticated', 'INSERT', false),
    ('public.weight_legacy_imports', 'authenticated', 'UPDATE', false),
    ('public.weight_legacy_imports', 'authenticated', 'DELETE', false),
    ('public.weight_legacy_client_writes', 'authenticated', 'SELECT', false),
    ('public.weight_legacy_client_writes', 'authenticated', 'INSERT', false),
    ('public.weight_legacy_client_writes', 'authenticated', 'UPDATE', false),
    ('public.weight_legacy_client_writes', 'authenticated', 'DELETE', false),
    -- Vista de resúmenes: solo lectura (security_invoker aplica la RLS de weight_entries).
    ('public.weight_monthly_summaries', 'authenticated', 'SELECT', true),
    ('public.weight_monthly_summaries', 'authenticated', 'INSERT', false),
    -- anon: nada en ningún objeto nuevo.
    ('public.weight_entries', 'anon', 'SELECT', false),
    ('public.weight_entries', 'anon', 'INSERT', false),
    ('public.weight_entries', 'anon', 'UPDATE', false),
    ('public.weight_entries', 'anon', 'DELETE', false),
    ('public.weight_entry_audit', 'anon', 'SELECT', false),
    ('public.weight_legacy_imports', 'anon', 'SELECT', false),
    ('public.weight_legacy_client_writes', 'anon', 'SELECT', false),
    ('public.weight_monthly_summaries', 'anon', 'SELECT', false)
)
select objeto, rol, permiso, esperado,
  has_table_privilege(rol, objeto, permiso) as real,
  has_table_privilege(rol, objeto, permiso) = esperado as ok
from expected
order by ok, objeto, rol, permiso;
