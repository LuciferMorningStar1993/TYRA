-- RECUPERACIÓN REMOTA de 20261025031703_phone_alias_after_verification (solo si se aprueba aplicarla
-- en la opción 1 del plan y hay que revertirla). Restaura handle_new_user de 20261024080547.
-- ATENCIÓN: esa versión vuelve a copiar el teléfono de los metadatos del alta (riesgo documentado en
-- docs/email-confirmation.md). Ejecutar solo con aprobación explícita.
begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, display_name, phone, gender, theme_palette)
  values (
    new.id,
    coalesce(meta ->> 'display_name', meta ->> 'full_name', meta ->> 'name'),
    nullif(meta ->> 'phone', ''),
    nullif(meta ->> 'gender', ''),
    nullif(meta ->> 'theme_palette', '')
  );
  return new;
end;
$$;

delete from supabase_migrations.schema_migrations where version = '20261025031703';

commit;
