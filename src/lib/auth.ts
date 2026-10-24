import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import type { Gender, PaletteId } from '@/design/palettes';

import type { Identifier } from './identifier';
import { supabase } from './supabase';

// Cierra la ventana emergente de OAuth en web.
WebBrowser.maybeCompleteAuthSession();

type AuthResult = { error: string | null };

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
  if (/rate limit|too many/i.test(message)) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  }
  if (/network|fetch/i.test(message)) {
    return 'Sin conexión. Revisa tu internet.';
  }
  return fallback;
}

export async function signInWithPassword(identifier: Identifier, password: string): Promise<AuthResult> {
  if (identifier.kind === 'email') {
    const { error } = await supabase.auth.signInWithPassword({ email: identifier.email, password });
    return { error: error ? friendlyAuthError(error.message, 'No pudimos iniciar sesión.') : null };
  }

  // Teléfono: la Edge Function resuelve el correo y devuelve la sesión.
  const { data, error } = await supabase.functions.invoke<{
    access_token: string;
    refresh_token: string;
  }>('phone-login', { body: { phone: identifier.phone, password } });
  if (error || !data) {
    return { error: 'Correo, teléfono o contraseña incorrectos.' };
  }
  const { error: sessionError } = await supabase.auth.setSession(data);
  return { error: sessionError ? 'No pudimos iniciar sesión.' : null };
}

export type SignUpInput = {
  displayName: string;
  email: string;
  phone: string | null;
  password: string;
  gender: Gender | null;
  palette: PaletteId;
};

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  // Los metadatos los copia el trigger handle_new_user a public.profiles.
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        display_name: input.displayName,
        phone: input.phone,
        gender: input.gender,
        theme_palette: input.palette,
      },
    },
  });
  if (error) {
    return { error: friendlyAuthError(error.message, 'No pudimos crear tu cuenta.') };
  }
  // Supabase no revela si el correo ya existía: devuelve un usuario sin identidades.
  if (data.user && data.user.identities?.length === 0) {
    return { error: 'Ya existe una cuenta con ese correo. Inicia sesión.' };
  }
  return { error: null };
}

async function isGoogleEnabled(): Promise<boolean> {
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
    });
    const settings = (await response.json()) as { external?: { google?: boolean } };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}

/** Intercambia el `code` del redirect de OAuth (flujo PKCE) por una sesión. */
export async function completeOAuthRedirect(url: string): Promise<AuthResult> {
  const { queryParams } = Linking.parse(url);
  const errorDescription = queryParams?.error_description;
  if (typeof errorDescription === 'string') {
    return { error: errorDescription };
  }
  const code = queryParams?.code;
  if (typeof code !== 'string') {
    return { error: 'No recibimos la respuesta de Google.' };
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return { error: error ? 'No pudimos completar el acceso con Google.' : null };
}

/**
 * Google con el navegador del sistema + PKCE. Funciona en Expo Go y en builds
 * propios con un solo OAuth Client (tipo Web) configurado en Supabase.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!(await isGoogleEnabled())) {
    return { error: 'El acceso con Google aún no está configurado.' };
  }
  const redirectTo = Linking.createURL('auth/callback');
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
  return completeOAuthRedirect(result.url);
}
