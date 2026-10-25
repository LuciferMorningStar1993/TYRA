import * as WebBrowser from 'expo-web-browser';

import {
  acceptInvite,
  authRedirectUrl,
  INVITE_ONLY_MESSAGE,
  completeAuthRedirect,
  parseAuthRedirect,
  requestPasswordReset,
  resendConfirmation,
  signInWithGoogle,
  signInWithPassword,
  signUp,
  updatePassword,
} from './auth';
import { supabase } from './supabase';

jest.mock('expo-linking', () => ({ createURL: (path: string) => `tyra://${path}` }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn(), openAuthSessionAsync: jest.fn() }));
jest.mock('./supabase', () => ({
  supabaseConfig: { mode: 'normal', url: 'http://test.invalid', publishableKey: 'test' },
  supabase: {
    auth: {
      signUp: jest.fn(),
      resend: jest.fn(),
      signInWithPassword: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn(),
      signInWithOAuth: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      verifyOtp: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn(),
    },
    functions: { invoke: jest.fn() },
  },
}));

const auth = jest.mocked(supabase.auth);
const invoke = jest.mocked(supabase.functions.invoke);
const REDIRECT = 'tyra://auth/callback';

const SIGN_UP_INPUT = {
  displayName: 'Ana',
  email: 'ana@example.com',
  phone: null,
  password: 'Prueba2026',
  gender: null,
  palette: 'aurora' as const,
};

beforeEach(() => jest.clearAllMocks());

it('todos los enlaces de Auth vuelven a /auth/callback', () => {
  expect(authRedirectUrl()).toBe(REDIRECT);
});

describe('signUp', () => {
  it('sin sesión (confirmación activa): pide revisar el correo y manda el redirect concreto', async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: { identities: [{}] }, session: null }, error: null } as never);
    await expect(signUp(SIGN_UP_INPUT)).resolves.toEqual({ status: 'check_email', email: 'ana@example.com' });
    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ emailRedirectTo: REDIRECT }) }),
    );
  });

  it('correo ya registrado: mismo resultado, sin revelar que existe', async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: { identities: [] }, session: null }, error: null } as never);
    await expect(signUp(SIGN_UP_INPUT)).resolves.toEqual({ status: 'check_email', email: 'ana@example.com' });
  });

  it('solo con sesión real se considera dentro', async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: {}, session: { access_token: 'x' } }, error: null } as never);
    await expect(signUp(SIGN_UP_INPUT)).resolves.toEqual({ status: 'signed_in' });
  });

  it('error del servidor', async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'Password is too weak' } } as never);
    await expect(signUp(SIGN_UP_INPUT)).resolves.toEqual({ status: 'error', error: expect.stringMatching(/débil/) });
  });
});

describe('resendConfirmation', () => {
  it('reenvía el correo de registro con el mismo redirect', async () => {
    auth.resend.mockResolvedValueOnce({ data: {}, error: null } as never);
    await expect(resendConfirmation('ana@example.com')).resolves.toEqual({ error: null });
    expect(auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'ana@example.com',
      options: { emailRedirectTo: REDIRECT },
    });
  });

  it('límite de envíos: mensaje comprensible', async () => {
    auth.resend.mockResolvedValueOnce({
      data: {},
      error: { message: 'For security purposes, you can only request this after 42 seconds.' },
    } as never);
    await expect(resendConfirmation('ana@example.com')).resolves.toEqual({
      error: expect.stringMatching(/Demasiados intentos/),
    });
  });
});

describe('signInWithPassword', () => {
  it('correo sin confirmar: lo indica para ofrecer el reenvío', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    } as never);
    await expect(signInWithPassword({ kind: 'email', email: 'ana@example.com' }, 'x')).resolves.toEqual({
      error: expect.stringMatching(/confirmas tu correo/),
      needsEmailConfirmation: true,
    });
  });

  it('teléfono con correo sin confirmar (403 de la Edge Function)', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { context: { json: async () => ({ error: 'email_not_confirmed' }) } },
    } as never);
    const result = await signInWithPassword({ kind: 'phone', phone: '+525512345678' }, 'x');
    expect(result.needsEmailConfirmation).toBe(true);
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('teléfono con credenciales inválidas: mensaje genérico', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { context: { json: async () => ({ error: 'invalid_credentials' }) } },
    } as never);
    await expect(signInWithPassword({ kind: 'phone', phone: '+525512345678' }, 'x')).resolves.toEqual({
      error: 'Correo, teléfono o contraseña incorrectos.',
    });
  });
});

