import * as Linking from 'expo-linking';
import { act } from 'react';
import type { Root } from 'test-renderer';

import AcceptInviteScreen from '@/app/accept-invite';
import AuthCallbackScreen from '@/app/auth/callback';
import ResetPasswordScreen from '@/app/reset-password';
import { PhoneAliasCard, phoneAliasSaveError } from '@/components/phone-alias-card';
import { ThemeProvider } from '@/design/theme-provider';
import { acceptInvite, completeAuthRedirect, updatePassword } from '@/lib/auth';
import { loadProfile, saveProfile } from '@/lib/profile-api';
import { SessionProvider, useSession } from '@/providers/session-provider';
import { emitAuth, resetFakeAuth, sessionFor } from '@/test-utils/fake-supabase';
import { installMemoryStorage } from '@/test-utils/memory-storage';
import { allText, byLabel, createProbe, flush, press, profileFixture, render } from '@/test-utils/render';

jest.mock('@/lib/supabase', () => jest.requireActual('@/test-utils/fake-supabase'));
jest.mock('@/lib/profile-api', () => ({ loadProfile: jest.fn(), saveProfile: jest.fn() }));
jest.mock('@/lib/auth', () => ({
  acceptInvite: jest.fn(),
  completeAuthRedirect: jest.fn(),
  updatePassword: jest.fn(),
  parseAuthRedirect: (url: string) => jest.requireActual('@/lib/auth').parseAuthRedirect(url),
}));
jest.mock('expo-linking', () => ({ useLinkingURL: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: () => null,
}));

const session = createProbe(useSession);
const one = (root: Root, label: string | RegExp) => {
  const [match] = byLabel(root, label);
  if (!match) throw new Error(`No se encontró "${label}"`);
  return match;
};
const type = (root: Root, label: string, text: string) => act(async () => one(root, label).props.onChangeText(text));

function withProviders(screen: React.ReactElement) {
  return render(
    <SessionProvider>
      <ThemeProvider>
        <session.Probe />
        {screen}
      </ThemeProvider>
    </SessionProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeAuth();
  installMemoryStorage();
});

describe('enlace de invitación', () => {
  it('abrirlo NO consume la invitación: solo al pulsar «Aceptar invitación»', async () => {
    jest.mocked(Linking.useLinkingURL).mockReturnValue('tyra://auth/callback?token_hash=th-123&type=invite');
    jest.mocked(acceptInvite).mockResolvedValueOnce({ status: 'accepted' });
    const root = await withProviders(<AuthCallbackScreen />);
    await flush();

    expect(allText(root.container)).toMatch(/Confirma que quieres activar tu cuenta/);
    expect(acceptInvite).not.toHaveBeenCalled();
    expect(completeAuthRedirect).not.toHaveBeenCalled();

    await press(one(root, 'Aceptar invitación'));
    await flush();
    expect(acceptInvite).toHaveBeenCalledWith({ tokenHash: 'th-123' });
  });

  it('invitación vencida o reutilizada: lo explica y ofrece iniciar sesión', async () => {
    jest.mocked(Linking.useLinkingURL).mockReturnValue('tyra://auth/callback?token_hash=th-123&type=invite');
    jest.mocked(acceptInvite).mockResolvedValueOnce({
      status: 'error',
      reason: 'expired',
      message: 'La invitación venció o ya se usó.',
    });
    const root = await withProviders(<AuthCallbackScreen />);
    await press(one(root, 'Aceptar invitación'));
    await flush();
    expect(allText(root.container)).toMatch(/venció o ya se usó/);
    expect(byLabel(root, 'Ir a iniciar sesión')).toHaveLength(1);
  });

  it('otros enlaces de Auth se siguen procesando como antes', async () => {
    jest.mocked(Linking.useLinkingURL).mockReturnValue('tyra://auth/callback?code=abc');
    jest.mocked(completeAuthRedirect).mockResolvedValueOnce({ status: 'signed_in', kind: 'sign_in' });
    await withProviders(<AuthCallbackScreen />);
    await flush();
    expect(completeAuthRedirect).toHaveBeenCalledWith('tyra://auth/callback?code=abc');
  });
});

