#!/usr/bin/env node
// Meta de peso A TRAVÉS DE POSTGREST (no SQL directo), contra el Supabase LOCAL de TYRA (nunca remoto).
// Comprueba que creación duplicada, versión obsoleta y meta eliminada devuelven HTTP 409 con el
// mensaje esperado, en un tiempo acotado, SIN modificar datos y SIN que el servidor siga trabajando:
// tras cada 409 se mide en Postgres que no hay consultas activas de set_weight_goal y que el número de
// transacciones casi no sube (un timeout del cliente no demostraría que el servidor se detuvo).
// Crea UNA cuenta temporal propia (goal-api-<marca>@tyra.test) y la borra al final (finally).
// No imprime tokens ni contraseñas. Uso: npm run test:goals-api-local

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

const CONTAINER = 'supabase_db_TYRA';
const REQUEST_TIMEOUT_MS = 5000;
const QUIET_WINDOW_MS = 3000;
/** En reposo la base hace ~1 transacción/s; un bucle de reintentos hace miles. */
const MAX_TX_IN_QUIET_WINDOW = 40;

const status = JSON.parse(spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' }).stdout || '{}');
const running = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout.split('\n');
if (status.API_URL !== 'http://127.0.0.1:55321' || !/@127\.0\.0\.1:55322\//.test(status.DB_URL ?? '') || !running.includes(CONTAINER)) {
  console.error('[ABORTA] No es el Supabase local de TYRA (API 55321, base 55322, contenedor supabase_db_TYRA).');
  process.exit(2);
}
const url = status.API_URL;
const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASA ' : 'FALLA'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function sql(query) {
  const out = spawnSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-X', '-A', '-t', '-q'], {
    input: query,
    encoding: 'utf8',
  });
  if (out.status !== 0) throw new Error(`psql: ${out.stderr.trim()}`);
  return out.stdout.trim();
}

const transactions = () => Number(sql("select xact_commit + xact_rollback from pg_stat_database where datname = 'postgres';"));
const activeGoalQueries = () =>
  Number(sql("select count(*) from pg_stat_activity where state = 'active' and pid <> pg_backend_pid() and query ilike '%set_weight_goal%';"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tras una respuesta: el servidor no sigue trabajando (sin consultas activas y casi sin transacciones). */
async function serverIsQuiet(label) {
  const before = transactions();
  await sleep(QUIET_WINDOW_MS);
  const delta = transactions() - before;
  const active = activeGoalQueries();
  check(`${label}: el servidor queda en reposo`, active === 0 && delta <= MAX_TX_IN_QUIET_WINDOW, `${delta} transacciones en ${QUIET_WINDOW_MS / 1000} s, ${active} consultas activas`);
}

let accessToken = null;
async function rpc(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(`${url}/rest/v1/rpc/set_weight_goal`, {
      method: 'POST',
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await response.json().catch(() => ({}));
    return { status: response.status, body: json, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, body: { message: error.name === 'AbortError' ? 'timeout del cliente' : String(error) }, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

let userId = null;
const email = `goal-api-${Date.now()}-${randomBytes(2).toString('hex')}@tyra.test`;
const goalRow = async () => (await admin.from('weight_goals').select('id, target_weight_kg, version').eq('user_id', userId).maybeSingle()).data;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function expect409(label, body, message, before) {
  const result = await rpc(body);
  check(
    `${label}: HTTP 409 «${message}» en tiempo acotado`,
    result.status === 409 && result.body.message === message && result.body.code === 'PT409',
    `HTTP ${result.status}, ${result.body.code ?? '—'} «${result.body.message ?? ''}», ${result.ms} ms`,
  );
  check(`${label}: no modifica datos`, same(await goalRow(), before));
  await serverIsQuiet(label);
}

try {
  const password = `Pw${randomBytes(9).toString('hex')}9`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`no se pudo crear la cuenta temporal: ${created.error.code ?? created.error.message}`);
  userId = created.data.user.id;
  const profile = await admin.from('profiles').update({ birth_date: '1990-01-01' }).eq('id', userId).select('id');
  if (profile.error || profile.data.length !== 1) throw new Error('no se pudo preparar el perfil');
  const user = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await user.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error(`no se pudo iniciar sesión: ${login.error.code}`);
  accessToken = login.data.session.access_token;
  const measured = await user.from('weight_entries').insert({ measured_on: '2026-10-01', weight_kg: 72 }).select('id');
  if (measured.error) throw new Error(`no se pudo registrar la medición: ${measured.error.code}`);

  console.log(`Supabase local: ${url} · cuenta temporal creada\n`);
  await serverIsQuiet('0. Antes de empezar');

  const create = await rpc({ p_target_weight_kg: 68 });
  check('1. Crear la meta: HTTP 200', create.status === 200 && Boolean(create.body.id), `HTTP ${create.status}`);
  const first = await goalRow();
  await expect409('1. Creación duplicada', { p_target_weight_kg: 66 }, 'goal_conflict', first);

  const edit = await rpc({ p_target_weight_kg: 67, p_goal_id: first.id, p_expected_version: 1 });
  check('2. Editar con la versión leída: HTTP 200', edit.status === 200 && edit.body.version === 2, `HTTP ${edit.status}`);
  const edited = await goalRow();
  await expect409('2. Versión obsoleta', { p_target_weight_kg: 65, p_goal_id: first.id, p_expected_version: 1 }, 'goal_conflict', edited);

  const removed = await user.from('weight_goals').delete().eq('id', first.id).eq('version', 2).select('id');
  check('3. Eliminar con id y versión: 1 fila', !removed.error && removed.data.length === 1);
  await expect409('3. Editar la meta eliminada', { p_target_weight_kg: 64, p_goal_id: first.id, p_expected_version: 2 }, 'goal_missing', null);

  const recreate = await rpc({ p_target_weight_kg: 70 });
  check('4. Crear una meta nueva: HTTP 200 con otro id', recreate.status === 200 && recreate.body.id !== first.id, `HTTP ${recreate.status}`);
  const second = await goalRow();
  await expect409(
    '4. Reiniciar con el id de la eliminada (misma versión 1 que la nueva)',
    { p_target_weight_kg: 60, p_goal_id: first.id, p_expected_version: 1, p_reset_start: true },
    'goal_missing',
    second,
  );
} catch (error) {
  check('Prueba interrumpida por un error', false, error.message);
} finally {
  if (userId) {
    const { data } = await admin.auth.admin.getUserById(userId);
    if (data?.user?.email === email) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      console.log(deleted.error ? `FALLA  Limpieza: ${deleted.error.code ?? deleted.error.message}` : '\nLimpieza: cuenta temporal eliminada.');
      if (deleted.error) failures += 1;
    }
  }
}

console.log(failures === 0 ? 'Todo pasa.' : `${failures} verificación(es) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
