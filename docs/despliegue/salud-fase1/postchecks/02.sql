-- 2. Importación única: sin_importar = 0 y heredados_sin_fecha = perfiles_con_peso.
select
  (select count(*) from public.profiles p where p.weight_kg is not null
     and not exists (select 1 from public.weight_legacy_imports i where i.user_id = p.id)) as sin_importar,
  (select count(*) from public.weight_entries where origin = 'legacy_profile' and measured_on is null) as heredados_sin_fecha,
  (select count(*) from public.weight_legacy_imports) as importaciones,
  (select count(*) from public.weight_legacy_client_writes) as escrituras_antiguas,
  (select count(*) from public.weight_entry_audit) as auditoria;
