import { supabase } from './supabase';
import {
  addWeightEntry,
  completeOnboarding,
  deleteWeightEntry,
  HISTORY_PAGE_SIZE,
  loadCorrections,
  loadWeightOverview,
  updateWeightEntry,
  weightActionMessage,
  type OnboardingInput,
} from './weight-api';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

type Result = { data: unknown; error: { code?: string; message: string } | null };

/** Query builder encadenable de supabase-js: cada método devuelve el builder y al final resuelve `result`. */
function builder(result: Result | Error) {
  const chain: Record<string, jest.Mock> & { then?: unknown } = {};
  const settle = () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result));
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'not', 'is', 'gte', 'lt', 'order', 'limit']) {
    chain[method] = jest.fn(() => chain);
  }
  chain.maybeSingle = jest.fn(settle);
  chain.single = jest.fn(settle);
  chain.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => settle().then(resolve, reject);
  return chain;
}

const row = (measured_on: string | null, weight_kg = 70, version = 1) => ({
  id: `id-${measured_on ?? 'legacy'}`,
  measured_on,
  weight_kg,
  origin: measured_on ? 'manual' : 'legacy_profile',
  version,
  created_at: '2026-10-20T12:00:00Z',
  updated_at: '2026-10-20T12:00:00Z',
});

beforeEach(() => jest.clearAllMocks());

describe('loadWeightOverview', () => {
  it('reúne historial, heredado y meses; detecta si hay más páginas', async () => {
    const rows = Array.from({ length: HISTORY_PAGE_SIZE + 1 }, (_, index) => row(`2026-09-${String(30 - index).padStart(2, '0')}`));
    const recent = builder({ data: rows, error: null });
    jest
      .mocked(supabase.from)
      .mockReturnValueOnce(recent as never)
      .mockReturnValueOnce(builder({ data: row(null, 72.4), error: null }) as never)
      .mockReturnValueOnce(
        builder({
          data: [
            {
              user_id: 'user-a',
              month: '2026-09-01',
              entries: 2,
              average_kg: 71,
              first_measured_on: '2026-09-01',
              first_weight_kg: 72,
              last_measured_on: '2026-09-30',
              last_weight_kg: 70,
              change_kg: -2,
            },
          ],
          error: null,
        }) as never,
      );

    const result = await loadWeightOverview('user-a', '2025-10-01');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data.recent).toHaveLength(HISTORY_PAGE_SIZE);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.legacy).toMatchObject({ measuredOn: null, weightKg: 72.4, origin: 'legacy_profile' });
    expect(result.data.monthly[0]).toMatchObject({ month: '2026-09-01', changeKg: -2 });
    expect(recent.eq).toHaveBeenCalledWith('user_id', 'user-a');
    expect(recent.not).toHaveBeenCalledWith('measured_on', 'is', null);
  });

  it('un error en cualquier parte es «error», nunca «sin datos»', async () => {
    jest
      .mocked(supabase.from)
      .mockReturnValueOnce(builder({ data: [], error: null }) as never)
      .mockReturnValueOnce(builder({ data: null, error: { message: 'JWT expired' } }) as never)
      .mockReturnValueOnce(builder({ data: [], error: null }) as never);
    await expect(loadWeightOverview('user-a', '2025-10-01')).resolves.toEqual({ status: 'error', message: 'JWT expired' });
  });

  it('un fallo de red es «error»', async () => {
    jest.mocked(supabase.from).mockReturnValue(builder(new TypeError('Network request failed')) as never);
    await expect(loadWeightOverview('user-a', '2025-10-01')).resolves.toEqual({
      status: 'error',
      message: 'Network request failed',
    });
  });
});