describe('«Tengo un código de invitación»', () => {
  it('valida correo y código antes de llamar al servidor', async () => {
    const root = await withProviders(<AcceptInviteScreen />);
    await press(one(root, 'Aceptar invitación'));
    expect(acceptInvite).not.toHaveBeenCalled();
    expect(allText(root.container)).toMatch(/correo al que llegó la invitación/);
    expect(allText(root.container)).toMatch(/código numérico/);
  });

  it('envía correo normalizado y código', async () => {
    jest.mocked(acceptInvite).mockResolvedValueOnce({ status: 'accepted' });
    const root = await withProviders(<AcceptInviteScreen />);
    await type(root, 'Correo', ' Ana@Example.com ');
    await type(root, 'Código de invitación', '12 34 56');
    await press(one(root, 'Aceptar invitación'));
    await flush();
    expect(acceptInvite).toHaveBeenCalledWith({ email: 'ana@example.com', code: '123456' });
  });
});

describe('«Crea tu contraseña» tras aceptar', () => {
  it('modo invitación: textos de activación, no de recuperación', async () => {
    jest.mocked(loadProfile).mockResolvedValue({ status: 'loaded', profile: profileFixture({ id: 'user-inv' }) });
    jest.mocked(acceptInvite).mockImplementationOnce(async () => {
      emitAuth('SIGNED_IN', sessionFor('user-inv'));
      return { status: 'accepted' };
    });
    jest.mocked(updatePassword).mockResolvedValueOnce({ status: 'updated', otherSessionsRevoked: true });
    function ResetWhenRouted() {
      const { route } = useSession();
      return route === 'reset-password' ? <ResetPasswordScreen /> : null;
    }
    const root = await withProviders(<ResetWhenRouted />);
    await act(async () => {
      await session.value.acceptInvite({ tokenHash: 'th' });
    });
    await flush();
    expect(allText(root.container)).toMatch(/Crea tu contraseña/);
    expect(allText(root.container)).toMatch(/Tu correo ya está verificado/);

    await type(root, 'Contraseña nueva', 'Primera2026x');
    await type(root, 'Confirmar contraseña nueva', 'Primera2026x');
    await press(one(root, 'Guardar contraseña'));
    await flush();
    expect(allText(root.container)).toMatch(/Cuenta activada/);
    expect(allText(root.container)).not.toMatch(/demás dispositivos/);
  });
});

describe('alias de teléfono en Perfil', () => {
  async function renderCard(phone: string | null = null) {
    jest.mocked(loadProfile).mockResolvedValue({
      status: 'loaded',
      profile: profileFixture({ id: 'user-a', phone, onboarded_at: '2026-10-24T10:00:00Z' }),
    });
    const root = await withProviders(<PhoneAliasCardWhenLoaded />);
    await act(async () => emitAuth('SIGNED_IN', sessionFor('user-a')));
    await flush();
    return root;
  }
  function PhoneAliasCardWhenLoaded() {
    const { profile } = useSession();
    return profile ? <PhoneAliasCard /> : null;
  }

  it('se presenta como alias no verificado', async () => {
    const root = await renderCard();
    expect(byLabel(root, 'Teléfono (alias no verificado)')).toHaveLength(1);
    expect(allText(root.container)).toMatch(/No lo verificamos por SMS/);
  });

  it('valida el formato y guarda normalizado con la sesión del dueño', async () => {
    jest.mocked(saveProfile).mockResolvedValueOnce({ ok: true, profile: profileFixture({ phone: '+525512345678' }) });
    const root = await renderCard();
    await type(root, 'Teléfono (alias no verificado)', '123');
    await press(one(root, 'Guardar alias'));
    expect(saveProfile).not.toHaveBeenCalled();
    expect(allText(root.container)).toMatch(/Usa 10 dígitos/);

    await type(root, 'Teléfono (alias no verificado)', '55 1234 5678');
    await press(one(root, 'Guardar alias'));
    await flush();
    expect(saveProfile).toHaveBeenCalledWith('user-a', { phone: '+525512345678' });
    expect(allText(root.container)).toMatch(/Alias guardado/);
  });

  it('teléfono ya usado por otra cuenta: mensaje claro', async () => {
    jest.mocked(saveProfile).mockResolvedValueOnce({
      ok: false,
      error: 'duplicate key value violates unique constraint "profiles_phone_key"',
    });
    const root = await renderCard();
    await type(root, 'Teléfono (alias no verificado)', '5512345678');
    await press(one(root, 'Guardar alias'));
    await flush();
    expect(allText(root.container)).toMatch(/ya es alias de otra cuenta/);
  });

  it('mapea errores de guardado', () => {
    expect(phoneAliasSaveError('violates check constraint')).toMatch(/formato/);
    expect(phoneAliasSaveError('no_row')).toMatch(/sesión/);
  });
});
