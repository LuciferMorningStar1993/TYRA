import { router, useLocalSearchParams } from 'expo-router';
import { act, type ReactElement } from 'react';
import type { Root } from 'test-renderer';

import HealthDataScreen from '@/app/(app)/datos-salud';
import WeightHistoryScreen from '@/app/(app)/peso';
import RegisterWeightScreen from '@/app/(app)/peso/registrar';
import { ThemeProvider } from '@/design/theme-provider';
import { HEALTH_HELP } from '@/lib/health-help';
import { loadProfile, saveProfile } from '@/lib/profile-api';
import type { WeightEntry } from '@/lib/weight';
import {
  addWeightEntry,
  deleteWeightEntry,
  loadCorrections,
  loadHistoryPage,
  loadRecentActivity,
  loadWeightEntry,
  loadWeightOverview,
  loadWeightRange,
  updateWeightEntry,
  type WeightOverview,
} from '@/lib/weight-api';
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
  loadWeightEntry: jest.fn(),
  loadWeightRange: jest.fn(),
  loadHistoryPage: jest.fn(),
  loadCorrections: jest.fn(),
  loadRecentActivity: jest.fn(),
  addWeightEntry: jest.fn(),
  updateWeightEntry: jest.fn(),
  deleteWeightEntry: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  Stack: { Screen: () => null },
}));
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: (props: object) => <View testID="date-picker" {...props} /> };
});

function entry(measuredOn: string | null, weightKg: number, version = 1): WeightEntry {
  return {
    id: `id-${measuredOn ?? 'legacy'}`,
    measuredOn,
    weightKg,
    origin: measuredOn ? 'manual' : 'legacy_profile',
    version,
    createdAt: '2026-10-20T12:00:00Z',
    updatedAt: '2026-10-20T12:00:00Z',
  };
}

function overview(recent: WeightEntry[], extra: Partial<WeightOverview> = {}) {
  return { status: 'ok' as const, data: { recent, hasMore: false, legacy: null, monthly: [], goal: null, goalStartEntry: null, ...extra } };
}

async function renderScreen(screen: ReactElement, recent: WeightEntry[] = [], extra: Partial<WeightOverview> = {}) {
  jest.mocked(loadProfile).mockResolvedValue({
    status: 'loaded',
    profile: profileFixture({
      sex: 'female',
      birth_date: '1990-05-01',
      height_cm: 165,
      activity_level: 'moderate',
      goal: 'maintain',
      onboarded_at: '2026-10-01T15:00:00Z',
    }),
  });
  jest.mocked(loadWeightOverview).mockResolvedValue(overview(recent, extra));
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
const pickDate = (root: Root, date: Date) =>
  act(async () => root.container.queryAll((node) => node.props.testID === 'date-picker')[0].props.onValueChange({}, date));

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeAuth();
  installMemoryStorage();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.mocked(loadCorrections).mockResolvedValue({ status: 'ok', data: [] });
  jest.mocked(loadWeightRange).mockResolvedValue({ status: 'ok', data: [] });
  jest.mocked(loadRecentActivity).mockResolvedValue({ status: 'ok', data: { items: [], hasMore: false } });
});

