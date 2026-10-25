#!/usr/bin/env node
// Regresión de Auth contra Supabase LOCAL (nunca remoto). Uso: supabase start && npm run test:auth-local
//
// Caso: A crea una cuenta con el correo de B (sin confirmar) y una contraseña que conoce A.
// B pide recuperación, verifica el enlace o el código y abandona antes de cambiar la contraseña.
// Criterio: esa recuperación incompleta NO debe habilitar la contraseña de A, ni por correo ni por
// el alias de teléfono. Además, controles positivos para no romper los flujos legítimos.
// No imprime tokens ni contraseñas. Sale con código 1 si algún criterio falla o si no pudo limpiar.
// Limpieza: registra las cuentas que crea esta ejecución y las borra al final (finally), aunque
// falle una prueba. Solo borra cuentas cuyo correo generó esta misma ejecución.
//
// Se adapta a la política de registro del Supabase local (/auth/v1/settings → disable_signup):
// - Registro abierto: la cuenta pendiente la crea A con signUp (contraseña elegida por A).
// - Registro cerrado por invitación: la cuenta pendiente es una invitación sin aceptar, y A intenta
//   lo mismo por la API (registrar el correo con su contraseña). Los criterios son los mismos.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

const status = JSON.parse(spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' }).stdout || '{}');
const url = status.API_URL;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url ?? '')) {
  console.error('[ABORTA] Supabase local no está corriendo o la URL no es local:', url);
  process.exit(2);
}
const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
const mailpit = (status.MAILPIT_URL ?? status.INBUCKET_URL ?? '').replace(/\/$/, '');
const REDIRECT = 'http://localhost:8082/auth/callback';
const EMAIL_INTERVAL_MS = 61_000; // max_frequency = 1 min por usuario

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};
// Igual que la app: PKCE + sb_flow_id.
const appClient = () =>
  createClient(url, publishableKey, {
    auth: { storage: memoryStorage(), persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce', experimental: { appendPkceFlowIdToRedirects: true } },
  });
const plainClient = () => createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const secret = () => `Pw${randomBytes(6).toString('hex')}9`;
// Cuentas de ESTA ejecución: IDs devueltos al crearlas y correos generados (por si una prueba
// fallida crea una cuenta inesperada). Solo esas se borran al final.
const createdIds = new Set();
const generatedEmails = new Set();
const track = (id) => {
  if (id) createdIds.add(id);
  return id;
};
const uniqueEmail = (tag) => {
  const email = `${tag}-${Date.now()}-${randomBytes(2).toString('hex')}@tyra.test`;
  generatedEmails.add(email);
  return email;
};
const uniquePhone = () => `+52559${String(randomBytes(4).readUInt32BE() % 10_000_000).padStart(7, '0')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASA ' : 'FALLA'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function latestLink(email, type) {
  await sleep(1200);
  const search = await (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
  for (const message of search.messages ?? []) {
    const full = await (await fetch(`${mailpit}/api/v1/message/${message.ID}`)).json();
    const link = full.HTML?.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    if (link?.includes(`type=${type}`)) return link;
  }
  return null;
}

async function emailLoginWorks(email, password) {
  const { error } = await plainClient().auth.signInWithPassword({ email, password });
  return { works: !error, code: error?.code ?? 'ok' };
}

async function phoneLoginWorks(phone, password) {
  const response = await fetch(`${url}/functions/v1/phone-login`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const body = await response.json().catch(() => ({}));
  return { works: response.status === 200, code: `${response.status} ${body.error ?? body.code ?? ''}`.trim() };
}

async function hasUsablePassword(userId) {
  const sql = `select encrypted_password <> '' from auth.users where id = '${userId}';`;
  const out = spawnSync('docker', ['exec', '-i', status.DB_CONTAINER ?? 'supabase_db_TYRA', 'psql', '-U', 'postgres', '-At'], {
    input: sql,
    encoding: 'utf8',
  }).stdout.trim();
  return out === 't';
}

/** ¿El hash guardado corresponde a esa contraseña? (crypt en la base; la contraseña va por stdin, no se imprime). */
async function storedPasswordMatches(userId, password) {
  const literal = password.replace(/'/g, "''");
  const sql = `select encrypted_password <> '' and encrypted_password = extensions.crypt('${literal}', encrypted_password) from auth.users where id = '${userId}';`;
  const out = spawnSync('docker', ['exec', '-i', 'supabase_db_TYRA', 'psql', '-U', 'postgres', '-At'], { input: sql, encoding: 'utf8' });
  return out.stdout.trim() === 't';
}

async function emailConfirmed(userId) {
  return !!(await admin.auth.admin.getUserById(userId)).data.user?.email_confirmed_at;
}

const settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishableKey } })).json();
const signupClosed = settings.disable_signup === true;

/** Registro cerrado: invitación de un administrador (lo único que crea cuentas). */
async function invite(email) {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: REDIRECT });
  if (error) throw new Error(`No se pudo invitar (${email}): ${error.code ?? error.message}`);
  return track(data.user.id);
}

/** token_hash del enlace del correo de invitación (plantilla supabase/templates/invite.html). */
async function inviteTokenHash(email) {
  const link = await latestLink(email, 'invite');
  return link ? new URL(link.replace('tyra://', 'http://tyra/')).searchParams.get('token_hash') : null;
}

/** B acepta la invitación como la app: verifyOtp con token_hash (sesión, sin contraseña todavía). */
async function acceptInvite(email, tokenHash) {
  const client = appClient();
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash ?? (await inviteTokenHash(email)), type: 'invite' });
  return { client, ok: !error, code: error?.code ?? 'ok' };
}

/**
 * Cuenta pendiente con el correo de B en la que A intentó fijar SU contraseña y un alias de teléfono.
 * Abierto: la crea A con signUp. Cerrado: es una invitación sin aceptar y A intenta signUp igual.
 */
async function pendingAccount(tag) {
  if (!signupClosed) return attackerSignsUp(tag);
  const email = uniqueEmail(tag);
  const phone = uniquePhone();
  const passwordA = secret();
  const userId = await invite(email);
  const { error } = await appClient().auth.signUp({
    email,
    password: passwordA,
    options: { emailRedirectTo: REDIRECT, data: { display_name: 'A', phone } },
  });
  check(`${tag}: A NO puede registrar por la API un correo invitado`, !!error, error?.code ?? 'aceptado');
  check(`${tag}: la invitación sigue sin contraseña utilizable`, !(await hasUsablePassword(userId)));
  return { email, phone, passwordA, userId };
}

/** A registra el correo de B con su contraseña y un alias de teléfono. */
async function attackerSignsUp(tag) {
  const email = uniqueEmail(tag);
  const phone = uniquePhone();
  const passwordA = secret();
  const { data, error } = await appClient().auth.signUp({
    email,
    password: passwordA,
    options: { emailRedirectTo: REDIRECT, data: { display_name: 'A', phone } },
  });
  if (error || !data.user) throw new Error(`No se pudo crear la cuenta de A (${tag}): ${error?.code ?? error?.message}`);
  return { email, phone, passwordA, userId: track(data.user.id) };
}

async function attackerCannotLogIn(label, account) {
  const byEmail = await emailLoginWorks(account.email, account.passwordA);
  check(`${label}: A NO entra por correo`, !byEmail.works, byEmail.code);
  const byPhone = await phoneLoginWorks(account.phone, account.passwordA);
  check(`${label}: A NO entra por alias de teléfono`, !byPhone.works, byPhone.code);
}

// --- Casos de la toma de cuenta ------------------------------------------------------------

async function caseLinkVerifiedNoExchange() {
  const label = 'Enlace verificado, B nunca abre la app (otro navegador)';
  const account = await pendingAccount('enlace-sin-app');
  await sleep(EMAIL_INTERVAL_MS);
  await appClient().auth.resetPasswordForEmail(account.email, { redirectTo: REDIRECT });
  const link = await latestLink(account.email, 'recovery');
  await fetch(link, { redirect: 'manual' }); // verify en el servidor; sin intercambio PKCE
  console.log(`       (correo confirmado tras verificar: ${await emailConfirmed(account.userId)})`);
  await attackerCannotLogIn(label, account);
}

async function caseLinkExchangedThenAbandoned() {
  const label = 'Enlace verificado e intercambiado, B recarga/cierra sin cambiar la contraseña';
  const account = await pendingAccount('enlace-abandona');
  await sleep(EMAIL_INTERVAL_MS);
  const deviceB = appClient();
  await deviceB.auth.resetPasswordForEmail(account.email, { redirectTo: REDIRECT });
  const callback = new URL((await fetch(await latestLink(account.email, 'recovery'), { redirect: 'manual' })).headers.get('location'));
  const { error } = await deviceB.auth.exchangeCodeForSession(callback.searchParams.get('code'), {
    flowId: callback.searchParams.get('sb_flow_id'),
  });
  console.log(`       (sesión de recuperación de B: ${error ? 'no' : 'sí'}; B abandona sin fijar contraseña)`);
  await attackerCannotLogIn(label, account);
}

async function caseCodeVerifiedThenAbandoned() {
  const label = 'Código (OTP) verificado, B abandona sin cambiar la contraseña';
  const account = await pendingAccount('codigo-abandona');
  // generateLink entrega el código de un solo uso sin depender de la plantilla del correo.
  const { data, error: linkError } = await admin.auth.admin.generateLink({ type: 'recovery', email: account.email });
  if (linkError) {
    check(`${label}: obtener código`, false, linkError.message);
    return;
  }
  const { error } = await appClient().auth.verifyOtp({ email: account.email, token: data.properties.email_otp, type: 'recovery' });
  console.log(`       (verifyOtp de B: ${error ? `falla ${error.code}` : 'ok'}; correo confirmado: ${await emailConfirmed(account.userId)})`);
  await attackerCannotLogIn(label, account);
}

async function caseInviteVerifiedThenAbandoned() {
  const label = 'Invitación verificada, B abandona sin fijar contraseña';
  const account = await pendingAccount('invitacion-abandona');
  const { ok } = await acceptInvite(account.email);
  console.log(`       (sesión de B tras aceptar: ${ok ? 'sí' : 'no'}; correo confirmado: ${await emailConfirmed(account.userId)})`);
  // Al aceptar, GoTrue guarda un hash de una contraseña aleatoria del servidor (nadie la conoce):
  // el criterio es que NO sea la contraseña que eligió A.
  check(`${label}: la contraseña guardada no es la que eligió A`, !(await storedPasswordMatches(account.userId, account.passwordA)));
  await attackerCannotLogIn(label, account);
}

async function caseInviteReusedAndExpired() {
  const label = 'Invitación reutilizada o vencida';
  const reused = await pendingAccount('invitacion-reusada');
  const tokenHash = await inviteTokenHash(reused.email);
  const first = await acceptInvite(reused.email, tokenHash);
  const second = await acceptInvite(reused.email, tokenHash);
  check(`${label}: la primera aceptación funciona`, first.ok, first.code);
  check(`${label}: reutilizar el enlace falla`, !second.ok, second.code);

  const expired = await pendingAccount('invitacion-vencida');
  const expiredHash = await inviteTokenHash(expired.email);
  // Simula el vencimiento (otp_expiry = 1 h) retrasando el envío en la base LOCAL.
  spawnSync('docker', ['exec', '-i', 'supabase_db_TYRA', 'psql', '-U', 'postgres', '-q'], {
    input: `update auth.users set invited_at = now() - interval '2 hours', confirmation_sent_at = now() - interval '2 hours' where id = '${expired.userId}';
            update auth.one_time_tokens set created_at = now() - interval '2 hours' where user_id = '${expired.userId}';`,
    encoding: 'utf8',
  });
  const late = await acceptInvite(expired.email, expiredHash);
  check(`${label}: una invitación vencida falla`, !late.ok, late.code);
  check(`${label}: la cuenta vencida sigue sin contraseña`, !(await hasUsablePassword(expired.userId)));
}

async function caseInviteAbandonedThenRecovery() {
  const label = 'Invitación aceptada y abandonada; después recupera su contraseña';
  const account = await pendingAccount('abandona-recupera');
  const { ok } = await acceptInvite(account.email);
  check(`${label}: acepta la invitación`, ok);
  await sleep(EMAIL_INTERVAL_MS);
  const deviceB = appClient();
  await deviceB.auth.resetPasswordForEmail(account.email, { redirectTo: REDIRECT });
  const callback = new URL((await fetch(await latestLink(account.email, 'recovery'), { redirect: 'manual' })).headers.get('location'));
  await deviceB.auth.exchangeCodeForSession(callback.searchParams.get('code'), { flowId: callback.searchParams.get('sb_flow_id') });
  const passwordB = secret();
  const { error } = await deviceB.auth.updateUser({ password: passwordB });
  check(`${label}: fija su contraseña con la recuperación`, !error, error?.code ?? 'ok');
  const login = await emailLoginWorks(account.email, passwordB);
  check(`${label}: entra con ella`, login.works, login.code);
  await attackerCannotLogIn(label, account);
}

async function casePhoneAliasOwnership() {
  const label = 'Alias de teléfono: no viene del alta y solo lo fija el dueño';
  const email = uniqueEmail('alias');
  const phoneInMetadata = uniquePhone();
  const { data } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: REDIRECT, data: { phone: phoneInMetadata } });
  track(data?.user?.id);
  const { data: row } = await admin.from('profiles').select('phone').eq('id', data.user.id).single();
  check(`${label}: el teléfono de los metadatos del alta NO se copia`, row?.phone === null, String(row?.phone));

  const owner = await acceptInvite(email);
  const otherEmail = uniqueEmail('alias-otro');
  await invite(otherEmail);
  const other = await acceptInvite(otherEmail);
  const ownerPhone = uniquePhone();
  const own = await owner.client.from('profiles').update({ phone: ownerPhone }).eq('id', data.user.id).select('phone');
  check(`${label}: el dueño fija su alias`, !own.error && own.data?.length === 1, own.error?.code ?? `${own.data?.length} fila(s)`);
  const foreign = await other.client.from('profiles').update({ phone: uniquePhone() }).eq('id', data.user.id).select('phone');
  check(`${label}: otra persona NO puede cambiar ese alias (RLS)`, !foreign.error && foreign.data?.length === 0, foreign.error?.code ?? `${foreign.data?.length} fila(s)`);
  const otherId = (await other.client.auth.getUser()).data.user.id;
  const duplicate = await other.client.from('profiles').update({ phone: ownerPhone }).eq('id', otherId).select('phone');
  check(`${label}: un alias ya usado se rechaza`, !!duplicate.error, duplicate.error?.code ?? 'aceptado');
}

async function controlOwnerCompletesInviteAndPhoneAlias() {
  const label = 'Control: el dueño completa la invitación aunque A lo intentó antes; luego agrega su alias';
  const account = await pendingAccount('dueno-completa');
  const { client, ok } = await acceptInvite(account.email);
  const passwordB = secret();
  const { error } = await client.auth.updateUser({ password: passwordB });
  check(`${label}: B fija su contraseña tras verificar`, ok && !error, error?.code ?? (ok ? 'ok' : 'sin sesión'));
  const phoneB = uniquePhone();
  const { error: phoneError } = await client.from('profiles').update({ phone: phoneB }).eq('id', account.userId);
  check(`${label}: B agrega su alias de teléfono ya verificado`, !phoneError, phoneError?.code ?? 'ok');
  const byPhone = await phoneLoginWorks(phoneB, passwordB);
  check(`${label}: B entra por su alias`, byPhone.works, byPhone.code);
  await attackerCannotLogIn(label, account);
}

// --- Controles positivos (no romper flujos legítimos) --------------------------------------

async function controlRecoveryCompleted() {
  const label = 'Control: B completa la recuperación';
  const account = await pendingAccount('completa');
  await sleep(EMAIL_INTERVAL_MS);
  const deviceB = appClient();
  await deviceB.auth.resetPasswordForEmail(account.email, { redirectTo: REDIRECT });
  const callback = new URL((await fetch(await latestLink(account.email, 'recovery'), { redirect: 'manual' })).headers.get('location'));
  await deviceB.auth.exchangeCodeForSession(callback.searchParams.get('code'), { flowId: callback.searchParams.get('sb_flow_id') });
  const passwordB = secret();
  const { error } = await deviceB.auth.updateUser({ password: passwordB });
  check(`${label}: B puede fijar contraseña nueva`, !error, error?.code ?? 'ok');
  const b = await emailLoginWorks(account.email, passwordB);
  check(`${label}: B entra con la nueva`, b.works, b.code);
  await attackerCannotLogIn(label, account);
}

async function controlOwnSignupConfirmed() {
  const label = 'Control: registro propio confirmado con su enlace';
  const email = uniqueEmail('propio');
  const password = secret();
  const { data: signUpData, error: signUpError } = await appClient().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: REDIRECT },
  });
  track(signUpData?.user?.id);
  if (signupClosed) {
    // Con registro cerrado, el alta directa por la API (con o sin contraseña) se rechaza en el servidor.
    check(`${label}: con registro cerrado, signUp por la API se rechaza`, !!signUpError, signUpError?.code ?? 'aceptado');
    const otp = await appClient().auth.signInWithOtp({ email: uniqueEmail('propio-otp'), options: { shouldCreateUser: true } });
    check(`${label}: con registro cerrado, crear cuenta por código/enlace se rechaza`, !!otp.error, otp.error?.code ?? 'aceptado');
    return;
  }
  await fetch(await latestLink(email, 'signup'), { redirect: 'manual' });
  const login = await emailLoginWorks(email, password);
  check(`${label}: entra con su contraseña`, login.works, login.code);
}

async function controlOwnSignupWithPendingRecovery() {
  const label = 'Control: registro propio con recuperación pendiente, confirma con el enlace de registro';
  const email = uniqueEmail('propio-pendiente');
  const password = secret();
  if (signupClosed) {
    // Equivalente con invitación: el dueño la acepta aunque haya una recuperación pendiente.
    const userId = await invite(email);
    await admin.auth.admin.generateLink({ type: 'recovery', email });
    const { client, ok } = await acceptInvite(email);
    const { error } = await client.auth.updateUser({ password });
    check(`${label} (invitación): el dueño acepta y fija su contraseña`, ok && !error, error?.code ?? (ok ? 'ok' : 'sin sesión'));
    const login = await emailLoginWorks(email, password);
    check(`${label} (invitación): entra con su contraseña`, login.works, login.code);
    check(`${label} (invitación): contraseña utilizable solo tras verificar`, await hasUsablePassword(userId));
    return;
  }
  const { data: signUpData } = await appClient().auth.signUp({ email, password, options: { emailRedirectTo: REDIRECT } });
  track(signUpData?.user?.id);
  await admin.auth.admin.generateLink({ type: 'recovery', email }); // deja un token de recuperación pendiente
  await fetch(await latestLink(email, 'signup'), { redirect: 'manual' });
  const login = await emailLoginWorks(email, password);
  check(`${label}: entra con su contraseña`, login.works, login.code);
}

async function controlConfirmedUserAbandonsRecovery() {
  const label = 'Control: cuenta ya confirmada abandona una recuperación';
  const email = uniqueEmail('confirmada');
  const password = secret();
  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  track(created?.user?.id);
  const deviceB = appClient();
  await deviceB.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT });
  await fetch(await latestLink(email, 'recovery'), { redirect: 'manual' });
  const login = await emailLoginWorks(email, password);
  check(`${label}: su contraseña sigue funcionando`, login.works, login.code);
}

// --- Limpieza -------------------------------------------------------------------------------

/** IDs de las cuentas con correos generados por esta ejecución (consulta exacta en la base LOCAL). */
function idsForGeneratedEmails() {
  if (generatedEmails.size === 0) return [];
  // Los correos los genera este script (letras, dígitos, guiones y @tyra.test): no llevan comillas.
  const list = [...generatedEmails].map((email) => `'${email}'`).join(',');
  const out = spawnSync('docker', ['exec', '-i', 'supabase_db_TYRA', 'psql', '-U', 'postgres', '-At'], {
    input: `select id from auth.users where email in (${list});`,
    encoding: 'utf8',
  });
  if (out.status !== 0) throw new Error(`no se pudieron buscar las cuentas por correo (psql ${out.status})`);
  return out.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

/** Borra solo cuentas de esta ejecución. Devuelve true si no hubo fallos. */
async function cleanup() {
  const problems = [];
  let ids = [...createdIds];
  try {
    ids = [...new Set([...ids, ...idsForGeneratedEmails()])];
  } catch (error) {
    problems.push(error.message);
  }
  let deleted = 0;
  for (const id of ids) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error?.status === 404 || (!error && !data?.user)) continue; // ya no existe
    if (error) {
      problems.push(`${id}: ${error.code ?? error.message}`);
      continue;
    }
    if (!generatedEmails.has(data.user.email)) {
      problems.push(`${id}: no la creó esta ejecución; no se borra`);
      continue;
    }
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) problems.push(`${id}: ${result.error.code ?? result.error.message}`);
    else deleted += 1;
  }
  console.log(`Limpieza: ${deleted} cuenta(s) de esta ejecución eliminada(s).`);
  for (const problem of problems) console.log(`FALLA  Limpieza: ${problem}`);
  return problems.length === 0;
}

/** Ejecuta casos en paralelo y espera a TODOS (un error no deja casos creando cuentas tras la limpieza). */
async function runAll(cases) {
  const results = await Promise.allSettled(cases.map((run) => run()));
  for (const result of results) {
    if (result.status === 'rejected') {
      check('Caso interrumpido por un error', false, result.reason?.message ?? String(result.reason));
    }
  }
}

let interrupted = false;
process.once('SIGINT', async () => {
  interrupted = true;
  console.log('\nInterrumpida: limpiando las cuentas de esta ejecución…');
  const cleaned = await cleanup();
  process.exit(cleaned ? 130 : 1);
});

let cleaned = false;
try {
  console.log(`Supabase local: ${url} · registro ${signupClosed ? 'CERRADO (por invitación)' : 'ABIERTO'}\n`);
  await runAll([caseLinkVerifiedNoExchange, caseLinkExchangedThenAbandoned, caseCodeVerifiedThenAbandoned]);
  if (signupClosed) {
    await runAll([
      caseInviteVerifiedThenAbandoned,
      caseInviteReusedAndExpired,
      caseInviteAbandonedThenRecovery,
      casePhoneAliasOwnership,
      controlOwnerCompletesInviteAndPhoneAlias,
    ]);
  }
  await runAll([
    controlRecoveryCompleted,
    controlOwnSignupConfirmed,
    controlOwnSignupWithPendingRecovery,
    controlConfirmedUserAbandonsRecovery,
  ]);
  console.log('NO EJECUTADA  Google: requiere credenciales OAuth reales; se valida en R5 (ver docs/email-confirmation.md).');
} catch (error) {
  check('Regresión interrumpida por un error', false, error?.message ?? String(error));
} finally {
  if (!interrupted) cleaned = await cleanup();
}
if (!interrupted) {
  console.log(`\n${failures === 0 ? 'Todo pasa.' : `${failures} verificación(es) fallaron.`}${cleaned ? '' : ' La limpieza tuvo fallos.'}`);
  process.exit(failures === 0 && cleaned ? 0 : 1);
}
