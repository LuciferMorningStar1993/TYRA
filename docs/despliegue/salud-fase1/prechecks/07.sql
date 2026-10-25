-- 5. Perfiles con peso: el valor que se importará como heredado (sin fecha). No incluye datos personales.
select count(*) filter (where weight_kg not between 20 and 400) as pesos_fuera_de_rango
from public.profiles where weight_kg is not null;
