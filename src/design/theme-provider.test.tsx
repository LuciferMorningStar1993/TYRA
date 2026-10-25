import { act } from 'react';

import type { LoadProfileResult, SaveProfileResult } from '@/lib/profile-api';
import { loadProfile, saveProfile } from '@/lib/profile-api';
import { SessionProvider } from '@/providers/session-provider';
import { emitAuth, resetFakeAuth, sessionFor } from '@/test-utils/fake-supabase';
import { installMemoryStorage, type MemoryStorage } from '@/test-utils/memory-storage';
import { createProbe, deferred, flush, profileFixture, render, unmount } from '@/test-utils/render';

import { APPEARANCE_SAVE_ERROR, ThemeProvider, useTheme } from './theme-provider';
import { readPendingAppearance } from './theme-preferences';

jest.mock('@/lib/supabase', () => jest.requireActual('@/test-utils/fake-supabase'));
jest.mock('@/lib/profile-api', () => ({ loadProfile: jest.fn(), saveProfile: jest.fn() }));

const loadMock = jest.mocked(loadProfile);
const saveMock = jest.mocked(saveProfile);

const theme = createProbe(useTheme);

/** Simula abrir la app (montar proveedores) con el almacenamiento actual del dispositivo. */
async function openApp() {
  return render(
    <SessionProvider>
      <ThemeProvider>
        <theme.Probe />
      </ThemeProvider>
    </SessionProvider>,
  );
}

async function signIn(userId: string, profileOverrides = {}) {
  loadMock.mockResolvedValueOnce({
    status: 'loaded',
    profile: profileFixture({ id: userId, onboarded_at: '2026-10-24T10:00:00Z', ...profileOverrides }),
  } satisfies LoadProfileResult);
  await act(async () => emitAuth('SIGNED_IN', sessionFor(userId)));
  await flush();
}

async function signOut() {
  await act(async () => emitAuth('SIGNED_OUT', null));
}

const savedRow = (userId: string, patch: Record<string, unknown>): SaveProfileResult => ({
  ok: true,
  profile: profileFixture({ id: userId, onboarded_at: '2026-10-24T10:00:00Z', ...patch }),
});

let storage: MemoryStorage;

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeAuth();
  storage = installMemoryStorage();
});

it('registra el pendiente (dueño, valores, versión) ANTES de enviar la petición', async () => {
  await openApp();
  await signIn('user-a', { theme_palette: 'indigo', color_mode: 'system' });

  let pendingWhenSent: unknown = undefined;
  saveMock.mockImplementationOnce(async (userId, patch) => {
    pendingWhenSent = readPendingAppearance('user-a');
    return savedRow(userId!, patch);
  });
  await act(async () => theme.value.setPalette('nordic'));
  await flush();

  expect(pendingWhenSent).toMatchObject({ owner: 'user-a', palette: 'nordic', mode: 'system' });
  expect(saveMock).toHaveBeenCalledWith('user-a', { theme_palette: 'nordic', color_mode: 'system' });
  expect(readPendingAppearance('user-a')).toBeNull(); // confirmado → se borra
  expect(theme.value.palette).toBe('nordic');
});

it('fallo + logout + recarga: conserva la elección original y la reintenta', async () => {
  let app = await openApp();
  await signIn('user-a', { theme_palette: 'indigo' });
  saveMock.mockResolvedValueOnce({ ok: false, error: 'Network request failed' });
  await act(async () => theme.value.setPalette('aurora'));
  await flush();
  expect(theme.value.saveError).toBe(APPEARANCE_SAVE_ERROR);
  expect(theme.value.palette).toBe('aurora');

  await signOut();
  await unmount(app);

  // Recarga: el servidor sigue con "indigo", pero la intención pendiente gana y se reenvía.
  saveMock.mockImplementation(async (userId, patch) => savedRow(userId!, patch));
  app = await openApp();
  await signIn('user-a', { theme_palette: 'indigo' });
  expect(theme.value.palette).toBe('aurora');
  expect(saveMock).toHaveBeenLastCalledWith('user-a', { theme_palette: 'aurora', color_mode: 'system' });
  expect(readPendingAppearance('user-a')).toBeNull();
  expect(theme.value.saveError).toBeNull();
});

