import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import type { Gender, PaletteId } from '@/design/palettes';

import type { Identifier } from './identifier';
import { supabase, supabaseConfig } from './supabase';

// Cierra la ventana emergente de OAuth en web.
WebBrowser.maybeCompleteAuthSession();

type AuthResult = { error: string | null };

/** Espera entre correos de Auth (igual a `max_frequency` = 1 min en supabase/config.toml). */
export const AUTH_EMAIL_COOLDOWN_SECONDS = 60;

/** Registro cerrado: solo un administrador crea cuentas (invitación). */
export const INVITE_ONLY_MESSAGE =
  'TYRA es solo por invitación. Si recibiste una, ábrela desde tu correo o usa «Tengo un código de invitación».';

const EMAIL_NOT_CONFIRMED_MESSAGE = 'Aún no confirmas tu correo. Revisa tu bandeja o reenvía el enlace.';

/**
 * Único destino de los enlaces de Auth (confirmación de correo y Google): tyra://auth/callback
 * en development builds y http://localhost:<puerto>/auth/callback en web. Debe estar en
 * additional_redirect_urls de supabase/config.toml.
 */
export function authRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

function friendlyAuthError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (/invalid login credentials|invalid_credentials/i.test(message)) {
    return 'Correo, teléfono o contraseña incorrectos.';
  }
  if (/already registered|already exists/i.test(message)) {
    return 'Ya existe una cuenta con ese correo. Inicia sesión.';
  }
  if (/database error saving new user/i.test(message)) {
    return 'Ese teléfono ya está registrado en otra cuenta.';
  }
  if (/weak|password/i.test(message)) {
    return 'La contraseña es muy débil: usa 8+ caracteres con letras y números.';
  }
  if (/email not confirmed|email_not_confirmed/i.test(message)) return EMAIL_NOT_CONFIRMED_MESSAGE;
  if (/signups? (are )?not allowed|signup_disabled/i.test(message)) return INVITE_ONLY_MESSAGE;
  if (/rate limit|too many|security purposes/i.test(message)) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  }
  if (/network|fetch/i.test(message)) {
    return 'Sin conexión. Revisa tu internet.';
  }
  return fallback;
}

export type SignInResult = {
  error: string | null;
  /** El correo existe y la contraseña es correcta, pero falta confirmarlo. */
  needsEmailConfirmation?: boolean;
};

function isEmailNotConfirmed(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message ?? ''));
}

export async function signInWithPassword(identifier: Identifier, password: string): Promise<SignInResult> {
  if (identifier.kind === 'email') {
    const { error } = await supabase.auth.signInWithPassword({ email: identifier.email, password });
    if (isEmailNotConfirmed(error)) {
      return { error: EMAIL_NOT_CONFIRMED_MESSAGE, needsEmailConfirmation: true };
    }
    return { error: error ? friendlyAuthError(error.message, 'No pudimos iniciar sesión.') : null };
  }

  // Teléfono: la Edge Function resuelve el correo y devuelve la sesión.
  const { data, error } = await supabase.functions.invoke<{
    access_token: string;
    refresh_token: string;
  }>('phone-login', { body: { phone: identifier.phone, password } });
  if (error || !data) {
    const body = await readFunctionError(error);
    if (body === 'email_not_confirmed') {
      return {
        error: 'Aún no confirmas el correo de esta cuenta. Inicia sesión con tu correo para reenviar el enlace.',
        needsEmailConfirmation: true,
      };
    }
    return { error: 'Correo, teléfono o contraseña incorrectos.' };
  }
  const { error: sessionError } = await supabase.auth.setSession(data);
  return { error: sessionError ? 'No pudimos iniciar sesión.' : null };
}

