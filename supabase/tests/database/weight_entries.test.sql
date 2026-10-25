-- BORRADOR PARA REVISIÓN — NO EJECUTAR TODAVÍA. Destino: supabase/tests/database/weight_entries.test.sql.
-- Solo Supabase LOCAL (`npm run test:db`, con autorización). Todo se revierte al final, así que los
-- datos locales existentes no cambian; las aserciones filtran por los usuarios de prueba.
--
-- Usuarios:
--   A: tenía peso en el perfil (72.4) → peso heredado sin fecha.
--   D: tenía peso (65.0); elimina su heredado y la reimportación no lo recrea.
--   C: onboarding con la app VIEJA (UPDATE directo de profiles.weight_kg) después de la migración;
--      luego cambia el peso y vuelve al valor original.
--   B, E, F: onboarding con la app nueva (complete_onboarding).
begin;

create extension if not exists pgtap with schema extensions;

select plan(90);

insert into auth.users (id, instance_id, aud, role, email)
select ('00000000-0000-0000-0000-0000000000' || s)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', s || '@peso.test'
from unnest(array['0a', '0b', '0c', '0d', '0e', '0f']) as s;

-- Estado previo a la migración: A y D ya tenían peso en el perfil. Sin triggers (replica) para que
-- el trigger de compatibilidad no lo capture aquí; la importación se prueba abajo.
set local session_replication_role = replica;
update public.profiles set weight_kg = 72.4, onboarded_at = '2026-10-20 18:00:00+00'
  where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set weight_kg = 65.0, onboarded_at = '2026-10-19 18:00:00+00'
  where id = '00000000-0000-0000-0000-00000000000d';
set local session_replication_role = origin;

-- ── 1. Importación única y peso heredado sin fecha ─────────────────────────────
select is(public.import_profile_weights(), 2, 'importa A y D (B, C, E y F no tenían peso)');
select results_eq(
  $$select measured_on, weight_kg, origin from public.weight_entries where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values (null::date, 72.4::numeric(5,1), 'legacy_profile')$$,
  'el peso heredado se conserva SIN fecha de medición inventada');
