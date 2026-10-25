// Sustituto de '@/lib/supabase' para pruebas de proveedores: permite emitir eventos de Auth
// a mano. Uso: jest.mock('@/lib/supabase', () => require('@/test-utils/fake-supabase'));

import type { Session } from '@supabase/supabase-js';

type AuthListener = (event: string, session: Session | null) => void;

const listeners = new Set<AuthListener>();

export const supabase = {
  auth: {
    onAuthStateChange: (listener: AuthListener) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    signOut: async () => {
      emitAuth('SIGNED_OUT', null);
      return { error: null };
    },
  },
  from: () => {
    throw new Error('Las pruebas de proveedores deben simular profile-api, no consultar Supabase.');
  },
};

export const supabaseConfig = { mode: 'normal', url: 'http://test.invalid', publishableKey: 'test' };

export function emitAuth(event: string, session: Session | null): void {
  for (const listener of [...listeners]) listener(event, session);
}

export function sessionFor(userId: string): Session {
  return { user: { id: userId } } as Session;
}

export function resetFakeAuth(): void {
  listeners.clear();
}
