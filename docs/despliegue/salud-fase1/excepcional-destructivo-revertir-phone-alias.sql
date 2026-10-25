-- ⚠️ EXCEPCIONAL — NO ES LA RECUPERACIÓN NORMAL. Revierte 20261025031703 (restaura handle_new_user de
-- 20261024080547) y borra su registro del historial. Solo con aprobación explícita para este archivo.
-- ATENCIÓN: esa versión vuelve a copiar el teléfono de los metadatos del alta (riesgo documentado en
-- docs/email-confirmation.md). Ejecutar solo con aprobación explícita.
-- Una sola sentencia (bloque DO): `supabase db query` no admite varias, y el bloque es atómico.
do $revert$
begin
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
end;
$revert$;