select is((select count(*)::int from public.weight_legacy_imports where source = 'migration'
  and user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d')), 2,
  'cada importación queda registrada');
select is(public.import_profile_weights(), 0, 'repetir la importación no duplica');

delete from public.weight_entries where user_id = '00000000-0000-0000-0000-00000000000d';
select is(public.import_profile_weights(), 0, 'tras eliminar el heredado de D, la importación no lo recrea');
select is((select count(*)::int from public.weight_entries where user_id = '00000000-0000-0000-0000-00000000000d'), 0,
  'la medición eliminada no reaparece');

-- ── 2. Integridad ──────────────────────────────────────────────────────────────
select throws_ok($$insert into public.weight_entries (user_id, measured_on, weight_kg)
  values ('00000000-0000-0000-0000-00000000000f', '2026-10-01', 19.9)$$, '23514', null, 'peso < 20 kg rechazado');
select throws_ok($$insert into public.weight_entries (user_id, measured_on, weight_kg)
  values ('00000000-0000-0000-0000-00000000000f', '2026-10-01', 400.1)$$, '23514', null, 'peso > 400 kg rechazado');
select throws_ok($$insert into public.weight_entries (user_id, measured_on, weight_kg)
  values ('00000000-0000-0000-0000-00000000000f', current_date + 2, 70)$$, '23514', null, 'fecha futura rechazada');
select throws_ok($$insert into public.weight_entries (user_id, measured_on, weight_kg)
  values ('00000000-0000-0000-0000-00000000000f', null, 70)$$, '23514', null, 'una medición manual exige fecha');
select throws_ok($$insert into public.weight_entries (user_id, measured_on, weight_kg, origin)
  values ('00000000-0000-0000-0000-00000000000a', null, 70, 'legacy_profile')$$, '23505', null,
  'solo un peso sin fecha por usuario');
select throws_ok($$insert into public.weight_entries (user_id, measured_on, weight_kg, origin)
  values ('00000000-0000-0000-0000-00000000000f', '2026-10-01', 70, 'otro')$$, '23514', null, 'origen desconocido rechazado');

-- ── 3. Cliente antiguo (C): onboarding viejo escribe profiles.weight_kg ──────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select lives_ok($$update public.profiles set display_name = 'C', weight_kg = 80.0, onboarded_at = now()
  where id = '00000000-0000-0000-0000-00000000000c'$$, 'el onboarding de la app vieja sigue funcionando');
select results_eq($$select measured_on, weight_kg, origin from public.weight_entries$$,
  $$values (null::date, 80.0::numeric(5,1), 'legacy_profile')$$, 'su peso se captura como heredado, sin fecha');
-- Cambios sucesivos y vuelta al valor original.
update public.profiles set weight_kg = 81.0 where id = '00000000-0000-0000-0000-00000000000c';
update public.profiles set weight_kg = 80.0 where id = '00000000-0000-0000-0000-00000000000c';
select results_eq($$select weight_kg from public.weight_entries$$, $$values (80.0::numeric(5,1))$$,
  'los cambios sucesivos no se reimportan ni crean mediciones');
select throws_ok('select user_id from public.weight_legacy_client_writes', '42501', null,
  'C no ve el registro de escrituras antiguas');

reset role;
select results_eq($$select weight_kg, source from public.weight_legacy_imports
  where user_id = '00000000-0000-0000-0000-00000000000c'$$,
  $$values (80.0::numeric(5,1), 'legacy_client')$$, 'la importación única queda intacta');
select results_eq($$select last_weight_kg, write_count from public.weight_legacy_client_writes
  where user_id = '00000000-0000-0000-0000-00000000000c'$$,
  $$values (80.0::numeric(5,1), 3)$$,
  'registro aparte: última escritura y 3 cambios, aunque volvió al valor original');

-- ── 4. Como A: lecturas, registro, corrección y eliminación con versión ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is_empty('select month from public.weight_monthly_summaries', 'el heredado sin fecha no entra en resúmenes');
select is_empty('select id from public.weight_entries where measured_on is not null',
  'sin mediciones fechadas: el peso vigente es el heredado (consulta de respaldo)');
select results_eq('select weight_kg from public.weight_entries where measured_on is null',
  $$values (72.4::numeric(5,1))$$, 'consulta del peso heredado');

select lives_ok($$insert into public.weight_entries (measured_on, weight_kg) values ('2026-10-21', 72.0)$$,
  'A registra sin enviar user_id');
select lives_ok($$insert into public.weight_entries (measured_on, weight_kg) values ('2026-10-23', 71.6)$$,
  'A registra otro día');
select lives_ok($$insert into public.weight_entries (measured_on, weight_kg) values ('2026-10-22', 71.8)$$,
  'A registra una fecha anterior a la última');
select throws_ok($$insert into public.weight_entries (measured_on, weight_kg) values ('2026-10-23', 71.0)$$,
  '23505', null, 'duplicado: una medición por usuario y día');
select throws_ok($$update public.weight_entries set measured_on = '2026-10-23' where measured_on = '2026-10-22'$$,
  '23505', null, 'mover la fecha a un día ocupado se rechaza');

select throws_ok($$insert into public.weight_entries (user_id, measured_on, weight_kg)
  values ('00000000-0000-0000-0000-00000000000b', '2026-10-24', 70)$$, '42501', null, 'A no puede enviar user_id');
select throws_ok($$insert into public.weight_entries (measured_on, weight_kg, origin) values ('2026-10-24', 70, 'legacy_profile')$$,
  '42501', null, 'A no puede fijar origin');
select throws_ok($$update public.weight_entries set version = 99 where measured_on = '2026-10-21'$$,
  '42501', null, 'A no puede fijar version');

select results_eq($$select measured_on, weight_kg from public.weight_entries
  where measured_on is not null order by measured_on desc limit 1$$,
  $$values (date '2026-10-23', 71.6::numeric(5,1))$$, 'peso vigente = fechada más reciente (gana al heredado)');
select results_eq($$select measured_on from public.weight_entries
  where measured_on < '2026-10-23' order by measured_on desc limit 2$$,
  $$values (date '2026-10-22'), (date '2026-10-21')$$, 'historial: página siguiente con cursor por fecha');
select is((select entries from public.weight_monthly_summaries), 3, 'el resumen solo cuenta las fechadas');

-- Confirmar la fecha del heredado: pasa a contar en tendencias; queda auditado.
select lives_ok($$update public.weight_entries set measured_on = '2026-10-20' where measured_on is null$$,
  'A confirma la fecha de su peso heredado');
select results_eq($$select entries, first_weight_kg from public.weight_monthly_summaries$$,
  $$values (4, 72.4::numeric(5,1))$$, 'con fecha confirmada entra en el resumen');
select results_eq($$select old_measured_on, new_measured_on from public.weight_entry_audit$$,
  $$values (null::date, date '2026-10-20')$$, 'la confirmación queda auditada (antes sin fecha)');
select throws_ok($$update public.weight_entries set measured_on = null where measured_on = '2026-10-20'$$,
  '23514', null, 'una medición fechada no vuelve a quedar sin fecha');

-- Corrección con control de versión.
select isnt_empty($$update public.weight_entries set weight_kg = 71.4, measured_on = '2026-10-24'
  where measured_on = '2026-10-23' and version = 1 returning id$$, 'corrección con la versión leída');
select results_eq($$select version from public.weight_entries where measured_on = '2026-10-24'$$,
  $$values (2)$$, 'la versión sube con cada corrección');
select is_empty($$update public.weight_entries set weight_kg = 70.0
  where measured_on = '2026-10-24' and version = 1 returning id$$, 'corrección con versión vieja: 0 filas (conflicto)');
select results_eq($$select old_measured_on, old_weight_kg, old_version, new_measured_on, new_weight_kg
  from public.weight_entry_audit where action = 'correction' and old_measured_on = '2026-10-23'$$,
  $$values (date '2026-10-23', 71.6::numeric(5,1), 1, date '2026-10-24', 71.4::numeric(5,1))$$,
  'la auditoría guarda fecha, peso y versión anteriores');
update public.weight_entries set weight_kg = 71.4 where measured_on = '2026-10-24';
select results_eq($$select (select count(*)::int from public.weight_entry_audit), version
  from public.weight_entries where measured_on = '2026-10-24'$$,
  $$values (2, 2)$$, 'guardar sin cambios no se audita ni cambia la versión');
select is((select count(*)::int from public.weight_entries), 4, 'corregir no agrega mediciones');
select results_eq($$select entries, average_kg, last_weight_kg, change_kg from public.weight_monthly_summaries$$,
  $$values (4, 71.9::numeric, 71.4::numeric(5,1), -1.0::numeric)$$,
  'el resumen usa solo valores vigentes (sin la versión corregida)');

-- Eliminación con control de versión.
select is_empty($$delete from public.weight_entries where measured_on = '2026-10-24' and version = 1 returning id$$,
  'eliminar con versión vieja: 0 filas (conflicto)');
select isnt_empty($$delete from public.weight_entries where measured_on = '2026-10-24' and version = 2 returning id$$,
  'eliminar con la versión leída');
select results_eq($$select measured_on from public.weight_entries
  where measured_on is not null order by measured_on desc limit 1$$,
  $$values (date '2026-10-22')$$, 'al eliminar la última, el vigente es la anterior');
select is((select entries from public.weight_monthly_summaries), 3, 'el resumen excluye la eliminada');

-- Consulta de correcciones de una medición (la app la ordena por changed_at desc, id desc).
select results_eq($$select action from public.weight_entry_audit
  where entry_id = (select entry_id from public.weight_entry_audit where action = 'deletion')
  order by changed_at, id$$,
  $$values ('correction'), ('deletion')$$, 'historial de correcciones y eliminación de una medición');

-- Auditoría y registro de importación: solo lectura / sin acceso.
select throws_ok($$insert into public.weight_entry_audit (entry_id, user_id, action, old_weight_kg, old_version)
  values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'deletion', 70, 1)$$,
  '42501', null, 'A no puede escribir auditoría');