/** Lee el campo `error` del cuerpo JSON de una respuesta de Edge Function con error. */
async function readFunctionError(error: unknown): Promise<string | null> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (typeof context?.json !== 'function') return null;
  try {
    const body = (await context.json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

export type SignUpInput = {
  displayName: string;
  email: string;
  phone: string | null;
  password: string;
  gender: Gender | null;
  palette: PaletteId;
};

export type SignUpResult =
  | { status: 'signed_in' }
  /** Hay que confirmar el correo. También se usa si el correo ya existía (no se revela). */
  | { status: 'check_email'; email: string }
  | { status: 'error'; error: string };

export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  // Los metadatos los copia el trigger handle_new_user a public.profiles.
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: authRedirectUrl(),
      data: {
        display_name: input.displayName,
        phone: input.phone,
        gender: input.gender,
        theme_palette: input.palette,
      },
    },
  });
  if (error) {
    return { status: 'error', error: friendlyAuthError(error.message, 'No pudimos crear tu cuenta.') };
  }
  // Con confirmación activa no hay sesión hasta abrir el enlace. Si el correo ya existía,
  // Supabase devuelve un usuario sin identidades y sin sesión: mostramos lo mismo para no revelarlo.
  if (!data.session) return { status: 'check_email', email: input.email };
  return { status: 'signed_in' };
}

export async function resendConfirmation(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  return { error: error ? friendlyAuthError(error.message, 'No pudimos reenviar el correo.') : null };
}

export type PasswordResetRequest = { status: 'sent' } | { status: 'network_error'; message: string };

/**
 * «Olvidé mi contraseña». La respuesta es siempre la misma exista o no la cuenta: Auth responde
 * 200 a correos desconocidos, y un límite de envío (429) solo ocurre para cuentas existentes, así
 * que mostrarlo revelaría que el correo tiene cuenta. Solo un fallo de red se informa aparte.
 * El verificador PKCE queda marcado como recuperación en ESTE dispositivo.
 */
export async function requestPasswordReset(email: string): Promise<PasswordResetRequest> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
  if (error && isNetworkError(error)) {
    return { status: 'network_error', message: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.' };
  }
  return { status: 'sent' };
}

function isNetworkError(error: { name?: string; status?: number; message?: string }): boolean {
  return error.name === 'AuthRetryableFetchError' || error.status === 0 || /network|failed to fetch/i.test(error.message ?? '');
}

export type PasswordUpdateResult =
  | { status: 'updated'; otherSessionsRevoked: boolean }
  | { status: 'error'; error: string };

/**
 * Fija la contraseña nueva en la sesión de recuperación y, como política explícita, cierra las
 * demás sesiones del usuario (scope 'others'): el dispositivo actual sigue dentro. Ver la sección
 * «Sesiones después del cambio» en docs/email-confirmation.md para lo que sigue vigente.
 */
export async function updatePassword(newPassword: string): Promise<PasswordUpdateResult> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    if (error.code === 'same_password') {
      return { status: 'error', error: 'La contraseña nueva debe ser distinta de la anterior.' };
    }
    if (error.code === 'session_not_found' || error.code === 'no_authorization' || error.status === 401) {
      return { status: 'error', error: 'Tu enlace de recuperación ya no es válido. Pide uno nuevo.' };
    }
    return { status: 'error', error: friendlyAuthError(error.message, 'No pudimos cambiar la contraseña.') };
  }
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' });
  return { status: 'updated', otherSessionsRevoked: !signOutError };
}

export type InviteAcceptance =
  | { status: 'accepted' }
  | { status: 'error'; reason: 'expired' | 'invalid' | 'network'; message: string };

/**
 * Acepta una invitación con el mecanismo soportado (`verifyOtp`, tipo `invite`): por el
 * `token_hash` del enlace o por correo + código. Verificar confirma el correo y crea la sesión;
 * la contraseña se crea DESPUÉS, en la pantalla «Crea tu contraseña». Se llama solo cuando la
 * persona pulsa «Aceptar invitación»: abrir el enlace no consume el token.
 */
