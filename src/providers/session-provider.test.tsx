import { act } from 'react';

import type { LoadProfileResult, SaveProfileResult } from '@/lib/profile-api';
import { acceptInvite } from '@/lib/auth';
import { loadProfile, saveProfile } from '@/lib/profile-api';
import { emitAuth, resetFakeAuth, sessionFor } from '@/test-utils/fake-supabase';
import { createProbe, deferred, flush, profileFixture, render } from '@/test-utils/render';

import { SessionProvider, useSession } from './session-provider';

jest.mock('@/lib/supabase', () => jest.requireActual('@/test-utils/fake-supabase'));
jest.mock('@/lib/profile-api', () => ({ loadProfile: jest.fn(), saveProfile: jest.fn() }));
// acceptInvite real llama a verifyOtp; aquí se simula: un acierto produce el SIGNED_IN de Auth.
jest.mock('@/lib/auth', () => ({ acceptInvite: jest.fn() }));

const loadMock = jest.mocked(loadProfile);
const saveMock = jest.mocked(saveProfile);

/** Expone el contexto actual para hacer aserciones fuera de React. */
const session = createProbe(useSession);

async function renderSession() {
  return render(
    <SessionProvider>
      <session.Probe />
    </SessionProvider>,
  );
}

async function signIn(userId: string) {
  await act(async () => emitAuth('SIGNED_IN', sessionFor(userId)));
}

async function signOut() {
  await act(async () => emitAuth('SIGNED_OUT', null));
}

const loaded = (overrides = {}): LoadProfileResult => ({ status: 'loaded', profile: profileFixture(overrides) });

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeAuth();
});

describe('SessionProvider: carga de perfil', () => {
  it('fallo de red → pantalla de estado (no onboarding) → reintento exitoso', async () => {
    loadMock.mockResolvedValueOnce({ status: 'error', message: 'Network request failed' });
    await renderSession();
    await signIn('user-a');
    await flush();
    expect(session.value.profileState).toMatchObject({ status: 'error' });
    expect(session.value.route).toBe('profile-status');

    loadMock.mockResolvedValueOnce(loaded({ onboarded_at: '2026-10-24T10:00:00Z' }));
    await act(async () => session.value.retryProfile());
    expect(session.value.route).toBe('app');
  });

  it('petición A + sesión B: la respuesta tardía de A no cambia a B', async () => {
    const requestA = deferred<LoadProfileResult>();
    const requestB = deferred<LoadProfileResult>();
    loadMock.mockReturnValueOnce(requestA.promise).mockReturnValueOnce(requestB.promise);
    await renderSession();

    await signIn('user-a');
    await signOut();
    await signIn('user-b');
    await act(async () => requestB.resolve(loaded({ id: 'user-b', display_name: 'Beto' })));
    await act(async () => requestA.resolve(loaded({ id: 'user-a', display_name: 'Ana' })));

    expect(session.value.profile?.display_name).toBe('Beto');
    expect(session.value.route).toBe('onboarding');
  });

  it('cerrar y reabrir la misma cuenta descarta la respuesta de la sesión anterior', async () => {
    const before = deferred<LoadProfileResult>();
    const after = deferred<LoadProfileResult>();
    loadMock.mockReturnValueOnce(before.promise).mockReturnValueOnce(after.promise);
    await renderSession();

    await signIn('user-a');
    await signOut();
    await signIn('user-a');

    // La vieja llega primero: se ignora y seguimos esperando la vigente (sin quedarse en un estado erróneo).
    await act(async () => before.resolve(loaded({ display_name: 'Viejo', onboarded_at: '2026-01-01T00:00:00Z' })));
    expect(session.value.profileState?.status).toBe('loading');

    await act(async () => after.resolve(loaded({ display_name: 'Vigente' })));
    expect(session.value.profile?.display_name).toBe('Vigente');
    expect(session.value.route).toBe('onboarding');
  });

  it('un reintento obsoleto no pisa el perfil de la nueva sesión ni deja carga permanente', async () => {
    const retry = deferred<LoadProfileResult>();
    loadMock
      .mockResolvedValueOnce({ status: 'error', message: 'timeout' })
      .mockReturnValueOnce(retry.promise)
      .mockResolvedValueOnce(loaded({ id: 'user-b', display_name: 'Beto' }));
    await renderSession();
    await signIn('user-a');
    await flush();

    let retrying!: Promise<void>;
    await act(async () => {
      retrying = session.value.retryProfile();
    });
    await signOut();
    await signIn('user-b');
    await flush();
    await act(async () => {
      retry.resolve(loaded({ id: 'user-a', display_name: 'Ana' }));
      await retrying;
    });

    expect(session.value.profile?.display_name).toBe('Beto');
    expect(session.value.profileState?.status).toBe('loaded');
  });
});