select throws_ok('delete from public.weight_entry_audit', '42501', null, 'A no puede borrar su auditoría');
select throws_ok('select public.purge_weight_entry_audit()', '42501', null, 'A no puede ejecutar la purga');
select throws_ok('select user_id from public.weight_legacy_imports', '42501', null, 'A no ve el registro de importación');
select throws_ok('select public.import_profile_weights()', '42501', null, 'A no puede ejecutar la importación');

-- ── 5. Onboarding transaccional (app nueva) ─────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
-- Obligatorios: cada falta se rechaza antes de escribir.
select throws_ok($$select public.complete_onboarding(null, null, 'female', '1990-05-01', 165, 'light', 'maintain', null, 60.0, current_date)$$,
  '22023', 'missing_display_name', 'nombre nulo');
select throws_ok($$select public.complete_onboarding('   ', null, 'female', '1990-05-01', 165, 'light', 'maintain', null, 60.0, current_date)$$,
  '22023', 'missing_display_name', 'nombre vacío');
select throws_ok($$select public.complete_onboarding('B', null, null, '1990-05-01', 165, 'light', 'maintain', null, 60.0, current_date)$$,
  '22023', 'missing_sex', 'sexo nulo');
select throws_ok($$select public.complete_onboarding('B', null, 'female', null, 165, 'light', 'maintain', null, 60.0, current_date)$$,
  '22023', 'missing_birth_date', 'fecha de nacimiento nula');