describe('parseAuthRedirect', () => {
  it('lee query y fragmento', () => {
    expect(parseAuthRedirect('tyra://auth/callback?code=abc')).toEqual({ code: 'abc' });
    expect(
      parseAuthRedirect('http://localhost:8082/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'),
    ).toEqual({ error: 'access_denied', error_code: 'otp_expired', error_description: 'Email link is invalid' });
  });
});

describe('completeAuthRedirect', () => {
  it('code válido: crea la sesión (PKCE)', async () => {
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: {}, error: null } as never);
    await expect(completeAuthRedirect('tyra://auth/callback?code=abc')).resolves.toEqual({
      status: 'signed_in',
      kind: 'sign_in',
    });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc', undefined);
  });

  it('con sb_flow_id: intercambia con el verificador de ESE flujo', async () => {
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: {}, error: null } as never);
    await completeAuthRedirect('tyra://auth/callback?sb_flow_id=a1b2c3d4e5f60718&code=abc');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc', { flowId: 'a1b2c3d4e5f60718' });
  });

  it('enlace expirado o usado', async () => {
    await expect(
      completeAuthRedirect('tyra://auth/callback#error=access_denied&error_code=otp_expired'),
    ).resolves.toMatchObject({ status: 'error', reason: 'expired' });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('sin verificador PKCE (otro dispositivo): explica que puede iniciar sesión', async () => {
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: {}, error: { message: 'invalid flow state' } } as never);
    await expect(completeAuthRedirect('tyra://auth/callback?code=abc')).resolves.toMatchObject({
      status: 'error',
      reason: 'exchange_failed',
      message: expect.stringMatching(/mismo dispositivo y navegador/),
    });
  });

  it('sin code', async () => {
    await expect(completeAuthRedirect('tyra://auth/callback')).resolves.toMatchObject({ reason: 'missing_code' });
  });
});

describe('signInWithGoogle (navegador + PKCE)', () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  afterAll(() => fetchMock.mockRestore());

  it('proveedor desactivado: mensaje claro sin abrir el navegador', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ external: { google: false } }) } as Response);
    await expect(signInWithGoogle()).resolves.toEqual({ error: expect.stringMatching(/no está configurado/) });
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('cancelar no muestra error', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ external: { google: true } }) } as Response);
    auth.signInWithOAuth.mockResolvedValueOnce({ data: { url: 'https://accounts.example' }, error: null } as never);
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({ type: 'cancel' } as WebBrowser.WebBrowserAuthSessionResult);
    await expect(signInWithGoogle()).resolves.toEqual({ error: null });
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    });
  });

  it('éxito: intercambia el code', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ external: { google: true } }) } as Response);
    auth.signInWithOAuth.mockResolvedValueOnce({ data: { url: 'https://accounts.example' }, error: null } as never);
    jest
      .mocked(WebBrowser.openAuthSessionAsync)
      .mockResolvedValueOnce({ type: 'success', url: `${REDIRECT}?sb_flow_id=ffff0000ffff0000&code=g1` });
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: {}, error: null } as never);
    await expect(signInWithGoogle()).resolves.toEqual({ error: null });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('g1', { flowId: 'ffff0000ffff0000' });
  });
});

describe('requestPasswordReset (respuesta genérica)', () => {
  it('envía con el redirect de Auth', async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null } as never);
    await expect(requestPasswordReset('ana@example.com')).resolves.toEqual({ status: 'sent' });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com', { redirectTo: REDIRECT });
  });

  it('límite de envío (solo ocurre si la cuenta existe): misma respuesta que un envío', async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes…' },
    } as never);
    await expect(requestPasswordReset('ana@example.com')).resolves.toEqual({ status: 'sent' });
  });

  it('solo un fallo de red se informa aparte', async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
    } as never);
    await expect(requestPasswordReset('ana@example.com')).resolves.toMatchObject({ status: 'network_error' });
  });
});

