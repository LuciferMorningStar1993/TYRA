import type { Profile } from './profile';
import { profileStateFor, resolveRoute, toProfileState, type ProfileState } from './session-routing';

const USER_A = 'user-a';
const USER_B = 'user-b';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: USER_A,
    display_name: 'Ana',
    sex: null,
    birth_date: null,
    height_cm: null,
    weight_kg: null,
    activity_level: null,
    goal: null,
    gender: null,
    phone: null,
    theme_palette: null,
    color_mode: null,
    onboarded_at: null,
    created_at: '2026-10-24T00:00:00Z',
    updated_at: '2026-10-24T00:00:00Z',
    ...overrides,
  };
}

describe('resolveRoute', () => {
  it('espera a que Auth esté listo', () => {
    expect(resolveRoute({ authReady: false, userId: null, profileState: null })).toBe('starting');
  });

  it('sin sesión va a acceso', () => {
    expect(resolveRoute({ authReady: true, userId: null, profileState: null })).toBe('auth');
  });

  it('mientras carga el perfil no decide onboarding ni inicio', () => {
    expect(resolveRoute({ authReady: true, userId: USER_A, profileState: null })).toBe('profile-status');
  });

  it('un fallo de red NO manda al onboarding a un usuario existente', () => {
    const state: ProfileState = { status: 'error', userId: USER_A, message: 'Network request failed' };
    expect(resolveRoute({ authReady: true, userId: USER_A, profileState: state })).toBe('profile-status');
  });

  it('perfil ausente es un estado recuperable, no onboarding', () => {
    const state: ProfileState = { status: 'missing', userId: USER_A };
    expect(resolveRoute({ authReady: true, userId: USER_A, profileState: state })).toBe('profile-status');
  });

  it('perfil sin onboarded_at confirmado va a onboarding', () => {
    const state: ProfileState = { status: 'loaded', userId: USER_A, profile: profile() };
    expect(resolveRoute({ authReady: true, userId: USER_A, profileState: state })).toBe('onboarding');
  });

  it('solo entra al inicio con onboarded_at confirmado', () => {
    const state: ProfileState = {
      status: 'loaded',
      userId: USER_A,
      profile: profile({ onboarded_at: '2026-10-24T10:00:00Z' }),
    };
    expect(resolveRoute({ authReady: true, userId: USER_A, profileState: state })).toBe('app');
  });

  it('al cambiar de usuario no reutiliza el perfil del anterior', () => {
    const stateOfA: ProfileState = {
      status: 'loaded',
      userId: USER_A,
      profile: profile({ onboarded_at: '2026-10-24T10:00:00Z' }),
    };
    expect(resolveRoute({ authReady: true, userId: USER_B, profileState: stateOfA })).toBe('profile-status');
    expect(profileStateFor(USER_B, stateOfA)).toEqual({ status: 'loading', userId: USER_B });
  });
});

describe('toProfileState', () => {
  it('conserva el tipo de resultado', () => {
    expect(toProfileState(USER_A, { status: 'missing' })).toEqual({ status: 'missing', userId: USER_A });
    expect(toProfileState(USER_A, { status: 'error', message: 'timeout' })).toEqual({
      status: 'error',
      userId: USER_A,
      message: 'timeout',
    });
  });

  it('un reintento exitoso tras un error deja el perfil cargado', () => {
    const failed = toProfileState(USER_A, { status: 'error', message: 'timeout' });
    expect(resolveRoute({ authReady: true, userId: USER_A, profileState: failed })).toBe('profile-status');
    const retried = toProfileState(USER_A, { status: 'loaded', profile: profile() });
    expect(resolveRoute({ authReady: true, userId: USER_A, profileState: retried })).toBe('onboarding');
  });
});