select throws_ok($$select public.complete_onboarding('B', null, 'female', '1990-05-01', null, 'light', 'maintain', null, 60.0, current_date)$$,
  '22023', 'missing_height_cm', 'estatura nula');
select throws_ok($$select public.complete_onboarding('B', null, 'female', '1990-05-01', 165, null, 'maintain', null, 60.0, current_date)$$,
  '22023', 'missing_activity_level', 'actividad nula');
select throws_ok($$select public.complete_onboarding('B', null, 'female', '1990-05-01', 165, 'light', null, null, 60.0, current_date)$$,
  '22023', 'missing_goal', 'objetivo nulo');
select throws_ok($$select public.complete_onboarding('B', null, 'female', '1990-05-01', 165, 'light', 'maintain', null, null, current_date)$$,
  '22023', 'missing_weight_kg', 'peso nulo');
select throws_ok($$select public.complete_onboarding('B', null, 'female', '1990-05-01', 165, 'light', 'maintain', null, 60.0, null)$$,
  '22023', 'missing_measured_on', 'fecha de medición nula');
select results_eq($$select (select count(*)::int from public.weight_entries), onboarded_at is null, display_name is null
  from public.profiles$$,
  $$values (0, true, true)$$, 'tras los faltantes no queda medición, onboarding ni perfil parcial');
select throws_ok($$select public.complete_onboarding('B', null, 'female', '1990-05-01', 10, 'light', 'maintain', null, 60.0, current_date)$$,
  '23514', null, 'dato de perfil inválido: error');
select results_eq($$select (select count(*)::int from public.weight_entries), onboarded_at is null from public.profiles$$,
  $$values (0, true)$$, '…y no queda ni la medición ni el onboarding (todo o nada)');
select throws_ok($$select public.complete_onboarding('B', null, 'female', '1990-05-01', 165, 'light', 'maintain', null, 60.0, current_date - 3)$$,
  '22023', null, 'fecha de medición demasiado antigua para el onboarding');
select is(public.complete_onboarding('B', null, 'female', '1990-05-01', 165, 'light', 'maintain', 'aurora', 60.0, current_date),
  'completed', 'onboarding completo');
select results_eq($$select (select count(*)::int from public.weight_entries), onboarded_at is not null from public.profiles$$,
  $$values (1, true)$$, 'perfil y primera medición en la misma transacción');
