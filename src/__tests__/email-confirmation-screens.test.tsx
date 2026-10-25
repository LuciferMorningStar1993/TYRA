import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { act, type ReactElement } from 'react';
import type { Root } from 'test-renderer';

import AuthCallbackScreen from '@/app/auth/callback';
import CheckEmailScreen, { RESEND_COOLDOWN_SECONDS } from '@/app/check-email';
import SignInScreen from '@/app/sign-in';
import SignUpScreen from '@/app/sign-up';
import { ThemeProvider } from '@/design/theme-provider';
import { completeAuthRedirect, resendConfirmation, signInWithPassword, signUp } from '@/lib/auth';
import { SessionProvider } from '@/providers/session-provider';
import { installMemoryStorage } from '@/test-utils/memory-storage';
import { allText, byLabel, flush, press, render } from '@/test-utils/render';

jest.mock('@/lib/supabase', () => jest.requireActual('@/test-utils/fake-supabase'));
jest.mock('@/lib/profile-api', () => ({ loadProfile: jest.fn(), saveProfile: jest.fn() }));
jest.mock('@/lib/auth', () => ({
  AUTH_EMAIL_COOLDOWN_SECONDS: 60,
  signUp: jest.fn(),
  resendConfirmation: jest.fn(),
  signInWithPassword: jest.fn(),
  signInWithGoogle: jest.fn(),
  completeAuthRedirect: jest.fn(),
  acceptInvite: jest.fn(),
  parseAuthRedirect: (url: string) => jest.requireActual('@/lib/auth').parseAuthRedirect(url),
}));
jest.mock('expo-linking', () => ({ useLinkingURL: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

function withProviders(screen: ReactElement) {
  return render(
    <SessionProvider>
      <ThemeProvider>{screen}</ThemeProvider>
    </SessionProvider>,
  );
}

const one = (root: Root, label: string | RegExp) => {
  const [match] = byLabel(root, label);
  if (!match) throw new Error(`No se encontró "${label}"`);
  return match;
};

beforeEach(() => {
  jest.clearAllMocks();
  installMemoryStorage();
});

describe('registro (cerrado por invitación)', () => {
  // Antes: el formulario de registro llevaba a «revisa tu correo». Con [auth] enable_signup = false
  // la app ya no ofrece alta pública: la pantalla solo explica la invitación y nunca llama a signUp.
  it('explica que TYRA es por invitación y no registra a nadie', async () => {
    const root = await withProviders(<SignUpScreen />);
    expect(allText(root.container)).toMatch(/TYRA es por invitación/);
    expect(byLabel(root, 'Contraseña')).toHaveLength(0);
    await press(one(root, 'Tengo un código de invitación'));
    expect(router.replace).toHaveBeenCalledWith('/accept-invite');
    expect(signUp).not.toHaveBeenCalled();
  });
});

describe('«revisa tu correo»', () => {
  afterEach(() => jest.useRealTimers());

  it('tras registrarse: espera antes de reenviar y luego reenvía', async () => {
    jest.useFakeTimers();
    jest.mocked(useLocalSearchParams).mockReturnValue({ email: 'ana@example.com', sent: '1' });
    jest.mocked(resendConfirmation).mockResolvedValueOnce({ error: null });
    const root = await withProviders(<CheckEmailScreen />);

    expect(allText(root.container)).toMatch(/Revisa tu correo/);
    expect(byLabel(root, `Reenviar enlace en ${RESEND_COOLDOWN_SECONDS} s`)).toHaveLength(1);
    await expect(press(one(root, /^Reenviar enlace en/))).rejects.toThrow(/deshabilitado/);

    for (let second = 0; second < RESEND_COOLDOWN_SECONDS; second += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    await press(one(root, 'Reenviar enlace'));
    await flush();
    expect(resendConfirmation).toHaveBeenCalledWith('ana@example.com');
    expect(allText(root.container)).toMatch(/te llegará un enlace nuevo/);
  });

  it('error al reenviar: visible', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ email: 'ana@example.com' });
    jest.mocked(resendConfirmation).mockResolvedValueOnce({ error: 'Demasiados intentos. Espera un momento.' });
    const root = await withProviders(<CheckEmailScreen />);
    await press(one(root, 'Reenviar enlace'));
    await flush();
    expect(allText(root.container)).toMatch(/Demasiados intentos/);
  });

  it('sin correo en la ruta (enlace expirado): lo pide y valida', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({});
    const root = await withProviders(<CheckEmailScreen />);
    await press(one(root, 'Reenviar enlace'));
    expect(resendConfirmation).not.toHaveBeenCalled();
    expect(allText(root.container)).toMatch(/correo válido/);

    jest.mocked(resendConfirmation).mockResolvedValueOnce({ error: null });
    await act(async () => one(root, 'Correo').props.onChangeText('Ana@Example.com '));
    await press(one(root, 'Reenviar enlace'));
    await flush();
    expect(resendConfirmation).toHaveBeenCalledWith('ana@example.com');
  });
});

