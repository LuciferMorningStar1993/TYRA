// Decide qué parte de la app ve el usuario según la sesión y el estado de su perfil.

import type { Profile } from './profile';
import type { LoadProfileResult } from './profile-api';

/** Estado del perfil del usuario con sesión. */
export type ProfileState =
  | { status: 'loading'; userId: string }
  | { status: 'loaded'; userId: string; profile: Profile }
  | { status: 'missing'; userId: string }
  | { status: 'error'; userId: string; message: string };

export function toProfileState(userId: string, result: LoadProfileResult): ProfileState {
  if (result.status === 'loaded') return { status: 'loaded', userId, profile: result.profile };
  if (result.status === 'missing') return { status: 'missing', userId };
  return { status: 'error', userId, message: result.message };
}

/**
 * El estado guardado solo vale para el usuario que lo pidió: si la sesión cambió
 * (otro usuario) y aún no hay respuesta para él, se considera "cargando".
 */
export function profileStateFor(userId: string, stored: ProfileState | null): ProfileState {
  return stored?.userId === userId ? stored : { status: 'loading', userId };
}

export type AppRoute = 'starting' | 'auth' | 'profile-status' | 'onboarding' | 'app';

export function resolveRoute(params: {
  authReady: boolean;
  userId: string | null;
  profileState: ProfileState | null;
}): AppRoute {
  if (!params.authReady) return 'starting';
  if (!params.userId) return 'auth';
  const state = profileStateFor(params.userId, params.profileState);
  if (state.status !== 'loaded') return 'profile-status';
  return state.profile.onboarded_at ? 'app' : 'onboarding';
}
