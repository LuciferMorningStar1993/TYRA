// Lectura y escritura del perfil del usuario en Supabase.
// Siempre devuelven un resultado explícito: nunca confunden "error de red" con "sin perfil".

import type { Profile, ProfileUpdate } from './profile';
import { supabase } from './supabase';

export type LoadProfileResult =
  | { status: 'loaded'; profile: Profile }
  | { status: 'missing' }
  | { status: 'error'; message: string };

export async function loadProfile(userId: string): Promise<LoadProfileResult> {
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) return { status: 'error', message: error.message };
    return data ? { status: 'loaded', profile: data } : { status: 'missing' };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

export type SaveProfileResult = { ok: true; profile: Profile } | { ok: false; error: string };

/**
 * Guarda cambios del perfil y devuelve la fila confirmada por el servidor.
 * Si RLS o un id incorrecto hacen que no se actualice ninguna fila, es un error.
 */
export async function saveProfile(userId: string | undefined, patch: ProfileUpdate): Promise<SaveProfileResult> {
  if (!userId) return { ok: false, error: 'no_session' };
  try {
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select('*').maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'no_row' };
    return { ok: true, profile: data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
