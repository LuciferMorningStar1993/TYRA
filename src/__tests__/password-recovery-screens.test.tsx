import { act } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { Root } from 'test-renderer';

import ForgotPasswordScreen, { RESET_SENT_MESSAGE } from '@/app/forgot-password';
import ResetPasswordScreen from '@/app/reset-password';
import { ThemeProvider } from '@/design/theme-provider';
import { requestPasswordReset, updatePassword } from '@/lib/auth';
import { loadProfile } from '@/lib/profile-api';
import { SessionProvider, useSession } from '@/providers/session-provider';
import { emitAuth, resetFakeAuth, sessionFor } from '@/test-utils/fake-supabase';
import { installMemoryStorage } from '@/test-utils/memory-storage';
import { allText, byLabel, createProbe, flush, press, profileFixture, render } from '@/test-utils/render';

jest.mock('@/lib/supabase', () => jest.requireActual('@/test-utils/fake-supabase'));
jest.mock('@/lib/profile-api', () => ({ loadProfile: jest.fn(), saveProfile: jest.fn() }));
jest.mock('@/lib/auth', () => ({
  AUTH_EMAIL_COOLDOWN_SECONDS: 60,
  requestPasswordReset: jest.fn(),
  updatePassword: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

const session = createProbe(useSession);

const one = (root: Root, label: string | RegExp) => {
  const [match] = byLabel(root, label);
  if (!match) throw new Error(`No se encontró "${label}"`);
  return match;
};
const type = (root: Root, label: string, text: string) => act(async () => one(root, label).props.onChangeText(text));

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeAuth();
  installMemoryStorage();
});

describe('«Olvidé mi contraseña»', () => {
  async function renderForgot() {
    return render(
      <SessionProvider>
        <ThemeProvider>
          <ForgotPasswordScreen />
        </ThemeProvider>
      </SessionProvider>,
    );
  }

  it('valida el correo antes de enviar', async () => {
    const root = await renderForgot();
    await press(one(root, 'Enviar enlace'));
    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(allText(root.container)).toMatch(/correo válido/);
  });

  it('respuesta genérica: mismo texto exista o no la cuenta', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ email: 'ana@example.com' });
    jest.mocked(requestPasswordReset).mockResolvedValueOnce({ status: 'sent' });
    const root = await renderForgot();
    await press(one(root, 'Enviar enlace'));
    await flush();
    expect(requestPasswordReset).toHaveBeenCalledWith('ana@example.com');
    expect(allText(root.container)).toContain(RESET_SENT_MESSAGE);
    expect(RESET_SENT_MESSAGE).toMatch(/^Si hay una cuenta/);
    // Espera antes de volver a enviar.
    expect(byLabel(root, /^Enviar de nuevo en \d+ s$/)).toHaveLength(1);
  });

  it('fallo de red: lo dice (no es información sobre la cuenta)', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ email: 'ana@example.com' });
    jest.mocked(requestPasswordReset).mockResolvedValueOnce({ status: 'network_error', message: 'Sin conexión.' });
    const root = await renderForgot();
    await press(one(root, 'Enviar enlace'));
    await flush();
    expect(allText(root.container)).toMatch(/Sin conexión/);
    expect(allText(root.container)).not.toContain(RESET_SENT_MESSAGE);
  });
});

describe('contraseña nueva (sesión de recuperación)', () => {
  async function renderRecovered() {
    jest.mocked(loadProfile).mockResolvedValueOnce({
      status: 'loaded',
      profile: profileFixture({ onboarded_at: '2026-10-24T10:00:00Z' }),
    });
    function ResetWhenRouted() {
      const { route } = useSession();
      return route === 'reset-password' ? <ResetPasswordScreen /> : null;
    }
    const root = await render(
      <SessionProvider>
        <ThemeProvider>
          <session.Probe />
          <ResetWhenRouted />
        </ThemeProvider>
      </SessionProvider>,
    );
    await act(async () => emitAuth('PASSWORD_RECOVERY', sessionFor('user-a')));
    await flush();
    return root;
  }

  it('solo existe con una sesión de recuperación', async () => {
    jest.mocked(loadProfile).mockResolvedValueOnce({
      status: 'loaded',
      profile: profileFixture({ onboarded_at: '2026-10-24T10:00:00Z' }),
    });
    function ResetWhenRouted() {
      const { route } = useSession();
      return route === 'reset-password' ? <ResetPasswordScreen /> : null;
    }
    const root = await render(
      <SessionProvider>
        <ThemeProvider>
          <ResetWhenRouted />
        </ThemeProvider>
      </SessionProvider>,
    );
    await act(async () => emitAuth('SIGNED_IN', sessionFor('user-a')));
    await flush();
    expect(byLabel(root, 'Contraseña nueva')).toHaveLength(0);
  });

  it('valida longitud, letras+números y que coincidan, sin llamar al servidor', async () => {
    const root = await renderRecovered();
    await type(root, 'Contraseña nueva', 'corta');
    await type(root, 'Confirmar contraseña nueva', 'otra');
    await press(one(root, 'Guardar contraseña'));
    expect(updatePassword).not.toHaveBeenCalled();
    expect(allText(root.container)).toMatch(/al menos 8 caracteres/);
    expect(allText(root.container)).toMatch(/no coinciden/);
  });

  it('error del servidor (misma contraseña): visible y sigue en la pantalla', async () => {
    jest.mocked(updatePassword).mockResolvedValueOnce({
      status: 'error',
      error: 'La contraseña nueva debe ser distinta de la anterior.',
    });
    const root = await renderRecovered();
    await type(root, 'Contraseña nueva', 'Prueba2026');
    await type(root, 'Confirmar contraseña nueva', 'Prueba2026');
    await press(one(root, 'Guardar contraseña'));
    await flush();
    expect(allText(root.container)).toMatch(/distinta de la anterior/);
    expect(session.value.route).toBe('reset-password');
  });

  it('éxito: informa la política de sesiones y al continuar sale del modo recuperación', async () => {
    jest.mocked(updatePassword).mockResolvedValueOnce({ status: 'updated', otherSessionsRevoked: true });
    const root = await renderRecovered();
    await type(root, 'Contraseña nueva', 'Nueva2026x');
    await type(root, 'Confirmar contraseña nueva', 'Nueva2026x');
    await press(one(root, 'Guardar contraseña'));
    await flush();
    expect(updatePassword).toHaveBeenCalledWith('Nueva2026x');
    expect(allText(root.container)).toMatch(/Cerramos tu sesión en los demás dispositivos; puede tardar hasta una hora/);
    expect(session.value.route).toBe('reset-password'); // aún no sale hasta confirmar

    await press(one(root, 'Continuar'));
    expect(session.value.route).toBe('app');
  });

  it('si no se cerraron las demás sesiones, lo advierte', async () => {
    jest.mocked(updatePassword).mockResolvedValueOnce({ status: 'updated', otherSessionsRevoked: false });
    const root = await renderRecovered();
    await type(root, 'Contraseña nueva', 'Nueva2026x');
    await type(root, 'Confirmar contraseña nueva', 'Nueva2026x');
    await press(one(root, 'Guardar contraseña'));
    await flush();
    const text = allText(root.container);
    expect(text).toMatch(/Contraseña actualizada/);
    expect(text).toMatch(/Tu contraseña sí cambió, pero no pudimos confirmar que se cerró tu sesión/);
    expect(text).not.toMatch(/Cerramos tu sesión/);
  });
});
