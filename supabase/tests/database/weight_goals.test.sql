-- Meta de peso: elegibilidad, punto de partida del servidor, concurrencia por id + versión,
-- instantánea de la partida, aislamiento y cascada. Solo Supabase LOCAL (`npm run test:db`).
-- Todo se revierte al final; las aserciones filtran por los usuarios de prueba.
-- Usuarios: A (adulto con mediciones), B (adulto), M (17 años), N (adulto sin mediciones).
-- La concurrencia con sesiones simultáneas se prueba aparte: scripts/local-goal-concurrency.sh, y la
-- respuesta HTTP 409 sin reintentos a través de PostgREST: scripts/local-goal-api.mjs.
-- Los conflictos usan SQLSTATE PT409 (no 40001, que PostgREST reintenta).
begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

insert into auth.users (id, instance_id, aud, role, email)
select ('00000000-0000-0000-0000-0000000001' || s)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', s || '@meta.test'
from unnest(array['0a', '0b', '0c', '0d']) as s;
update public.profiles set birth_date = '1990-01-01' where id in (
  '00000000-0000-0000-0000-00000000010a', '00000000-0000-0000-0000-00000000010b', '00000000-0000-0000-0000-00000000010d');
update public.profiles set birth_date = current_date - interval '17 years'
  where id = '00000000-0000-0000-0000-00000000010c';
insert into public.weight_entries (user_id, measured_on, weight_kg) values
  ('00000000-0000-0000-0000-00000000010a', current_date - 20, 74.0),
  ('00000000-0000-0000-0000-00000000010a', current_date - 10, 72.4),
  ('00000000-0000-0000-0000-00000000010b', current_date - 5, 80.0),
  ('00000000-0000-0000-0000-00000000010c', current_date - 5, 55.0);

set local role authenticated;

-- ── Elegibilidad y requisitos ───────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000010c","role":"authenticated"}';
select throws_ok($$select public.set_weight_goal(50)$$, '22023', 'age_not_eligible', 'menor de 20: no puede fijar meta');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000010d","role":"authenticated"}';
select throws_ok($$select public.set_weight_goal(70)$$, '22023', 'no_dated_measurement', 'sin medición fechada: no hay punto de partida');

-- ── Crear; la app no escribe la tabla directamente ─────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000010a","role":"authenticated"}';
select throws_ok($$insert into public.weight_goals (user_id, target_weight_kg, start_weight_kg, start_measured_on, start_entry_version)
  values ('00000000-0000-0000-0000-00000000010a', 68, 99, current_date, 1)$$, '42501', null, 'la app no inserta directamente');
select throws_ok($$select public.set_weight_goal(19.9)$$, '23514', null, 'meta fuera de rango');
select results_eq($$select target_weight_kg, start_weight_kg, start_measured_on, version from public.set_weight_goal(68)$$,
  $$values (68.0::numeric(5,1), 72.4::numeric(5,1), current_date - 10, 1)$$,
  'crear: el punto de partida es la medición fechada vigente según el servidor');
select throws_ok($$select public.set_weight_goal(66)$$, 'PT409', 'goal_conflict', 'crear cuando ya existe: conflicto, no sobrescribe');
select throws_ok($$update public.weight_goals set target_weight_kg = 60$$, '42501', null, 'la app no edita directamente');
select throws_ok($$select public.set_weight_goal(66, (select id from public.weight_goals))$$, '22023', 'missing_version',
  'editar sin versión se rechaza');

-- ── Editar, reiniciar y versión ────────────────────────────────────────────────
select results_eq($$select target_weight_kg, start_weight_kg, version
  from public.set_weight_goal(67, (select id from public.weight_goals), 1)$$,
  $$values (67.0::numeric(5,1), 72.4::numeric(5,1), 2)$$, 'editar conserva el punto de partida y sube la versión');
select throws_ok($$select public.set_weight_goal(66, (select id from public.weight_goals), 1)$$, 'PT409', 'goal_conflict',
  'editar con versión vieja: conflicto');
select results_eq($$select version from public.set_weight_goal(67, (select id from public.weight_goals), 2)$$,
  $$values (2)$$, 'editar sin cambios no sube la versión');
insert into public.weight_entries (measured_on, weight_kg) values (current_date - 2, 71.0);
select results_eq($$select start_weight_kg, start_measured_on, version
  from public.set_weight_goal(67, (select id from public.weight_goals), 2, true)$$,
  $$values (71.0::numeric(5,1), current_date - 2, 3)$$, 'reiniciar toma la nueva medición vigente');

