-- Aislamiento RLS de public.profiles entre dos usuarios.
-- Solo para la base LOCAL (Docker): `supabase start` y luego `npm run test:db`.
-- Todo corre dentro de una transacción que se revierte al final.
begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- Dos usuarios; el trigger handle_new_user crea su perfil.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'a@rls.test', '{"display_name":"A","phone":"+525500000001"}'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'b@rls.test', '{"display_name":"B"}');

select is(
  (select count(*) from public.profiles where id in (
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  2::bigint,
  'el trigger crea un perfil por usuario');

-- Actuar como el usuario A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select results_eq(
  'select id from public.profiles',
  $$values ('00000000-0000-0000-0000-00000000000a'::uuid)$$,
  'A solo ve su propio perfil');

select is_empty(
  $$select id from public.profiles where phone is not null and id <> '00000000-0000-0000-0000-00000000000a'$$,
  'A no puede buscar teléfonos de otros usuarios');

select isnt_empty(
  $$update public.profiles set display_name = 'A editado'
    where id = '00000000-0000-0000-0000-00000000000a' returning id$$,
  'A puede actualizar su perfil (update devuelve la fila)');

select is_empty(
  $$update public.profiles set display_name = 'hackeado'
    where id = '00000000-0000-0000-0000-00000000000b' returning id$$,
  'A no puede actualizar el perfil de B (0 filas)');

select is_empty(
  $$delete from public.profiles where id = '00000000-0000-0000-0000-00000000000a' returning id$$,
  'no hay política de borrado: A no puede borrar ni su perfil');

select throws_ok(
  $$insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000cc')$$,
  '42501',
  null,
  'no hay política de inserción para usuarios');

select throws_ok(
  $$update public.profiles set id = '00000000-0000-0000-0000-00000000000b'
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  'A no puede reasignar su perfil al id de B (with check)');

-- Sin sesión (rol anon) no se ve nada.
reset role;
set local role anon;
select is_empty('select id from public.profiles', 'anon no ve perfiles');

-- Verificación final como superusuario: B quedó intacto.
reset role;
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'B',
  'el perfil de B no cambió');

select * from finish();
rollback;