describe('completeAuthRedirect: recuperación', () => {
  it('el tipo sale del verificador local (redirectType), no de la URL', async () => {
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: { redirectType: 'recovery' }, error: null } as never);
    await expect(completeAuthRedirect('tyra://auth/callback?code=r1')).resolves.toEqual({
      status: 'signed_in',
      kind: 'recovery',
    });
  });

  it('un parámetro type=recovery en la URL no convierte un inicio normal en recuperación', async () => {
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: { redirectType: null }, error: null } as never);
    await expect(completeAuthRedirect('tyra://auth/callback?code=r1&type=recovery')).resolves.toEqual({
      status: 'signed_in',
      kind: 'sign_in',
    });
  });
});

describe('updatePassword y política de sesiones', () => {
  it('cambia la contraseña y cierra las DEMÁS sesiones', async () => {
    auth.updateUser.mockResolvedValueOnce({ data: {}, error: null } as never);
    auth.signOut.mockResolvedValueOnce({ error: null } as never);
    await expect(updatePassword('Nueva2026x')).resolves.toEqual({ status: 'updated', otherSessionsRevoked: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'Nueva2026x' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('si no se pudieron cerrar las demás sesiones, lo informa', async () => {
    auth.updateUser.mockResolvedValueOnce({ data: {}, error: null } as never);
    auth.signOut.mockResolvedValueOnce({ error: { message: 'network' } } as never);
    await expect(updatePassword('Nueva2026x')).resolves.toEqual({ status: 'updated', otherSessionsRevoked: false });
  });

  it('misma contraseña: error claro y no se cierran sesiones', async () => {
    auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: { code: 'same_password', status: 422, message: 'New password should be different' },
    } as never);
    await expect(updatePassword('Prueba2026')).resolves.toEqual({
      status: 'error',
      error: 'La contraseña nueva debe ser distinta de la anterior.',
    });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('sesión de recuperación vencida', async () => {
    auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: { code: 'session_not_found', status: 403, message: 'Session not found' },
    } as never);
    await expect(updatePassword('Nueva2026x')).resolves.toMatchObject({ error: expect.stringMatching(/Pide uno nuevo/) });
  });
});

describe('registro cerrado por invitación', () => {
  it('signUp directo rechazado por el servidor: mensaje de invitación', async () => {
    auth.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: 'signup_disabled', status: 422, message: 'Signups not allowed for this instance' },
    } as never);
    await expect(signUp(SIGN_UP_INPUT)).resolves.toEqual({ status: 'error', error: INVITE_ONLY_MESSAGE });
  });

  it('Google con un correo sin cuenta vuelve con signup_disabled: mensaje de invitación', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      json: async () => ({ external: { google: true } }),
    } as Response);
    auth.signInWithOAuth.mockResolvedValueOnce({ data: { url: 'https://accounts.example' }, error: null } as never);
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({
      type: 'success',
      url: `${REDIRECT}?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance`,
    });
    await expect(signInWithGoogle()).resolves.toEqual({ error: INVITE_ONLY_MESSAGE });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});

describe('acceptInvite', () => {
  it('por enlace: verifyOtp con token_hash e invite', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: null } as never);
    await expect(acceptInvite({ tokenHash: 'th' })).resolves.toEqual({ status: 'accepted' });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'invite' });
  });

  it('por código: verifyOtp con correo y código', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: null } as never);
    await acceptInvite({ email: 'ana@example.com', code: '123456' });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@example.com', token: '123456', type: 'invite' });
  });

  it('expirada o reutilizada', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: { code: 'otp_expired', status: 403, message: 'expired' } } as never);
    await expect(acceptInvite({ tokenHash: 'th' })).resolves.toMatchObject({ status: 'error', reason: 'expired' });
  });

  it('inválida', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: { code: 'validation_failed', status: 400, message: 'bad' } } as never);
    await expect(acceptInvite({ email: 'ana@example.com', code: '000000' })).resolves.toMatchObject({ reason: 'invalid' });
  });

  it('sin red', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } } as never);
    await expect(acceptInvite({ tokenHash: 'th' })).resolves.toMatchObject({ reason: 'network' });
  });
});
