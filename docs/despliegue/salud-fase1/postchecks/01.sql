-- 1. Conteos: deben ser IGUALES a los de prechecks.sql.
select
  (select count(*) from auth.users) as usuarios,
  (select count(*) from public.profiles) as perfiles,
  (select count(*) from public.profiles where weight_kg is not null) as perfiles_con_peso,
  (select count(*) from public.profiles where onboarded_at is not null) as perfiles_onboarded;