-- ── Instantánea del punto de partida ───────────────────────────────────────────
update public.weight_entries set weight_kg = 70.5 where measured_on = current_date - 2;
select results_eq($$select g.start_weight_kg, g.start_entry_version, e.version
  from public.weight_goals g join public.weight_entries e on e.id = g.start_entry_id$$,
  $$values (71.0::numeric(5,1), 1, 2)$$, 'corregir la medición de partida no cambia la instantánea (versión distinta)');
delete from public.weight_entries where measured_on = current_date - 2;
select results_eq($$select start_entry_id is null, start_weight_kg from public.weight_goals$$,
  $$values (true, 71.0::numeric(5,1))$$, 'eliminar la medición de partida deja la instantánea sin referencia');
select results_eq($$select max(measured_on) < (select start_measured_on from public.weight_goals) from public.weight_entries$$,
  $$values (true)$$, 'quedan solo mediciones anteriores al punto de partida');

-- ── Eliminar con id + versión; la meta eliminada no se recrea ──────────────────
select set_config('tyra.old_goal', (select id::text from public.weight_goals), true);
select is_empty($$delete from public.weight_goals where id = current_setting('tyra.old_goal')::uuid and version = 2 returning id$$,
  'eliminar con versión vieja: 0 filas');
select isnt_empty($$delete from public.weight_goals where id = current_setting('tyra.old_goal')::uuid and version = 3 returning id$$,
  'eliminar con id y versión leídos');
select throws_ok($$select public.set_weight_goal(65, current_setting('tyra.old_goal')::uuid, 3)$$, 'PT409', 'goal_missing',
  'editar la meta eliminada: no la recrea');
select is_empty('select id from public.weight_goals', 'la meta sigue eliminada');

-- Se crea una meta NUEVA (id distinto). Operaciones obsoletas de la anterior no la tocan.
select lives_ok($$select public.set_weight_goal(66)$$, 'crear de nuevo (intención explícita) funciona');
select isnt((select id from public.weight_goals), current_setting('tyra.old_goal')::uuid, 'la nueva meta tiene otro id');
select throws_ok($$select public.set_weight_goal(60, current_setting('tyra.old_goal')::uuid, 3)$$, 'PT409', 'goal_missing',
  'editar con id + versión de la meta eliminada: goal_missing aunque exista otra');
select throws_ok($$select public.set_weight_goal(60, current_setting('tyra.old_goal')::uuid, 1, true)$$, 'PT409', 'goal_missing',
  'reiniciar con id de la meta eliminada (aunque la versión coincida): goal_missing');
select is_empty($$delete from public.weight_goals where id = current_setting('tyra.old_goal')::uuid and version = 1 returning id$$,
  'eliminar con el id de la meta eliminada no borra la nueva (misma versión 1)');
select results_eq($$select target_weight_kg, version from public.weight_goals$$,
  $$values (66.0::numeric(5,1), 1)$$, 'la meta nueva sigue intacta');

select is((select position('40001' in prosrc) from pg_proc where proname = 'set_weight_goal'), 0,
  'la función no usa 40001 (PostgREST lo reintenta)');

-- ── Aislamiento ────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000010b","role":"authenticated"}';
select is_empty('select id from public.weight_goals', 'B no ve la meta de A');
select is_empty($$delete from public.weight_goals returning id$$, 'B no elimina la meta de A');
select lives_ok($$select public.set_weight_goal(78)$$, 'B crea su propia meta');
select results_eq($$select count(*)::int from public.weight_goals$$, $$values (1)$$, 'B solo ve la suya');

-- ── anon ───────────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select throws_ok('select id from public.weight_goals', '42501', null, 'anon no lee metas');
select throws_ok($$select public.set_weight_goal(70)$$, '42501', null, 'anon no ejecuta set_weight_goal');

-- ── Integridad y cascada (superusuario) ────────────────────────────────────────
reset role;
select throws_ok($$update public.weight_goals set version = 0 where user_id = '00000000-0000-0000-0000-00000000010b'$$,
  '23514', null, 'versión positiva');
delete from auth.users where id = '00000000-0000-0000-0000-00000000010a';
select is((select count(*)::int from public.weight_goals where user_id = '00000000-0000-0000-0000-00000000010a'), 0,
  'borrar la cuenta borra su meta');
select is((select count(*)::int from public.weight_goals where user_id = '00000000-0000-0000-0000-00000000010b'), 1,
  'la meta de B no cambia');

select * from finish();
rollback;
