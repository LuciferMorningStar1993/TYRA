import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { acceptInvite as acceptInviteRequest, type InviteAcceptance } from '@/lib/auth';
import type { Profile, ProfileUpdate } from '@/lib/profile';
import { loadProfile, saveProfile, type SaveProfileResult } from '@/lib/profile-api';
import {
  profileStateFor,
  resolveRoute,
  toProfileState,
  type AppRoute,
  type ProfileState,
} from '@/lib/session-routing';
import { supabase } from '@/lib/supabase';

export type PasswordSetupMode = 'recovery' | 'invite';

type SessionContextValue = {
  session: Session | null;
  route: AppRoute;
  /** Estado del perfil del usuario actual (null sin sesión). */
  profileState: ProfileState | null;
  /** Perfil confirmado por el servidor; null si no está cargado. */
  profile: Profile | null;
  retryProfile: () => Promise<void>;
  /** Por qué la sesión actual debe crear contraseña: recuperación o invitación recién aceptada. */
  passwordSetupMode: PasswordSetupMode | null;
  /** Acepta una invitación (enlace o código) y, si se verifica, pide crear la contraseña. */
  acceptInvite: (input: Parameters<typeof acceptInviteRequest>[0]) => Promise<InviteAcceptance>;
  /** Termina el modo de recuperación/invitación (tras fijar la contraseña). */
  completeRecovery: () => void;
  /**
   * Guarda en el servidor y solo actualiza el estado local si se confirmó una fila.
   * `expectedUserId` evita enviar una escritura pensada para otra sesión.
   */
  saveProfile: (patch: ProfileUpdate, expectedUserId?: string) => Promise<SaveProfileResult>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) {
    throw new Error('useSession debe usarse dentro de <SessionProvider>');
  }
  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [storedState, setStoredState] = useState<ProfileState | null>(null);
  // Solo en memoria: la pantalla de contraseña existe únicamente justo después de abrir un enlace
  // de recuperación o aceptar una invitación en esta app. Recargar o cerrar sesión la termina.
  const [passwordSetup, setPasswordSetup] = useState<{ userId: string; mode: PasswordSetupMode } | null>(null);
  // La invitación se marca en el mismo evento SIGNED_IN que produce verifyOtp (sin carreras).
  const pendingInvite = useRef(false);

  // Cada carga/guardado lleva un número; solo se aplica la respuesta de la petición vigente.
  // Un cambio de sesión (incluido cerrar y volver a abrir la misma cuenta) invalida todo lo anterior.
  const latestRequest = useRef(0);
  const sessionGeneration = useRef(0);
  const sessionUser = useRef<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // No se llama a Supabase dentro del callback (puede bloquear el cliente);
      // la carga del perfil ocurre en el efecto de abajo.
      const nextUser = nextSession?.user.id ?? null;
      if (event === 'SIGNED_OUT' || nextUser !== sessionUser.current) {
        sessionUser.current = nextUser;
        sessionGeneration.current += 1;
        latestRequest.current += 1;
        setStoredState(null);
        setPasswordSetup(null);
      }
      if (event === 'PASSWORD_RECOVERY' && nextUser) setPasswordSetup({ userId: nextUser, mode: 'recovery' });
      if (event === 'SIGNED_IN' && nextUser && pendingInvite.current) {
        pendingInvite.current = false;
        setPasswordSetup({ userId: nextUser, mode: 'invite' });
      }
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const load = useCallback(async (id: string) => {
    const requestId = ++latestRequest.current;
    const result = await loadProfile(id);
    if (requestId !== latestRequest.current) return; // hay una petición o sesión más reciente
    setStoredState(toProfileState(id, result));
  }, []);

  useEffect(() => {
    if (!userId) return;
    void load(userId);
    return () => {
      latestRequest.current += 1;
    };
  }, [userId, load]);

  const profileState = userId ? profileStateFor(userId, storedState) : null;
  const profile = profileState?.status === 'loaded' ? profileState.profile : null;
  const setupForCurrentUser = passwordSetup?.userId === userId ? passwordSetup : null;
  const route = resolveRoute({ authReady, userId, profileState, recoveryUserId: setupForCurrentUser?.userId ?? null });

  const completeRecovery = useCallback(() => setPasswordSetup(null), []);

  const acceptInvite = useCallback(async (input: Parameters<typeof acceptInviteRequest>[0]) => {
    pendingInvite.current = true;
    const result = await acceptInviteRequest(input);
    if (result.status !== 'accepted') pendingInvite.current = false;
    return result;
  }, []);

  const retryProfile = useCallback(async () => {
    if (!userId) return;
    setStoredState({ status: 'loading', userId });
    await load(userId);
  }, [userId, load]);

  const saveProfileForUser = useCallback(
    async (patch: ProfileUpdate, expectedUserId?: string): Promise<SaveProfileResult> => {
      if (!userId || profileState?.status !== 'loaded') return { ok: false, error: 'no_session' };
      // Escrituras pedidas para otra sesión (p. ej. un reintento pendiente) no se envían.
      if (expectedUserId && expectedUserId !== userId) return { ok: false, error: 'stale_session' };
      const generation = sessionGeneration.current;
      const result = await saveProfile(userId, patch);
      if (result.ok && generation === sessionGeneration.current) {
        latestRequest.current += 1; // una lectura en curso ya es más vieja que esta fila
        setStoredState((current) =>
          current?.userId === userId ? { status: 'loaded', userId, profile: result.profile } : current,
        );
      }
      return result;
    },
    [userId, profileState?.status],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <SessionContext
      value={{
        session,
        route,
        profileState,
        profile,
        retryProfile,
        passwordSetupMode: setupForCurrentUser?.mode ?? null,
        acceptInvite,
        completeRecovery,
        saveProfile: saveProfileForUser,
        signOut,
      }}>
      {children}
    </SessionContext>
  );
}
