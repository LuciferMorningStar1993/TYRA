-- El alias de teléfono ya no se toma de los metadatos del alta: quien crea o inicia una invitación
-- (o cualquier llamada a la API) podría fijarlo antes de que el dueño verifique su correo.
-- El alias se agrega después, desde Perfil, con la sesión del dueño (RLS "el usuario edita su perfil").
-- Sigue siendo un alias NO verificado (ver docs/email-confirmation.md).
-- No toca filas existentes.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, display_name, gender, theme_palette)
  values (
    new.id,
    coalesce(meta ->> 'display_name', meta ->> 'full_name', meta ->> 'name'),
    nullif(meta ->> 'gender', ''),
    nullif(meta ->> 'theme_palette', '')
  );
  return new;
end;
$$;

comment on column public.profiles.phone is
  'Alias de inicio de sesión NO verificado (E.164). Solo lo fija el dueño desde Perfil tras verificar su correo.';
