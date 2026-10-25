import { act } from 'react';
import type { Root } from 'test-renderer';

import OnboardingScreen from '@/app/onboarding';
import { ThemeProvider, useTheme } from '@/design/theme-provider';
import type { SaveProfileResult } from '@/lib/profile-api';
import { loadProfile, saveProfile } from '@/lib/profile-api';
import { SessionProvider, useSession } from '@/providers/session-provider';
import { emitAuth, resetFakeAuth, sessionFor } from '@/test-utils/fake-supabase';
import { installMemoryStorage } from '@/test-utils/memory-storage';
import { allText, byLabel, createProbe, deferred, flush, press, profileFixture, render } from '@/test-utils/render';

jest.mock('@/lib/supabase', () => jest.requireActual('@/test-utils/fake-supabase'));
jest.mock('@/lib/profile-api', () => ({ loadProfile: jest.fn(), saveProfile: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: (props: object) => <View testID="birth-date-picker" {...props} /> };
});

const saveMock = jest.mocked(saveProfile);

const session = createProbe(useSession);
const theme = createProbe(useTheme);
/** Como el layout raíz: el onboarding solo se monta cuando la ruta lo indica. */
function OnboardingWhenRouted() {
  const { route } = useSession();
  return route === 'onboarding' ? <OnboardingScreen /> : null;
}

async function renderOnboarding(profileOverrides = {}): Promise<Root> {
  jest.mocked(loadProfile).mockResolvedValueOnce({ status: 'loaded', profile: profileFixture(profileOverrides) });
  const root = await render(
    <SessionProvider>
      <ThemeProvider>
        <session.Probe />
        <theme.Probe />
        <OnboardingWhenRouted />
      </ThemeProvider>
    </SessionProvider>,
  );
  await act(async () => emitAuth('SIGNED_IN', sessionFor('user-a')));
  await flush();
  return root;
}

const one = (root: Root, label: string | RegExp) => {
  const [match] = byLabel(root, label);
  if (!match) throw new Error(`No se encontró "${label}"`);
  return match;
};

async function type(root: Root, label: string, text: string) {
  await act(async () => one(root, label).props.onChangeText(text));
}

async function fillValidForm(root: Root) {
  await press(one(root, 'Mujer'));
  const picker = root.container.queryAll((node) => node.props.testID === 'birth-date-picker')[0];
  await act(async () => picker.props.onValueChange({}, new Date(1993, 4, 10)));
  await type(root, 'Estatura (cm)', '165');
  await type(root, 'Peso (kg)', '62,5');
  await press(one(root, 'Moderado (3-5 días)'));
  await press(one(root, 'Mantener'));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeAuth();
  installMemoryStorage();
});

it('elegir una paleta (borrador) no oculta campos y la elección explícita gana al género', async () => {
  const root = await renderOnboarding({ theme_palette: null });
  expect(byLabel(root, 'Género (opcional)')).toHaveLength(1);

  await press(one(root, 'Femenino'));
  expect(theme.value.palette).toBe('aurora'); // sugerencia

  await press(one(root, /^TYRA Nordic/));
  expect(theme.value.palette).toBe('nordic');
  expect(saveMock).not.toHaveBeenCalled(); // solo vista previa
  expect(byLabel(root, 'Género (opcional)')).toHaveLength(1);
  expect(byLabel(root, 'Paleta de colores')).toHaveLength(1);

  await press(one(root, 'Masculino'));
  expect(theme.value.palette).toBe('nordic');
});

it('un fallo conserva el formulario y muestra el error; el reintento exitoso entra al inicio', async () => {
  const root = await renderOnboarding({ theme_palette: 'indigo' });
  await fillValidForm(root);

  const firstTry = deferred<SaveProfileResult>();
  saveMock.mockReturnValueOnce(firstTry.promise);
  await press(one(root, 'Guardar y continuar'));
  expect(session.value.route).toBe('onboarding'); // guardado lento: aún no entra

  await act(async () => firstTry.resolve({ ok: false, error: 'Network request failed' }));
  expect(allText(root.container)).toMatch(/No pudimos guardar tus datos/);
  expect(one(root, 'Estatura (cm)').props.value).toBe('165');
  expect(one(root, 'Peso (kg)').props.value).toBe('62,5');
  expect(session.value.route).toBe('onboarding');
  expect(byLabel(root, 'Reintentar')).toHaveLength(1);

  saveMock.mockImplementationOnce(async (_userId, patch) => ({
    ok: true,
    profile: profileFixture({ ...patch }),
  }));
  await press(one(root, 'Reintentar'));
  expect(saveMock).toHaveBeenLastCalledWith(
    'user-a',
    expect.objectContaining({ height_cm: 165, weight_kg: 62.5, birth_date: '1993-05-10' }),
  );
  expect(session.value.route).toBe('app');
});

it('datos inválidos: no llama al servidor y marca los campos', async () => {
  const root = await renderOnboarding({ theme_palette: 'indigo' });
  await fillValidForm(root);
  await type(root, 'Estatura (cm)', '10');
  await press(one(root, 'Guardar y continuar'));
  expect(saveMock).not.toHaveBeenCalled();
  expect(allText(root.container)).toMatch(/La estatura debe estar entre 50 y 260 cm/);
});