describe('escrituras', () => {
  it('registrar no envía user_id (lo pone el servidor) y un día repetido es duplicate_day', async () => {
    const insert = builder({ data: null, error: { code: '23505', message: 'duplicate key' } });
    jest.mocked(supabase.from).mockReturnValue(insert as never);
    await expect(addWeightEntry({ measuredOn: '2026-10-24', weightKg: 70 })).resolves.toEqual({ status: 'duplicate_day' });
    expect(insert.insert).toHaveBeenCalledWith({ measured_on: '2026-10-24', weight_kg: 70 });
  });

  it('corregir exige la versión leída; 0 filas es conflicto', async () => {
    const update = builder({ data: [], error: null });
    jest.mocked(supabase.from).mockReturnValue(update as never);
    await expect(updateWeightEntry({ id: 'e1', version: 3 }, { measuredOn: '2026-10-24', weightKg: 70 })).resolves.toEqual({
      status: 'conflict',
    });
    expect(update.eq).toHaveBeenCalledWith('id', 'e1');
    expect(update.eq).toHaveBeenCalledWith('version', 3);
  });

  it('corrección confirmada devuelve la fila nueva', async () => {
    jest.mocked(supabase.from).mockReturnValue(builder({ data: [row('2026-10-24', 69.5, 2)], error: null }) as never);
    const result = await updateWeightEntry({ id: 'e1', version: 1 }, { measuredOn: '2026-10-24', weightKg: 69.5 });
    expect(result).toMatchObject({ status: 'ok', entry: { version: 2, weightKg: 69.5 } });
  });

  it('eliminar exige la versión leída; 0 filas es conflicto', async () => {
    const remove = builder({ data: [], error: null });
    jest.mocked(supabase.from).mockReturnValue(remove as never);
    await expect(deleteWeightEntry({ id: 'e1', version: 2 })).resolves.toEqual({ status: 'conflict' });
    expect(remove.eq).toHaveBeenCalledWith('version', 2);

    jest.mocked(supabase.from).mockReturnValue(builder({ data: [{ id: 'e1' }], error: null }) as never);
    await expect(deleteWeightEntry({ id: 'e1', version: 2 })).resolves.toEqual({ status: 'deleted' });
  });

  it('cada fallo tiene un mensaje; el éxito no', () => {
    expect(weightActionMessage({ status: 'duplicate_day' })).toMatch(/ese día/);
    expect(weightActionMessage({ status: 'conflict' })).toMatch(/otro dispositivo/);
    expect(weightActionMessage({ status: 'stale_session' })).toMatch(/sesión cambió/);
    expect(weightActionMessage({ status: 'error', message: 'x' })).toMatch(/conexión/);
    expect(weightActionMessage({ status: 'deleted' })).toBeNull();
  });
});

it('correcciones: ordenadas por fecha de cambio, con valores anteriores', async () => {
  const audit = builder({
    data: [
      {
        id: 2,
        action: 'deletion',
        changed_at: '2026-10-24T10:00:00Z',
        old_measured_on: '2026-10-24',
        old_weight_kg: 71.4,
        new_measured_on: null,
        new_weight_kg: null,
      },
    ],
    error: null,
  });
  jest.mocked(supabase.from).mockReturnValue(audit as never);
  const result = await loadCorrections('e1');
  expect(result).toEqual({
    status: 'ok',
    data: [
      {
        id: 2,
        action: 'deletion',
        changedAt: '2026-10-24T10:00:00Z',
        oldMeasuredOn: '2026-10-24',
        oldWeightKg: 71.4,
        newMeasuredOn: null,
        newWeightKg: null,
      },
    ],
  });
  expect(audit.order).toHaveBeenCalledWith('changed_at', { ascending: false });
});

describe('completeOnboarding', () => {
  const input: OnboardingInput = {
    displayName: 'Ana',
    gender: null,
    sex: 'female',
    birthDate: '1993-05-10',
    heightCm: 165,
    activityLevel: 'moderate',
    goal: 'maintain',
    themePalette: null,
    weightKg: 62.5,
    measuredOn: '2026-10-24',
  };

  it('envía perfil y peso en una sola llamada', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 'completed', error: null } as never);
    await expect(completeOnboarding(input)).resolves.toEqual({ status: 'completed' });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'complete_onboarding',
      expect.objectContaining({ p_weight_kg: 62.5, p_measured_on: '2026-10-24', p_gender: null }),
    );
  });

  it('ya completado es un resultado propio', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 'already_completed', error: null } as never);
    await expect(completeOnboarding(input)).resolves.toEqual({ status: 'already_completed' });
  });

  it.each([
    [{ code: '23505', message: 'weight_day_conflict' }, 'weight_day_conflict'],
    [{ code: '22023', message: 'invalid_measured_on' }, 'invalid_measured_on'],
    [{ code: '22023', message: 'missing_display_name' }, 'missing_field'],
    [{ code: '23514', message: 'new row violates check constraint' }, 'out_of_range'],
    [{ code: '42501', message: 'no_session' }, 'no_session'],
  ])('traduce %o a %s', async (error, reason) => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error } as never);
    await expect(completeOnboarding(input)).resolves.toMatchObject({ status: 'error', reason });
  });

  it('un fallo de red no es éxito', async () => {
    jest.mocked(supabase.rpc).mockRejectedValue(new TypeError('Network request failed'));
    await expect(completeOnboarding(input)).resolves.toMatchObject({ status: 'error', reason: 'other' });
  });
});
