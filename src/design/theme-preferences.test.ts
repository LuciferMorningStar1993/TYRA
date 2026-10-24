import { installMemoryStorage } from '@/test-utils/memory-storage';

import {
  clearPendingAppearance,
  readPendingAppearance,
  readStoredPreferences,
  storePreferences,
  writePendingAppearance,
} from './theme-preferences';

jest.mock('expo-sqlite/localStorage/install', () => ({}));

beforeEach(() => installMemoryStorage());

describe('pendiente de apariencia por usuario', () => {
  it('guarda dueño, valores y una versión creciente', () => {
    const first = writePendingAppearance('user-a', 'aurora', 'dark');
    const second = writePendingAppearance('user-a', 'nordic', 'dark');
    expect(first).toMatchObject({ owner: 'user-a', palette: 'aurora', mode: 'dark' });
    expect(second.version).toBeGreaterThan(first.version);
    expect(readPendingAppearance('user-a')).toEqual(second);
  });

  it('un resultado antiguo no borra un pendiente más reciente', () => {
    const old = writePendingAppearance('user-a', 'aurora', 'system');
    const newer = writePendingAppearance('user-a', 'nordic', 'system');
    clearPendingAppearance('user-a', old.version);
    expect(readPendingAppearance('user-a')).toEqual(newer);
    clearPendingAppearance('user-a', newer.version);
    expect(readPendingAppearance('user-a')).toBeNull();
  });

  it('la versión nunca se repite aunque el pendiente anterior ya se haya borrado', () => {
    const first = writePendingAppearance('user-a', 'aurora', 'system');
    clearPendingAppearance('user-a', first.version);
    const next = writePendingAppearance('user-a', 'nordic', 'system');
    expect(next.version).toBeGreaterThan(first.version);
  });

  it('A y B tienen claves separadas', () => {
    writePendingAppearance('user-a', 'aurora', 'dark');
    writePendingAppearance('user-b', 'nordic', 'light');
    expect(readPendingAppearance('user-a')).toMatchObject({ palette: 'aurora', mode: 'dark' });
    expect(readPendingAppearance('user-b')).toMatchObject({ palette: 'nordic', mode: 'light' });
  });

  it('ignora registros corruptos o de otro dueño', () => {
    localStorage.setItem('tyra.theme.pending.user-a', '{no json');
    expect(readPendingAppearance('user-a')).toBeNull();
    localStorage.setItem(
      'tyra.theme.pending.user-a',
      JSON.stringify({ owner: 'user-b', palette: 'aurora', mode: 'dark', version: 1 }),
    );
    expect(readPendingAppearance('user-a')).toBeNull();
    localStorage.setItem(
      'tyra.theme.pending.user-a',
      JSON.stringify({ owner: 'user-a', palette: 'rosa', mode: 'dark', version: 1 }),
    );
    expect(readPendingAppearance('user-a')).toBeNull();
  });
});

describe('preferencias del dispositivo', () => {
  it('se leen de nuevo tras guardarse (no quedan congeladas)', () => {
    storePreferences('aurora', 'dark');
    expect(readStoredPreferences()).toEqual({ palette: 'aurora', mode: 'dark' });
    storePreferences('nordic', 'light');
    expect(readStoredPreferences()).toEqual({ palette: 'nordic', mode: 'light' });
  });
});
