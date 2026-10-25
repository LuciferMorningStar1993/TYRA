import { act, type ReactElement } from 'react';
import type { Root } from 'test-renderer';

import HomeScreen from '@/app/(app)/(tabs)/index';
import WeightHistoryScreen from '@/app/(app)/peso';
import WeightGoalScreen from '@/app/(app)/peso/meta';
import { WeightCard } from '@/components/weight-card';
import { ThemeProvider } from '@/design/theme-provider';
import { loadProfile } from '@/lib/profile-api';
import { formatDateOnly } from '@/lib/profile';
import type { MonthlySummary, WeightEntry } from '@/lib/weight';
import {
  deleteWeightGoal,
  loadAllMonthlySummaries,
  loadRecentActivity,
  loadWeightOverview,
  loadWeightRange,
  setWeightGoal,
  type WeightOverview,
} from '@/lib/weight-api';
import type { WeightGoal } from '@/lib/weight-goal';
import { SessionProvider } from '@/providers/session-provider';
import { WeightProvider } from '@/providers/weight-provider';
import { emitAuth, resetFakeAuth, sessionFor } from '@/test-utils/fake-supabase';
import { installMemoryStorage } from '@/test-utils/memory-storage';
import { allText, byLabel, flush, press, profileFixture, render } from '@/test-utils/render';

jest.mock('@/lib/supabase', () => jest.requireActual('@/test-utils/fake-supabase'));
jest.mock('@/lib/profile-api', () => ({ loadProfile: jest.fn(), saveProfile: jest.fn() }));
jest.mock('@/lib/weight-api', () => ({
  ...jest.requireActual('@/lib/weight-api'),
  loadWeightOverview: jest.fn(),
  loadWeightRange: jest.fn(),
  loadRecentActivity: jest.fn(),
  loadAllMonthlySummaries: jest.fn(),
  setWeightGoal: jest.fn(),
  deleteWeightGoal: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  Stack: { Screen: () => null },
}));

function entry(measuredOn: string, weightKg: number, version = 1): WeightEntry {
  return {
    id: `id-${measuredOn}`,
    measuredOn,
    weightKg,
    origin: 'manual',
    version,
    createdAt: `${measuredOn}T12:00:00Z`,
    updatedAt: `${measuredOn}T12:00:00Z`,
  };
}

const GOAL: WeightGoal = {
  id: 'g2',
  targetWeightKg: 68,
  startWeightKg: 72,
  startMeasuredOn: '2026-10-10',
  startEntryId: 'id-2026-10-10',
  startEntryVersion: 1,
  version: 3,
  setAt: '2026-10-10T12:00:00Z',
  updatedAt: '2026-10-12T12:00:00Z',
};

function overview(extra: Partial<WeightOverview> = {}) {
  return {
    status: 'ok' as const,
    data: { recent: [entry('2026-10-20', 70)], hasMore: false, legacy: null, monthly: [], goal: null, goalStartEntry: null, ...extra },
  };
}

async function renderScreen(screen: ReactElement, extra: Partial<WeightOverview> = {}, birthDate = '1990-05-01') {
  jest.mocked(loadProfile).mockResolvedValue({
    status: 'loaded',
    profile: profileFixture({
      sex: 'female',
      birth_date: birthDate,
      height_cm: 165,
      activity_level: 'moderate',
      goal: 'lose',
      onboarded_at: '2026-10-01T15:00:00Z',
    }),
  });
  jest.mocked(loadWeightOverview).mockResolvedValue(overview(extra));
  const root = await render(
    <SessionProvider>
      <ThemeProvider>
        <WeightProvider>{screen}</WeightProvider>
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
const type = (root: Root, label: string, text: string) => act(async () => one(root, label).props.onChangeText(text));

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeAuth();
  installMemoryStorage();
  jest.mocked(loadWeightRange).mockResolvedValue({ status: 'ok', data: [] });
  jest.mocked(loadRecentActivity).mockResolvedValue({ status: 'ok', data: { items: [], hasMore: false } });
});