export async function acceptInvite(
  input: { tokenHash: string } | { email: string; code: string },
): Promise<InviteAcceptance> {
  const { error } = await supabase.auth.verifyOtp(
    'tokenHash' in input
      ? { token_hash: input.tokenHash, type: 'invite' }
      : { email: input.email, token: input.code, type: 'invite' },
  );
  if (!error) return { status: 'accepted' };
  if (isNetworkError(error)) {
    return { status: 'error', reason: 'network', message: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.' };
  }
  if (error.code === 'otp_expired') {
    return {
      status: 'error',
      reason: 'expired',
      message: 'La invitación venció o ya se usó. Si ya la aceptaste, inicia sesión; si no, pide una nueva.',
    };
  }
  return { status: 'error', reason: 'invalid', message: 'El código o el enlace de invitación no son válidos.' };
}

async function isGoogleEnabled(): Promise<boolean> {
  try {
    // Mismo destino que el cliente (respeta el modo QA local).
    const response = await fetch(`${supabaseConfig.url}/auth/v1/settings`, {
      headers: { apikey: supabaseConfig.publishableKey },
    });
    const settings = (await response.json()) as { external?: { google?: boolean } };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}

/** Parámetros de un enlace de Auth: Supabase los manda en la query (?code=) o en el fragmento (#error=). */
export function parseAuthRedirect(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  for (const part of [query, hash]) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [key, value = ''] = pair.split('=');
      try {
        params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
      } catch {
        params[key] = value;
      }
    }
  }
  return params;
}

export type AuthRedirectResult =
  /** `recovery`: el verificador local era de «Olvidé mi contraseña» (no se infiere de la URL). */
  | { status: 'signed_in'; kind: 'recovery' | 'sign_in' }
  | { status: 'error'; reason: 'expired' | 'denied' | 'exchange_failed' | 'missing_code'; message: string };

/**
 * Completa un enlace de Auth (confirmación de correo, recuperación o Google) con PKCE: cambia el
 * `code` por una sesión. El verificador PKCE vive en el dispositivo donde se inició el flujo, y
 * auth-js indica con `redirectType` si ese flujo era de recuperación (y emite PASSWORD_RECOVERY).
 */
export async function completeAuthRedirect(url: string): Promise<AuthRedirectResult> {
  const params = parseAuthRedirect(url);
  if (params.error || params.error_code) {
    if (params.error_code === 'otp_expired') {
      return { status: 'error', reason: 'expired', message: 'El enlace expiró o ya se usó. Pide uno nuevo.' };
    }
    return {
      status: 'error',
      reason: 'denied',
      message: params.error_description || 'No se pudo completar el acceso.',
    };
  }
  if (!params.code) {
    return { status: 'error', reason: 'missing_code', message: 'El enlace no es válido.' };
  }
  // `sb_flow_id` identifica el flujo PKCE que generó este enlace; sin él se usaría el verificador
  // más reciente, que puede ser de otro flujo en curso (y gastaría el code de un solo uso).
  const flowId = params.sb_flow_id;
  const { data, error } = await supabase.auth.exchangeCodeForSession(params.code, flowId ? { flowId } : undefined);
  if (error) {
    // Típico al abrir el enlace en otro dispositivo o navegador: aquí no está el verificador PKCE.
    // Una confirmación de correo pudo completarse igualmente; una recuperación no cambia nada.
    return {
      status: 'error',
      reason: 'exchange_failed',
      message:
        'Este enlace debe abrirse en el mismo dispositivo y navegador donde lo pediste. Si era para confirmar tu correo, puede que ya esté confirmado: inicia sesión. Si era para cambiar tu contraseña, pide un enlace nuevo.',
    };
  }
  // auth-js devuelve `redirectType` en tiempo de ejecución, pero su tipo AuthTokenResponse no lo declara.
  const { redirectType } = data as { redirectType?: string | null };
  return { status: 'signed_in', kind: redirectType === 'recovery' ? 'recovery' : 'sign_in' };
}

/**
 * Google con el navegador del sistema + PKCE y un solo OAuth Client (tipo Web) en Supabase.
 * La aceptación móvil se hace en development builds (scheme tyra://), no en Expo Go.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!(await isGoogleEnabled())) {
    return { error: 'El acceso con Google aún no está configurado.' };
  }
  const redirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    return { error: 'No pudimos abrir Google.' };
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    return { error: null }; // El usuario cerró la ventana.
  }
  const completed = await completeAuthRedirect(result.url);
  if (completed.status === 'signed_in') return { error: null };
  // Con registro cerrado, Google para un correo sin cuenta vuelve con signup_disabled.
  return { error: /signup|not allowed/i.test(completed.message) ? INVITE_ONLY_MESSAGE : completed.message };
}
