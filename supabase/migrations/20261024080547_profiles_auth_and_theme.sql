-- Datos de registro (teléfono, género) y preferencias de apariencia en el perfil.

alter table public.profiles
  add column phone text unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column gender text check (gender in ('female', 'male', 'other', 'unspecified')),
  add column theme_palette text check (theme_palette in ('aurora', 'nordic', 'indigo')),
  add column color_mode text check (color_mode in ('system', 'light', 'dark'));

comment on column public.profiles.phone is 'Teléfono E.164; permite iniciar sesión con teléfono + contraseña';
comment on column public.profiles.gender is 'Género opcional; solo sugiere la paleta inicial';
comment on column public.profiles.sex is 'Sexo biológico para el cálculo metabólico';

-- El perfil se crea con los datos del formulario de registro (o de Google).
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
