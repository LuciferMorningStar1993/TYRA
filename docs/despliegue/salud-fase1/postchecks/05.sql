-- 4b. Privilegios por columna en weight_entries: authenticated solo inserta/corrige fecha y peso.
with expected(columna, permiso, esperado) as (
  select c, p, c in ('measured_on', 'weight_kg')
  from unnest(array['id', 'user_id', 'measured_on', 'weight_kg', 'origin', 'version', 'created_at', 'updated_at']) as c
  cross join unnest(array['INSERT', 'UPDATE']) as p
)
select columna, permiso, esperado,
  has_column_privilege('authenticated', 'public.weight_entries', columna, permiso) as real,
  has_column_privilege('authenticated', 'public.weight_entries', columna, permiso) = esperado as ok
from expected
order by ok, columna, permiso;
