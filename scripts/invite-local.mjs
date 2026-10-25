#!/usr/bin/env node
// Invita a una persona en el Supabase LOCAL (QA). Nunca apunta al remoto.
// Uso: npm run invite:local -- correo@ejemplo.com [--name "Ana"] [--redirect http://localhost:8082/auth/callback]
//
// La clave de servicio se lee de `supabase status` en el momento: no se guarda, no se imprime y no
// existe en la app. En producción las invitaciones se hacen desde el Dashboard de Supabase
// (Authentication → Users → Invite), con aprobación (ver docs/email-confirmation.md).

import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { name: { type: 'string' }, redirect: { type: 'string' } },
});
const email = positionals[0];
const displayName = values.name;
const redirectTo = values.redirect ?? 'http://localhost:8082/auth/callback';

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: npm run invite:local -- correo@ejemplo.com [--name "Ana"] [--redirect <url de /auth/callback>]');
  process.exit(2);
}

const status = JSON.parse(spawnSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' }).stdout || '{}');
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(status.API_URL ?? '')) {
  console.error('[ABORTA] Supabase local no está corriendo o la URL no es local.');
  process.exit(2);
}

const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo,
  data: displayName ? { display_name: displayName } : undefined,
});
if (error) {
  console.error(`No se pudo invitar a ${email}: ${error.code ?? error.message}`);
  process.exit(1);
}
console.log(`Invitación enviada a ${email} (local). Revisa Mailpit: ${status.MAILPIT_URL ?? status.INBUCKET_URL}`);