select is(public.complete_onboarding('B', null, 'female', '1990-05-01', 165, 'light', 'maintain', 'aurora', 60.0, current_date),
  'already_completed', 'reintento tras respuesta perdida: no cambia nada');
select is((select count(*)::int from public.weight_entries), 1, '…y no duplica la medición');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}';
select is(public.complete_onboarding('E', null, 'male', '1985-01-01', 175, 'moderate', 'lose', null, 82.0, current_date - 1),
  'completed', 'reintento después de medianoche con la fecha del primer intento');
select results_eq('select measured_on from public.weight_entries', $$values (current_date - 1)$$,
  'la medición conserva el día original');

reset role;
insert into public.weight_entries (user_id, measured_on, weight_kg)
  values ('00000000-0000-0000-0000-00000000000f', current_date, 70.0);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000f","role":"authenticated"}';
select throws_ok($$select public.complete_onboarding('F', null, 'male', '1980-01-01', 180, 'light', 'gain', null, 75.0, current_date)$$,
  '23505', 'weight_day_conflict', 'conflicto con una medición existente del mismo día y otro peso');
select results_eq($$select onboarded_at is null from public.profiles$$, $$values (true)$$,
  '…el onboarding no se marca');
select is(public.complete_onboarding('F', null, 'male', '1980-01-01', 180, 'light', 'gain', null, 70.0, current_date),
  'completed', 'con el mismo peso reutiliza la medición existente');
select is((select count(*)::int from public.weight_entries), 1, '…sin duplicarla');

-- ── 6. Aislamiento (como B) ───────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select results_eq('select count(*)::int from public.weight_entries', $$values (1)$$, 'B solo ve su medición');
select is_empty('select id from public.weight_entry_audit', 'B no ve la auditoría de A');
select results_eq('select entries, change_kg from public.weight_monthly_summaries', $$values (1, null::numeric)$$,
  'B solo ve su resumen; con 1 medición no hay variación (insuficiente)');
select is_empty($$update public.weight_entries set weight_kg = 99
  where user_id = '00000000-0000-0000-0000-00000000000a' returning id$$, 'B no corrige mediciones de A');
select is_empty($$delete from public.weight_entries
  where user_id = '00000000-0000-0000-0000-00000000000a' returning id$$, 'B no elimina mediciones de A');

-- ── 7. anon ───────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select throws_ok('select id from public.weight_entries', '42501', null, 'anon no accede a mediciones');
select throws_ok($$select public.complete_onboarding('x', null, 'male', '1980-01-01', 180, 'light', 'gain', null, 70.0, current_date)$$,
  '42501', null, 'anon no ejecuta el onboarding');

-- ── 8. Retención: vence la auditoría, permanecen las mediciones ──────────────────
reset role;
update public.weight_entry_audit set changed_at = now() - interval '181 days'
  where action = 'correction' and user_id = '00000000-0000-0000-0000-00000000000a';
select is(public.purge_weight_entry_audit(), 2, 'la purga borra la auditoría de más de 180 días');
select is((select count(*)::int from public.weight_entry_audit where user_id = '00000000-0000-0000-0000-00000000000a'), 1,
  'la auditoría reciente de A (su eliminación) se conserva');
select is((select count(*)::int from public.weight_entries where user_id = '00000000-0000-0000-0000-00000000000a'), 3,
  'las mediciones vigentes no vencen');

-- ── 9. Borrado de cuenta ──────────────────────────────────────────────────────
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.weight_entries where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'borrar la cuenta borra sus mediciones');
select is((select count(*)::int from public.weight_entry_audit where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'borrar la cuenta borra su auditoría y no genera nueva');
select is((select count(*)::int from public.weight_legacy_imports where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'borrar la cuenta borra su registro de importación');
select is((select count(*)::int from public.weight_entries where user_id = '00000000-0000-0000-0000-00000000000b'), 1,
  'las mediciones de B no cambian');

select * from finish();
rollback;