describe('Registrar peso', () => {
  it('valida antes de enviar', async () => {
    const root = await renderScreen(<RegisterWeightScreen />);
    await type(root, 'Peso (kg)', '500');
    await press(one(root, 'Guardar'));
    expect(addWeightEntry).not.toHaveBeenCalled();
    expect(allText(root.container)).toMatch(/entre 20 y 400 kg/);
  });

  it('guarda y vuelve; Inicio y Salud leen el estado recargado', async () => {
    const root = await renderScreen(<RegisterWeightScreen />);
    jest.mocked(addWeightEntry).mockResolvedValueOnce({ status: 'ok', entry: entry('2026-10-24', 68.5) });
    await type(root, 'Peso (kg)', '68,5');
    await press(one(root, 'Guardar'));
    await flush();
    expect(addWeightEntry).toHaveBeenCalledWith({ weightKg: 68.5, measuredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(loadWeightOverview).toHaveBeenCalledTimes(2);
    expect(router.back).toHaveBeenCalled();
  });

  it('día repetido: lo explica y conserva el formulario', async () => {
    const root = await renderScreen(<RegisterWeightScreen />);
    jest.mocked(addWeightEntry).mockResolvedValueOnce({ status: 'duplicate_day' });
    await type(root, 'Peso (kg)', '70');
    await press(one(root, 'Guardar'));
    await flush();
    expect(allText(root.container)).toMatch(/Ya registraste tu peso ese día/);
    expect(one(root, 'Peso (kg)').props.value).toBe('70');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('fecha anterior a la última: se guarda y avisa que el peso actual no cambia', async () => {
    const root = await renderScreen(<RegisterWeightScreen />, [entry('2026-10-23', 71.6)]);
    jest.mocked(addWeightEntry).mockResolvedValueOnce({ status: 'ok', entry: entry('2026-10-01', 74) });
    await type(root, 'Peso (kg)', '74');
    await pickDate(root, new Date(2026, 9, 1));
    await press(one(root, 'Guardar'));
    await flush();
    expect(allText(root.container)).toMatch(/Tu peso actual sigue siendo 71\.6 kg/);
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('Editar medición', () => {
  beforeEach(() => jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'id-2026-10-20' }));

  it('corrige con la versión leída; un conflicto recarga y lo explica', async () => {
    jest.mocked(loadWeightEntry).mockResolvedValue({ status: 'ok', data: entry('2026-10-20', 70, 3) });
    const root = await renderScreen(<RegisterWeightScreen />, [entry('2026-10-20', 70, 3)]);
    expect(one(root, 'Peso (kg)').props.value).toBe('70');
    expect(allText(root.container)).toMatch(/se borra automáticamente a los 180 días/);
    // Sin filas no se afirma que nunca se corrigió: pudo vencer.
    expect(allText(root.container)).toMatch(/en el historial disponible \(últimos 180 días\)/);
    expect(allText(root.container)).not.toMatch(/no se ha corregido/);

    jest.mocked(updateWeightEntry).mockResolvedValueOnce({ status: 'conflict' });
    await type(root, 'Peso (kg)', '69');
    await press(one(root, 'Guardar corrección'));
    await flush();
    expect(updateWeightEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id-2026-10-20', version: 3 }),
      { weightKg: 69, measuredOn: '2026-10-20' },
    );
    expect(allText(root.container)).toMatch(/cambió o se eliminó en otro dispositivo/);
    expect(loadWeightEntry).toHaveBeenCalledTimes(2);
  });

  it('eliminar pide confirmación y usa la versión leída', async () => {
    jest.mocked(loadWeightEntry).mockResolvedValue({ status: 'ok', data: entry('2026-10-20', 70, 2) });
    const root = await renderScreen(<RegisterWeightScreen />, [entry('2026-10-20', 70, 2)]);
    await press(one(root, 'Eliminar medición'));
    expect(deleteWeightEntry).not.toHaveBeenCalled();
    jest.mocked(deleteWeightEntry).mockResolvedValueOnce({ status: 'deleted' });
    await press(one(root, 'Sí, eliminar'));
    await flush();
    expect(deleteWeightEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'id-2026-10-20', version: 2 }));
    expect(router.back).toHaveBeenCalled();
  });

  it('peso heredado: pide confirmar la fecha y sugiere el día del onboarding', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'id-legacy' });
    jest.mocked(loadWeightEntry).mockResolvedValue({ status: 'ok', data: entry(null, 72.4) });
    const root = await renderScreen(<RegisterWeightScreen />, [], { legacy: entry(null, 72.4) });
    expect(allText(root.container)).toMatch(/no tiene fecha de medición/);
    jest.mocked(updateWeightEntry).mockResolvedValueOnce({ status: 'ok', entry: entry('2026-10-01', 72.4, 2) });
    await press(one(root, 'Confirmar fecha'));
    await flush();
    expect(updateWeightEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'id-legacy' }), {
      weightKg: 72.4,
      measuredOn: '2026-10-01',
    });
  });
});

