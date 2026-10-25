import { act } from 'react';
import type { Root } from 'test-renderer';

import { HealthSummarySection } from '@/components/health-summary-section';
import { WeightCard } from '@/components/weight-card';
import { ThemeProvider } from '@/design/theme-provider';
import { loadProfile } from '@/lib/profile-api';
import type { WeightEntry } from '@/lib/weight';
import {
  addWeightEntry,
  deleteWeightEntry,
  loadWeightOverview,
  type LoadResult,
  type WeightOverview,
} from '@/lib/weight-api';
import { SessionProvider } from '@/providers/session-provider';
import { useWeight, WeightProvider } from '@/providers/weight-provider';
import { emitAuth, resetFakeAuth, sessionFor } from '@/test-utils/fake-supabase';
import { installMemoryStorage } from '@/test-utils/memory-storage';
import { allText, createProbe, deferred, flush, profileFixture, render } from '@/test-utils/render';

jest.mock('@/lib/supabase', () => jest.requireActual('@/test-utils/fake-supabase'));
jest.mock('@/lib/profile-api', () => ({ loadProfile: jest.fn(), saveProfile: jest.fn() }));
jest.mock('@/lib/weight-api', () => ({
  ...jest.requireActual('@/lib/weight-api'),
  loadWeightOverview: jest.fn(),
  addWeightEntry: jest.fn(),
  updateWeightEntry: jest.fn(),
  deleteWeightEntry: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

const overviewMock = jest.mocked(loadWeightOverview);
const weight = createProbe(useWeight);

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

function overview(recent: WeightEntry[], legacy: WeightEntry | null = null): LoadResult<WeightOverview> {
  return { status: 'ok', data: { recent, hasMore: false, legacy, monthly: [] } };
}

const HEALTH_PROFILE = {
  sex: 'female',
  birth_date: '1990-05-01',
  height_cm: 165,
  activity_level: 'moderate',
  goal: 'maintain',
  onboarded_at: '2026-10-01T10:00:00Z',
};

/** Inicio (resumen) y Salud (tarjeta de peso) bajo un mismo WeightProvider, como en (app)/_layout. */
async function renderBoth(userId = 'user-a'): Promise<Root> {
  jest.mocked(loadProfile).mockResolvedValue({ status: 'loaded', profile: profileFixture({ id: userId, ...HEALTH_PROFILE }) });
  const root = await render(
    <SessionProvider>
      <ThemeProvider>
        <WeightProvider>
          <weight.Probe />
          <HealthSummarySection />
          <WeightCard />
        </WeightProvider>
      </ThemeProvider>
    </SessionProvider>,
  );
  await act(async () => emitAuth('SIGNED_IN', sessionFor(userId)));
  await flush();
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeAuth();
  installMemoryStorage();
});

it('tras registrar, Inicio y Salud muestran el mismo peso nuevo', async () => {
  overviewMock.mockResolvedValueOnce(overview([entry('2026-10-20', 70)]));
  const root = await renderBoth();
  expect(allText(root.container).match(/70 kg/g)?.length).toBeGreaterThanOrEqual(2);

  jest.mocked(addWeightEntry).mockResolvedValueOnce({ status: 'ok', entry: entry('2026-10-24', 68.5) });
  overviewMock.mockResolvedValueOnce(overview([entry('2026-10-24', 68.5), entry('2026-10-20', 70)]));
  let result;
  await act(async () => {
    result = await weight.value.addEntry({ measuredOn: '2026-10-24', weightKg: 68.5 }, 'user-a');
  });
  expect(result).toMatchObject({ status: 'ok' });
  const text = allText(root.container);
  expect(text.match(/68\.5 kg/g)?.length).toBeGreaterThanOrEqual(2); // resumen de Inicio + tarjeta de Salud
  expect(weight.value.current?.entry.weightKg).toBe(68.5);
});

it('registrar una fecha anterior no cambia el peso vigente', async () => {
  overviewMock.mockResolvedValueOnce(overview([entry('2026-10-23', 71.6)]));
  await renderBoth();
  jest.mocked(addWeightEntry).mockResolvedValueOnce({ status: 'ok', entry: entry('2026-10-01', 74) });
  overviewMock.mockResolvedValueOnce(overview([entry('2026-10-23', 71.6), entry('2026-10-01', 74)]));
  await act(async () => {
    await weight.value.addEntry({ measuredOn: '2026-10-01', weightKg: 74 }, 'user-a');
  });
  expect(weight.value.current?.entry.measuredOn).toBe('2026-10-23');
});

it('eliminar la última pasa a la anterior; sin mediciones, el resumen pide registrar y no calcula', async () => {
  overviewMock.mockResolvedValueOnce(overview([entry('2026-10-23', 71.6), entry('2026-10-20', 72)]));
  const root = await renderBoth();

  jest.mocked(deleteWeightEntry).mockResolvedValueOnce({ status: 'deleted' });
  overviewMock.mockResolvedValueOnce(overview([entry('2026-10-20', 72)]));
  await act(async () => {
    await weight.value.deleteEntry(entry('2026-10-23', 71.6), 'user-a');
  });
  expect(weight.value.current?.entry.measuredOn).toBe('2026-10-20');

  jest.mocked(deleteWeightEntry).mockResolvedValueOnce({ status: 'deleted' });
  overviewMock.mockResolvedValueOnce(overview([]));
  await act(async () => {
    await weight.value.deleteEntry(entry('2026-10-20', 72), 'user-a');
  });
  expect(weight.value.current).toBeNull();
  expect(allText(root.container)).toMatch(/Registra tu peso para calcular tu IMC/);
  expect(allText(root.container)).not.toMatch(/IMC \d/);
});

it('solo el peso heredado: cuenta como vigente y se marca «fecha sin confirmar»', async () => {
  overviewMock.mockResolvedValueOnce(overview([], entry(null, 72.4)));
  const root = await renderBoth();
  expect(weight.value.current).toMatchObject({ dateConfirmed: false });
  expect(allText(root.container)).toMatch(/fecha sin confirmar/);
  expect(allText(root.container)).toMatch(/Confirmar fecha/);
});

it('un fallo al guardar conserva el estado anterior y no recarga', async () => {
  overviewMock.mockResolvedValueOnce(overview([entry('2026-10-20', 70)]));
  await renderBoth();
  jest.mocked(addWeightEntry).mockResolvedValueOnce({ status: 'error', message: 'Network request failed' });
  await act(async () => {
    await weight.value.addEntry({ measuredOn: '2026-10-24', weightKg: 68 }, 'user-a');
  });
  expect(overviewMock).toHaveBeenCalledTimes(1);
  expect(weight.value.current?.entry.weightKg).toBe(70);
});

it('un conflicto de versión recarga para mostrar lo que cambió en otro dispositivo', async () => {
  overviewMock.mockResolvedValueOnce(overview([entry('2026-10-20', 70)]));
  await renderBoth();
  jest.mocked(deleteWeightEntry).mockResolvedValueOnce({ status: 'conflict' });
  overviewMock.mockResolvedValueOnce(overview([entry('2026-10-20', 69, 2)]));
  let result;
  await act(async () => {
    result = await weight.value.deleteEntry(entry('2026-10-20', 70), 'user-a');
  });
  expect(result).toEqual({ status: 'conflict' });
  expect(weight.value.current?.entry.weightKg).toBe(69);
});

it('descarta la respuesta tardía de otra sesión y no envía escrituras de una sesión anterior', async () => {
  const slowA = deferred<LoadResult<WeightOverview>>();
  overviewMock.mockReturnValueOnce(slowA.promise);
  await renderBoth('user-a');

  overviewMock.mockResolvedValueOnce(overview([entry('2026-10-22', 80)]));
  jest.mocked(loadProfile).mockResolvedValue({ status: 'loaded', profile: profileFixture({ id: 'user-b', ...HEALTH_PROFILE }) });
  await act(async () => emitAuth('SIGNED_IN', sessionFor('user-b')));
  await flush();
  expect(weight.value.current?.entry.weightKg).toBe(80);

  await act(async () => slowA.resolve(overview([entry('2026-10-22', 55)])));
  expect(weight.value.current?.entry.weightKg).toBe(80);

  let result;
  await act(async () => {
    result = await weight.value.addEntry({ measuredOn: '2026-10-24', weightKg: 60 }, 'user-a');
  });
  expect(result).toEqual({ status: 'stale_session' });
  expect(addWeightEntry).not.toHaveBeenCalled();
});