describe('SessionProvider: guardado confirmado por el servidor', () => {
  async function onboardingUser() {
    loadMock.mockResolvedValueOnce(loaded());
    await renderSession();
    await signIn('user-a');
    await flush();
    expect(session.value.route).toBe('onboarding');
  }

  it('guardado lento: no entra al inicio hasta que el servidor confirma', async () => {
    await onboardingUser();
    const save = deferred<SaveProfileResult>();
    saveMock.mockReturnValueOnce(save.promise);

    let saving!: Promise<SaveProfileResult>;
    await act(async () => {
      saving = session.value.saveProfile({ onboarded_at: '2026-10-24T10:00:00Z' });
    });
    expect(session.value.route).toBe('onboarding');

    await act(async () => {
      save.resolve({ ok: true, profile: profileFixture({ onboarded_at: '2026-10-24T10:00:00Z' }) });
      await saving;
    });
    expect(session.value.route).toBe('app');
  });

  it.each([
    [{ ok: false, error: 'Network request failed' }],
    [{ ok: false, error: 'no_row' }],
  ] as const)('fallo (%o): sigue en onboarding con el perfil intacto', async (result) => {
    await onboardingUser();
    saveMock.mockResolvedValueOnce(result);
    let response!: SaveProfileResult;
    await act(async () => {
      response = await session.value.saveProfile({ onboarded_at: '2026-10-24T10:00:00Z' });
    });
    expect(response.ok).toBe(false);
    expect(session.value.route).toBe('onboarding');
    expect(session.value.profile?.onboarded_at).toBeNull();
  });

  it('sin sesión no llama al servidor ni informa éxito', async () => {
    await renderSession();
    await signOut();
    const response = await session.value.saveProfile({ display_name: 'x' });
    expect(response).toEqual({ ok: false, error: 'no_session' });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('una escritura pensada para otro usuario no se envía', async () => {
    await onboardingUser();
    const response = await session.value.saveProfile({ theme_palette: 'nordic' }, 'user-b');
    expect(response).toEqual({ ok: false, error: 'stale_session' });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('un guardado que termina después de cambiar de sesión no altera la nueva', async () => {
    await onboardingUser();
    const save = deferred<SaveProfileResult>();
    saveMock.mockReturnValueOnce(save.promise);
    let saving!: Promise<SaveProfileResult>;
    await act(async () => {
      saving = session.value.saveProfile({ onboarded_at: '2026-10-24T10:00:00Z' });
    });

    loadMock.mockResolvedValueOnce(loaded({ id: 'user-b', display_name: 'Beto' }));
    await signOut();
    await signIn('user-b');
    await flush();
    await act(async () => {
      save.resolve({ ok: true, profile: profileFixture({ onboarded_at: '2026-10-24T10:00:00Z' }) });
      await saving;
    });

    expect(session.value.profile?.display_name).toBe('Beto');
    expect(session.value.route).toBe('onboarding');
  });
});

describe('SessionProvider: sesión de recuperación', () => {
  async function recoveredUser(userId = 'user-a') {
    loadMock.mockResolvedValueOnce(loaded({ id: userId, onboarded_at: '2026-10-24T10:00:00Z' }));
    await renderSession();
    await act(async () => emitAuth('PASSWORD_RECOVERY', sessionFor(userId)));
    await flush();
  }

  it('PASSWORD_RECOVERY lleva a la contraseña nueva aunque el perfil esté completo', async () => {
    await recoveredUser();
    expect(session.value.route).toBe('reset-password');
  });

  it('al terminar la recuperación sigue la ruta normal', async () => {
    await recoveredUser();
    await act(async () => session.value.completeRecovery());
    expect(session.value.route).toBe('app');
  });

  it('cerrar sesión termina la recuperación; volver a entrar normal no la reactiva', async () => {
    await recoveredUser();
    await signOut();
    loadMock.mockResolvedValueOnce(loaded({ onboarded_at: '2026-10-24T10:00:00Z' }));
    await signIn('user-a');
    await flush();
    expect(session.value.route).toBe('app');
  });

  it('otro usuario no hereda la recuperación', async () => {
    await recoveredUser('user-a');
    loadMock.mockResolvedValueOnce(loaded({ id: 'user-b', onboarded_at: '2026-10-24T10:00:00Z' }));
    await signIn('user-b');
    await flush();
    expect(session.value.route).toBe('app');
  });

  it('un inicio de sesión normal nunca abre la pantalla de contraseña nueva', async () => {
    loadMock.mockResolvedValueOnce(loaded({ onboarded_at: '2026-10-24T10:00:00Z' }));
    await renderSession();
    await signIn('user-a');
    await flush();
    expect(session.value.route).toBe('app');
  });
});

describe('SessionProvider: invitación aceptada', () => {
  async function rendered() {
    loadMock.mockResolvedValue(loaded({ id: 'user-inv', onboarded_at: null }));
    await renderSession();
    await signOut();
  }

  it('aceptar la invitación lleva a crear la contraseña (modo invite)', async () => {
    jest.mocked(acceptInvite).mockImplementationOnce(async () => {
      emitAuth('SIGNED_IN', sessionFor('user-inv'));
      return { status: 'accepted' };
    });
    await rendered();
    await act(async () => {
      await session.value.acceptInvite({ tokenHash: 'th' });
    });
    await flush();
    expect(session.value.route).toBe('reset-password');
    expect(session.value.passwordSetupMode).toBe('invite');
  });

  it('una invitación rechazada no marca nada; un inicio normal posterior no pide contraseña', async () => {
    jest.mocked(acceptInvite).mockResolvedValueOnce({ status: 'error', reason: 'expired', message: 'x' });
    await rendered();
    await act(async () => {
      await session.value.acceptInvite({ tokenHash: 'th' });
    });
    await signIn('user-inv');
    await flush();
    expect(session.value.route).toBe('onboarding');
    expect(session.value.passwordSetupMode).toBeNull();
  });

  it('tras crear la contraseña sigue la ruta normal', async () => {
    jest.mocked(acceptInvite).mockImplementationOnce(async () => {
      emitAuth('SIGNED_IN', sessionFor('user-inv'));
      return { status: 'accepted' };
    });
    await rendered();
    await act(async () => {
      await session.value.acceptInvite({ tokenHash: 'th' });
    });
    await flush();
    await act(async () => session.value.completeRecovery());
    expect(session.value.route).toBe('onboarding');
  });
});