describe('Historial', () => {
  it('sin mediciones muestra un estado vacío', async () => {
    const root = await renderScreen(<WeightHistoryScreen />);
    expect(allText(root.container)).toMatch(/Aún no registras tu peso/);
    expect(allText(root.container)).toMatch(/No hay correcciones ni eliminaciones en el historial disponible/);
  });

  it('la actividad reciente se ve aunque ya no queden mediciones, paginada y con el aviso de 180 días', async () => {
    const deletion = {
      id: 7,
      action: 'deletion' as const,
      changedAt: '2026-10-24T10:00:00Z',
      oldMeasuredOn: '2026-10-24',
      oldWeightKg: 68,
      newMeasuredOn: null,
      newWeightKg: null,
    };
    jest.mocked(loadRecentActivity).mockResolvedValueOnce({ status: 'ok', data: { items: [deletion], hasMore: true } });
    const root = await renderScreen(<WeightHistoryScreen />);
    expect(allText(root.container)).toMatch(/Aún no registras tu peso/);
    expect(allText(root.container)).toMatch(/se eliminó \(68 kg/);
    expect(allText(root.container)).toMatch(/se borra automáticamente a los 180 días/);
    expect(loadRecentActivity).toHaveBeenCalledWith('user-a');

    jest.mocked(loadRecentActivity).mockResolvedValueOnce({
      status: 'ok',
      data: { items: [{ ...deletion, id: 6, changedAt: '2026-10-20T10:00:00Z', oldWeightKg: 69 }], hasMore: false },
    });
    await press(one(root, 'Ver más actividad'));
    await flush();
    expect(loadRecentActivity).toHaveBeenLastCalledWith('user-a', { changedAt: '2026-10-24T10:00:00Z', id: 7 });
    expect(allText(root.container)).toMatch(/se eliminó \(69 kg/);
    expect(byLabel(root, 'Ver más actividad')).toHaveLength(0);
  });

  it('lista con «Corregida», meses sin datos y «Ver más» por cursor de fecha', async () => {
    const root = await renderScreen(<WeightHistoryScreen />, [entry('2026-10-23', 71.6, 2), entry('2026-10-20', 72)], {
      hasMore: true,
    });
    expect(allText(root.container)).toMatch(/Corregida/);
    expect(allText(root.container)).toMatch(/Sin datos/);
    expect(byLabel(root, HEALTH_HELP.monthlyChange.title)).toHaveLength(1);
    jest.mocked(loadHistoryPage).mockResolvedValueOnce({ status: 'ok', data: { entries: [entry('2026-09-01', 74)], hasMore: false } });
    await press(one(root, 'Ver más'));
    await flush();
    expect(loadHistoryPage).toHaveBeenCalledWith('user-a', '2026-10-20');
    expect(allText(root.container)).toMatch(/74 kg/);
    expect(byLabel(root, 'Ver más')).toHaveLength(0);
  });
});

it('Datos de salud: guarda estatura, actividad y objetivo sin tocar el peso', async () => {
  jest.mocked(saveProfile).mockImplementationOnce(async (_userId, patch) => ({ ok: true, profile: profileFixture(patch as never) }));
  const root = await renderScreen(<HealthDataScreen />);
  await type(root, 'Estatura (cm)', '170');
  await press(one(root, 'Activo (6-7 días)'));
  await press(one(root, 'Bajar de peso'));
  await press(one(root, 'Guardar'));
  await flush();
  expect(saveProfile).toHaveBeenCalledWith('user-a', { height_cm: 170, activity_level: 'active', goal: 'lose' });
  expect(router.back).toHaveBeenCalled();
});
