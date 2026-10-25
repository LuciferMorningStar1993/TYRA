-- 2. Permisos de tabla: authenticated solo lee y elimina; nunca inserta ni actualiza; anon nada.
with expected(rol, permiso, esperado) as (
  values
    ('authenticated', 'SELECT', true),
    ('authenticated', 'INSERT', false),
    ('authenticated', 'UPDATE', false),
    ('authenticated', 'DELETE', true),
    ('authenticated', 'TRUNCATE', false),
    ('anon', 'SELECT', false),
    ('anon', 'INSERT', false),
    ('anon', 'UPDATE', false),
    ('anon', 'DELETE', false)
)
select rol, permiso, esperado,
  has_table_privilege(rol, 'public.weight_goals', permiso) as real,
  has_table_privilege(rol, 'public.weight_goals', permiso) = esperado as ok
from expected
order by ok, rol, permiso;
