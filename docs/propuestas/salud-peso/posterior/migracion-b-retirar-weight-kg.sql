-- BORRADOR — ENTREGA POSTERIOR, FUERA DE LA ENTREGA INICIAL. NO APLICAR.
-- Retira profiles.weight_kg cuando ya ningún cliente antiguo la use.
--
-- Requisitos previos (operativos, con aprobación):
--   1. EAS Update con la app nueva confirmado en los 4 dispositivos.
--   2. Al menos 14 días sin escrituras de clientes antiguos (comprobación b).
--
-- Las comprobaciones son ejecutables: si alguna falla, la migración aborta sin cambiar nada.
do $$
declare
  v_missing int;
  v_recent int;
  v_unreviewed int;
begin
  -- a) Ningún peso del perfil quedó sin importar. El registro existe aunque la medición se haya
  --    eliminado después (decisión de la persona, no una pérdida).
  select count(*) into v_missing
  from public.profiles p
  where p.weight_kg is not null
    and not exists (select 1 from public.weight_legacy_imports i where i.user_id = p.id);
  if v_missing > 0 then
    raise exception 'retirar weight_kg: % perfiles con peso sin importar; ejecuta public.import_profile_weights()', v_missing;
  end if;

  -- b) Ningún cliente antiguo escribió la columna en los últimos 14 días (registro separado de
  --    escrituras: cuenta cualquier cambio, aunque haya vuelto al valor original).
  select count(*) into v_recent
  from public.weight_legacy_client_writes
  where last_written_at > now() - interval '14 days';
  if v_recent > 0 then
    raise exception 'retirar weight_kg: % usuarios con escrituras de clientes antiguos en los últimos 14 días', v_recent;
  end if;

  -- c) Ninguna última escritura antigua quedó sin revisar: si su valor final difiere del importado,
  --    ese peso no está en weight_entries y alguien debe decidir qué hacer con él.
  select count(*) into v_unreviewed
  from public.weight_legacy_client_writes w
  left join public.weight_legacy_imports i on i.user_id = w.user_id
  where w.last_weight_kg is not null
    and w.last_weight_kg is distinct from i.weight_kg;
  if v_unreviewed > 0 then
    raise exception 'retirar weight_kg: % usuarios con un último peso antiguo distinto del importado; revisar antes de borrar', v_unreviewed;
  end if;
end;
$$;

drop trigger profiles_capture_legacy_weight on public.profiles;
drop function public.capture_legacy_profile_weight();
drop function public.import_profile_weights();
drop function public.import_legacy_profile_weight(uuid, numeric, text);
alter table public.profiles drop column weight_kg;
-- Las tablas de transición dejan de ser necesarias; se eliminan para no conservar pesos
-- heredados duplicados fuera de weight_entries.
drop table public.weight_legacy_client_writes;
drop table public.weight_legacy_imports;