it('cerrar la app con la petición en curso permite recuperar la intención', async () => {
  const app = await openApp();
  await signIn('user-a', { theme_palette: 'indigo' });
  saveMock.mockReturnValueOnce(new Promise<SaveProfileResult>(() => {})); // nunca responde
  await act(async () => theme.value.setMode('dark'));
  await unmount(app);

  expect(readPendingAppearance('user-a')).toMatchObject({ palette: 'indigo', mode: 'dark' });

  saveMock.mockImplementation(async (userId, patch) => savedRow(userId!, patch));
  await openApp();
  await signIn('user-a', { theme_palette: 'indigo', color_mode: 'light' });
  expect(theme.value.mode).toBe('dark');
  expect(saveMock).toHaveBeenLastCalledWith('user-a', { theme_palette: 'indigo', color_mode: 'dark' });
});

it('A y B no mezclan sus pendientes', async () => {
  await openApp();
  await signIn('user-a', { theme_palette: 'indigo' });
  saveMock.mockResolvedValueOnce({ ok: false, error: 'timeout' });
  await act(async () => theme.value.setPalette('aurora'));
  await flush();

  await signOut();
  saveMock.mockImplementation(async (userId, patch) => savedRow(userId!, patch));
  await signIn('user-b', { theme_palette: 'nordic', color_mode: 'light' });
  expect(theme.value.palette).toBe('nordic'); // no hereda el pendiente de A
  expect(theme.value.saveError).toBeNull(); // ni su error
  expect(saveMock).not.toHaveBeenCalledWith('user-b', expect.objectContaining({ theme_palette: 'aurora' }));

  await act(async () => theme.value.setMode('dark'));
  await flush();
  expect(saveMock).toHaveBeenLastCalledWith('user-b', { theme_palette: 'nordic', color_mode: 'dark' });
  expect(readPendingAppearance('user-a')).toMatchObject({ palette: 'aurora' }); // A intacto
  expect(storage.dump()).not.toHaveProperty('tyra.theme.pending.user-b'); // B ya confirmado
});

it('cambios rápidos: prevalece el último y una respuesta vieja no borra un pendiente nuevo', async () => {
  await openApp();
  await signIn('user-a', { theme_palette: 'indigo' });
  const first = deferred<SaveProfileResult>();
  const last = deferred<SaveProfileResult>();
  saveMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);

  await act(async () => theme.value.setPalette('aurora'));
  await act(async () => theme.value.setPalette('nordic'));
  await act(async () => theme.value.setPalette('indigo'));
  expect(theme.value.palette).toBe('indigo');

  await act(async () => first.resolve(savedRow('user-a', { theme_palette: 'aurora' })));
  await flush();
  // La confirmación de "aurora" no borra el pendiente de "indigo".
  expect(readPendingAppearance('user-a')).toMatchObject({ palette: 'indigo' });
  expect(theme.value.palette).toBe('indigo');
  expect(saveMock).toHaveBeenCalledTimes(2);
  expect(saveMock).toHaveBeenLastCalledWith('user-a', { theme_palette: 'indigo', color_mode: 'system' });

  await act(async () => last.resolve(savedRow('user-a', { theme_palette: 'indigo' })));
  await flush();
  expect(readPendingAppearance('user-a')).toBeNull();
  expect(theme.value.palette).toBe('indigo');
});

it('error de la última elección visible y reintento manual', async () => {
  await openApp();
  await signIn('user-a', { theme_palette: 'indigo' });
  saveMock.mockResolvedValueOnce({ ok: false, error: 'no_row' });
  await act(async () => theme.value.setPalette('nordic'));
  await flush();
  expect(theme.value.saveError).toBe(APPEARANCE_SAVE_ERROR);

  saveMock.mockImplementation(async (userId, patch) => savedRow(userId!, patch));
  await act(async () => theme.value.retrySave());
  await flush();
  expect(theme.value.saveError).toBeNull();
  expect(saveMock).toHaveBeenLastCalledWith('user-a', { theme_palette: 'nordic', color_mode: 'system' });
});

it('la vista previa (borrador) no se guarda ni persiste', async () => {
  await openApp();
  await signIn('user-a', { theme_palette: 'indigo' });
  await act(async () => theme.value.previewPalette('aurora'));
  expect(theme.value.palette).toBe('aurora');
  expect(saveMock).not.toHaveBeenCalled();
  expect(readPendingAppearance('user-a')).toBeNull();
  await act(async () => theme.value.previewPalette(null));
  expect(theme.value.palette).toBe('indigo');
});