describe('Meta de peso', () => {
  it('crear: no envía id ni versión; el punto de partida lo fija el servidor', async () => {
    const root = await renderScreen(<WeightGoalScreen />);
    expect(allText(root.container)).toMatch(/Tu punto de partida será tu medición más reciente: 70 kg/);
    jest.mocked(setWeightGoal).mockResolvedValueOnce({ status: 'ok', goal: GOAL });
    await type(root, 'Peso meta (kg)', '68');
    expect(allText(root.container)).toMatch(/IMC de 25 \(sobrepeso, OMS\)/);
    await press(one(root, 'Guardar meta'));
    await flush();
    expect(setWeightGoal).toHaveBeenCalledWith({ targetKg: 68, goal: undefined, resetStart: false });
    expect(loadWeightOverview).toHaveBeenCalledTimes(2); // recarga tras guardar
  });

  it('editar envía el id y la versión leídos; un conflicto recarga y lo explica', async () => {
    const root = await renderScreen(<WeightGoalScreen />, { goal: GOAL, goalStartEntry: entry('2026-10-10', 72) });
    expect(one(root, 'Peso meta (kg)').props.value).toBe('68');
    jest.mocked(setWeightGoal).mockResolvedValueOnce({ status: 'goal_conflict' });
    await type(root, 'Peso meta (kg)', '67');
    await press(one(root, 'Guardar cambios'));
    await flush();
    expect(setWeightGoal).toHaveBeenCalledWith({ targetKg: 67, goal: GOAL, resetStart: false });
    expect(allText(root.container)).toMatch(/cambió en otro dispositivo/);
    expect(loadWeightOverview).toHaveBeenCalledTimes(2);
  });

  it('meta eliminada en otro dispositivo: lo explica y NO intenta recrearla', async () => {
    const root = await renderScreen(<WeightGoalScreen />, { goal: GOAL, goalStartEntry: entry('2026-10-10', 72) });
    jest.mocked(setWeightGoal).mockResolvedValueOnce({ status: 'goal_missing' });
    jest.mocked(loadWeightOverview).mockResolvedValue(overview()); // ya no hay meta
    await type(root, 'Peso meta (kg)', '66');
    await press(one(root, 'Guardar cambios'));
    await flush();
    expect(setWeightGoal).toHaveBeenCalledTimes(1);
    expect(allText(root.container)).toMatch(/se eliminó en otro dispositivo/);
    expect(byLabel(root, 'Guardar meta')).toHaveLength(1); // ofrece crear de forma explícita
  });

  it('eliminar pide confirmación y envía id + versión', async () => {
    const root = await renderScreen(<WeightGoalScreen />, { goal: GOAL, goalStartEntry: entry('2026-10-10', 72) });
    await press(one(root, 'Eliminar meta'));
    expect(deleteWeightGoal).not.toHaveBeenCalled();
    jest.mocked(deleteWeightGoal).mockResolvedValueOnce({ status: 'deleted' });
    await press(one(root, 'Sí, eliminar meta'));
    await flush();
    expect(deleteWeightGoal).toHaveBeenCalledWith(GOAL);
  });

  it('reiniciar muestra el nuevo punto de partida antes de confirmar', async () => {
    const root = await renderScreen(<WeightGoalScreen />, { goal: GOAL, goalStartEntry: entry('2026-10-10', 72) });
    await press(one(root, 'Reiniciar punto de partida'));
    expect(allText(root.container)).toMatch(/Tu nuevo punto de partida será 70 kg/);
    jest.mocked(setWeightGoal).mockResolvedValueOnce({ status: 'ok', goal: { ...GOAL, version: 4 } });
    await press(one(root, 'Sí, reiniciar'));
    await flush();
    expect(setWeightGoal).toHaveBeenCalledWith({ targetKg: 68, goal: GOAL, resetStart: true });
  });

  it('partida corregida y sin medición posterior: aviso y sin barra de avance', async () => {
    const root = await renderScreen(<WeightGoalScreen />, {
      recent: [entry('2026-10-10', 71.8, 2)],
      goal: GOAL,
      goalStartEntry: entry('2026-10-10', 71.8, 2),
    });
    expect(allText(root.container)).toMatch(/se corrigió \(antes 72 kg, ahora 71\.8 kg\)/);
    expect(allText(root.container)).toMatch(/Registra una medición posterior/);
    expect(root.container.queryAll((node) => node.props.accessibilityRole === 'progressbar')).toHaveLength(0);
  });

  it('con avance real: barra accesible con el porcentaje', async () => {
    const root = await renderScreen(<WeightGoalScreen />, { goal: GOAL, goalStartEntry: entry('2026-10-10', 72) });
    const [bar] = root.container.queryAll((node) => node.props.accessibilityRole === 'progressbar');
    expect(bar.props).toMatchObject({ 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 50 });
  });

  it('menor de 20 años: explicación, sin formulario ni cálculos', async () => {
    const root = await renderScreen(<WeightGoalScreen />, {}, '2010-01-01');
    expect(allText(root.container)).toMatch(/disponible desde los 20 años/);
    expect(byLabel(root, 'Peso meta (kg)')).toHaveLength(0);
  });
});