describe('inicio de sesión con correo sin confirmar', () => {
  it('ofrece reenviar el enlace', async () => {
    jest.mocked(signInWithPassword).mockResolvedValueOnce({
      error: 'Aún no confirmas tu correo.',
      needsEmailConfirmation: true,
    });
    const root = await withProviders(<SignInScreen />);
    await act(async () => one(root, 'Correo o teléfono').props.onChangeText('ana@example.com'));
    await act(async () => one(root, 'Contraseña').props.onChangeText('Prueba2026'));
    await press(one(root, 'Iniciar sesión'));
    await flush();

    await press(one(root, 'Reenviar enlace de confirmación'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/check-email', params: { email: 'ana@example.com' } });
  });
});

describe('callback de Auth', () => {
  it('éxito: deja que el layout decida la ruta', async () => {
    jest.mocked(Linking.useLinkingURL).mockReturnValue('tyra://auth/callback?code=abc');
    jest.mocked(completeAuthRedirect).mockResolvedValueOnce({ status: 'signed_in', kind: 'sign_in' });
    const root = await withProviders(<AuthCallbackScreen />);
    await flush();
    expect(allText(root.container)).toMatch('redirect:/');
  });

  it('enlace expirado: explica y ofrece pedir otro', async () => {
    jest.mocked(Linking.useLinkingURL).mockReturnValue('tyra://auth/callback#error_code=otp_expired');
    jest.mocked(completeAuthRedirect).mockResolvedValueOnce({
      status: 'error',
      reason: 'expired',
      message: 'El enlace expiró o ya se usó. Pide uno nuevo.',
    });
    const root = await withProviders(<AuthCallbackScreen />);
    await flush();
    expect(allText(root.container)).toMatch(/expiró/);
    await press(one(root, 'Reenviar el enlace de confirmación'));
    expect(router.replace).toHaveBeenCalledWith('/check-email');
    await press(one(root, 'Pedir otro enlace para cambiar mi contraseña'));
    expect(router.replace).toHaveBeenCalledWith('/forgot-password');
  });

  it('otro dispositivo (sin PKCE): ofrece ambos caminos e iniciar sesión', async () => {
    jest.mocked(Linking.useLinkingURL).mockReturnValue('tyra://auth/callback?code=abc');
    jest.mocked(completeAuthRedirect).mockResolvedValueOnce({
      status: 'error',
      reason: 'exchange_failed',
      message: 'Si confirmaste tu correo, inicia sesión con tu contraseña.',
    });
    const root = await withProviders(<AuthCallbackScreen />);
    await flush();
    expect(byLabel(root, 'Pedir otro enlace para cambiar mi contraseña')).toHaveLength(1);
    await press(one(root, 'Ir a iniciar sesión'));
    expect(router.replace).toHaveBeenCalledWith('/sign-in');
  });
});
