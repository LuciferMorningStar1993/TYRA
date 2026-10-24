import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';

import type { Profile, ProfileUpdate } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

type SessionContextValue = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: ProfileUpdate) => Promise<{ error: string | null }>;
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

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) {
    console.warn('No se pudo cargar el perfil', error.message);
    return null;
  }
  return data;
}

type LoadedProfile = { userId: string; profile: Profile | null };

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loaded, setLoaded] = useState<LoadedProfile | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // No se llama a Supabase dentro del callback (puede bloquear el cliente);
      // la carga del perfil ocurre en el efecto de abajo.
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchProfile(userId).then((profile) => {
      if (!cancelled) setLoaded({ userId, profile });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // El perfil solo es válido si pertenece al usuario de la sesión actual.
  const profileLoaded = !!userId && loaded?.userId === userId;
  const profile = profileLoaded ? loaded.profile : null;
  const isLoading = !authReady || (!!userId && !profileLoaded);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    setLoaded({ userId, profile: await fetchProfile(userId) });
  }, [userId]);

  const updateProfile = useCallback(
    async (patch: ProfileUpdate) => {
      if (!userId) return { error: null };
      // Optimista: la UI (p. ej. el tema) cambia al instante; si falla, se recarga.
      setLoaded((current) =>
        current?.userId === userId && current.profile
          ? { userId, profile: { ...current.profile, ...patch } }
          : current,
      );
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
      if (error) {
        await refreshProfile();
      }
      return { error: error?.message ?? null };
    },
    [userId, refreshProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <SessionContext value={{ session, profile, isLoading, refreshProfile, updateProfile, signOut }}>
      {children}
    </SessionContext>
  );
}