describe('Tarjeta, Inicio e historial', () => {
  it('la tarjeta Peso muestra el avance y «Ver meta»', async () => {
    const root = await renderScreen(<WeightCard />, { goal: GOAL, goalStartEntry: entry('2026-10-10', 72) });
    expect(allText(root.container)).toMatch(/avanzaste 2 kg de 4 kg; te faltan 2 kg/);
    expect(byLabel(root, 'Ver meta')).toHaveLength(1);
  });

  it('Inicio no cambia: no muestra la meta', async () => {
    const root = await renderScreen(<HomeScreen />, { goal: GOAL, goalStartEntry: entry('2026-10-10', 72) });
    expect(allText(root.container)).not.toMatch(/Meta 68 kg|avanzaste|Ver meta/);
  });

  it('«Todo» usa promedios mensuales aunque haya solo 2 meses, con leyenda y agrupación por año', async () => {
    const month = (m: string, averageKg: number): MonthlySummary => ({
      month: m,
      entries: 2,
      averageKg,
      firstMeasuredOn: m,
      firstWeightKg: averageKg,
      lastMeasuredOn: m,
      lastWeightKg: averageKg,
      changeKg: 0,
    });
    // Meses relativos a hoy (la prueba no depende de la fecha): hace 2 meses y el actual; el de en medio, sin datos.
    const now = new Date();
    const key = (offset: number) => formatDateOnly(new Date(now.getFullYear(), now.getMonth() - offset, 1));
    jest.mocked(loadAllMonthlySummaries).mockResolvedValue({ status: 'ok', data: [month(key(2), 73), month(key(0), 71)] });
    const root = await renderScreen(<WeightHistoryScreen />, { goal: GOAL, goalStartEntry: entry('2026-10-10', 72) });
    await press(one(root, 'Todo'));
    await flush();
    expect(loadAllMonthlySummaries).toHaveBeenCalledWith('user-a');
    const text = allText(root.container);
    expect(text).toMatch(/Promedio mensual/);
    expect(text).toMatch(/○ Promedio mensual · ● Medición/);
    expect(byLabel(root, /2 de 3 meses con datos; los meses sin datos interrumpen la línea/)).toHaveLength(1);
    expect(byLabel(root, /^\d{4}: \d de \d meses con datos$/).length).toBeGreaterThanOrEqual(1);
  });
});

it('tras un conflicto, el campo muestra la meta vigente recargada', async () => {
  const root = await renderScreen(<WeightGoalScreen />, { goal: GOAL, goalStartEntry: entry('2026-10-10', 72) });
  jest.mocked(setWeightGoal).mockResolvedValueOnce({ status: 'goal_conflict' });
  jest.mocked(loadWeightOverview).mockResolvedValue(overview({ goal: { ...GOAL, targetWeightKg: 66, version: 4 }, goalStartEntry: entry('2026-10-10', 72) }));
  await type(root, 'Peso meta (kg)', '65');
  await press(one(root, 'Guardar cambios'));
  await flush();
  expect(allText(root.container)).toMatch(/cambió en otro dispositivo/);
  expect(one(root, 'Peso meta (kg)').props.value).toBe('66');
});
