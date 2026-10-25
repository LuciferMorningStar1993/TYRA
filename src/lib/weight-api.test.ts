import { supabase } from './supabase';
import {
  addWeightEntry,
  completeOnboarding,
  deleteWeightEntry,
  deleteWeightGoal,
  goalActionMessage,
  loadAllMonthlySummaries,
  ACTIVITY_PAGE_SIZE,
  HISTORY_PAGE_SIZE,
  loadCorrections,
  loadRecentActivity,
  loadWeightOverview,
  setWeightGoal,
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
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'not', 'is', 'gte', 'lt', 'or', 'order', 'limit']) {
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
      )
      .mockReturnValueOnce(builder({ data: null, error: null }) as never); // sin meta

    const result = await loadWeightOverview('user-a', '2025-10-01');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data.recent).toHaveLength(HISTORY_PAGE_SIZE);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.legacy).toMatchObject({ measuredOn: null, weightKg: 72.4, origin: 'legacy_profile' });
    expect(result.data.monthly[0]).toMatchObject({ month: '2026-09-01', changeKg: -2 });
    expect(result.data.goal).toBeNull();
    expect(result.data.goalStartEntry).toBeNull();
    expect(recent.eq).toHaveBeenCalledWith('user_id', 'user-a');
    expect(recent.not).toHaveBeenCalledWith('measured_on', 'is', null);
  });

  it('un error en cualquier parte es «error», nunca «sin datos»', async () => {
    jest
      .mocked(supabase.from)
      .mockReturnValueOnce(builder({ data: [], error: null }) as never)
      .mockReturnValueOnce(builder({ data: null, error: { message: 'JWT expired' } }) as never)
      .mockReturnValueOnce(builder({ data: [], error: null }) as never)
      .mockReturnValueOnce(builder({ data: null, error: null }) as never);
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

describe('loadRecentActivity', () => {
  const auditRow = (id: number, action = 'correction') => ({
    id,
    action,
    changed_at: `2026-10-${String(id).padStart(2, '0')}T10:00:00Z`,
    old_measured_on: '2026-10-01',
    old_weight_kg: 70,
    new_measured_on: action === 'correction' ? '2026-10-01' : null,
    new_weight_kg: action === 'correction' ? 69 : null,
  });

  it('primera página: solo del usuario, más reciente primero, detecta si hay más', async () => {
    const rows = Array.from({ length: ACTIVITY_PAGE_SIZE + 1 }, (_, index) => auditRow(30 - index));
    const audit = builder({ data: rows, error: null });
    jest.mocked(supabase.from).mockReturnValue(audit as never);
    const result = await loadRecentActivity('user-a');
    expect(result).toMatchObject({ status: 'ok', data: { hasMore: true } });
    if (result.status === 'ok') expect(result.data.items).toHaveLength(ACTIVITY_PAGE_SIZE);
    expect(audit.eq).toHaveBeenCalledWith('user_id', 'user-a');
    expect(audit.lt).not.toHaveBeenCalled();
    expect(audit.order).toHaveBeenCalledWith('changed_at', { ascending: false });
  });

  it('páginas siguientes usan el cursor (changed_at, id) con la fecha entre comillas', async () => {
    const audit = builder({ data: [auditRow(3, 'deletion')], error: null });
    jest.mocked(supabase.from).mockReturnValue(audit as never);
    const result = await loadRecentActivity('user-a', { changedAt: '2026-10-05T10:00:00.123456+00:00', id: 42 });
    expect(audit.or).toHaveBeenCalledWith(
      'changed_at.lt."2026-10-05T10:00:00.123456+00:00",and(changed_at.eq."2026-10-05T10:00:00.123456+00:00",id.lt.42)',
    );
    expect(result).toMatchObject({ status: 'ok', data: { hasMore: false, items: [{ action: 'deletion', newWeightKg: null }] } });
  });

  it('más de 20 eventos con la misma fecha: recorre todos sin perder ni repetir', async () => {
    // Servidor en memoria que aplica el mismo orden y filtro que PostgREST.
    const SAME = '2026-10-24T10:00:00.5+00:00';
    const rows = [
      ...Array.from({ length: 25 }, (_, index) => ({ ...auditRow(1), id: index + 10, changed_at: SAME })),
      { ...auditRow(1), id: 99, changed_at: '2026-10-25T08:00:00+00:00' },
      { ...auditRow(1), id: 5, changed_at: '2026-10-20T08:00:00+00:00' },
    ];
    jest.mocked(supabase.from).mockImplementation(() => {
      let filter: string | null = null;
      let limit = Infinity;
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order']) chain[method] = () => chain;
      chain.or = (value: string) => ((filter = value), chain);
      chain.limit = (value: number) => ((limit = value), chain);
      chain.then = (resolve: (value: Result) => unknown) => {
        const match = filter?.match(/^changed_at\.lt\."([^"]+)",and\(changed_at\.eq\."([^"]+)",id\.lt\.(\d+)\)$/);
        const after = (row: (typeof rows)[number]) =>
          !match ||
          Date.parse(row.changed_at) < Date.parse(match[1]) ||
          (Date.parse(row.changed_at) === Date.parse(match[2]) && row.id < Number(match[3]));
        const data = rows
          .filter(after)
          .sort((a, b) => Date.parse(b.changed_at) - Date.parse(a.changed_at) || b.id - a.id)
          .slice(0, limit);
        return Promise.resolve({ data, error: null }).then(resolve);
      };
      return chain as never;
    });

    const seen: number[] = [];
    let cursor: { changedAt: string; id: number } | undefined;
    for (let page = 0; page < 5; page += 1) {
      const result = await loadRecentActivity('user-a', cursor);
      if (result.status !== 'ok') throw new Error(result.message);
      seen.push(...result.data.items.map((item) => item.id));
      const last = result.data.items[result.data.items.length - 1];
      if (!result.data.hasMore || !last) break;
      cursor = { changedAt: last.changedAt, id: last.id };
    }
    expect(seen).toEqual([99, ...Array.from({ length: 25 }, (_, index) => 34 - index), 5]);
    expect(new Set(seen).size).toBe(rows.length);
  });

  it('un cursor mal formado no llega al servidor', async () => {
    await expect(loadRecentActivity('user-a', { changedAt: '2026",x', id: 1 })).resolves.toMatchObject({ status: 'error' });
    expect(supabase.from).toHaveBeenCalledTimes(1); // se construye la consulta, pero el filtro falla antes de enviarla
  });

  it('un error no es «sin actividad»', async () => {
    jest.mocked(supabase.from).mockReturnValue(builder({ data: null, error: { message: 'JWT expired' } }) as never);
    await expect(loadRecentActivity('user-a')).resolves.toEqual({ status: 'error', message: 'JWT expired' });
  });
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

describe('meta de peso', () => {
  const goalRow = {
    id: 'g2',
    target_weight_kg: 68,
    start_weight_kg: 72.4,
    start_measured_on: '2026-10-10',
    start_entry_id: 'id-2026-10-10',
    start_entry_version: 1,
    version: 3,
    set_at: '2026-10-10T12:00:00Z',
    updated_at: '2026-10-12T12:00:00Z',
  };
  const rpcResult = (result: Result) => jest.mocked(supabase.rpc).mockReturnValue({ single: () => Promise.resolve(result) } as never);

  it('el overview trae la meta y la medición de partida (para detectar correcciones)', async () => {
    jest
      .mocked(supabase.from)
      .mockReturnValueOnce(builder({ data: [row('2026-10-20', 70)], error: null }) as never)
      .mockReturnValueOnce(builder({ data: null, error: null }) as never)
      .mockReturnValueOnce(builder({ data: [], error: null }) as never)
      .mockReturnValueOnce(builder({ data: goalRow, error: null }) as never)
      .mockReturnValueOnce(builder({ data: row('2026-10-10', 71.8, 2), error: null }) as never);
    const result = await loadWeightOverview('user-a', '2025-10-01');
    expect(result).toMatchObject({
      status: 'ok',
      data: { goal: { id: 'g2', targetWeightKg: 68, startEntryVersion: 1, version: 3 }, goalStartEntry: { version: 2, weightKg: 71.8 } },
    });
  });

  it('crear no envía id ni versión; editar envía los leídos', async () => {
    rpcResult({ data: goalRow, error: null });
    await expect(setWeightGoal({ targetKg: 68 })).resolves.toMatchObject({ status: 'ok', goal: { id: 'g2' } });
    expect(supabase.rpc).toHaveBeenLastCalledWith('set_weight_goal', {
      p_target_weight_kg: 68,
      p_goal_id: undefined,
      p_expected_version: undefined,
      p_reset_start: false,
    });
    await setWeightGoal({ targetKg: 67, goal: { id: 'g2', version: 3 }, resetStart: true });
    expect(supabase.rpc).toHaveBeenLastCalledWith('set_weight_goal', {
      p_target_weight_kg: 67,
      p_goal_id: 'g2',
      p_expected_version: 3,
      p_reset_start: true,
    });
  });

  it.each([
    [{ code: 'PT409', message: 'goal_conflict' }, 'goal_conflict'],
    [{ code: 'PT409', message: 'goal_missing' }, 'goal_missing'],
    [{ code: '22023', message: 'age_not_eligible' }, 'age_not_eligible'],
    [{ code: '22023', message: 'no_dated_measurement' }, 'no_dated_measurement'],
    [{ code: '23514', message: 'violates check constraint' }, 'out_of_range'],
  ])('traduce %o a %s, con mensaje', async (error, status) => {
    rpcResult({ data: null, error });
    const result = await setWeightGoal({ targetKg: 68, goal: { id: 'g1', version: 1 } });
    expect(result).toEqual({ status });
    expect(goalActionMessage(result)).toBeTruthy();
  });

  it('eliminar exige id + versión; 0 filas es conflicto (nunca borra otra meta)', async () => {
    const remove = builder({ data: [], error: null });
    jest.mocked(supabase.from).mockReturnValue(remove as never);
    await expect(deleteWeightGoal({ id: 'g1', version: 1 })).resolves.toEqual({ status: 'goal_conflict' });
    expect(remove.eq).toHaveBeenCalledWith('id', 'g1');
    expect(remove.eq).toHaveBeenCalledWith('version', 1);
    jest.mocked(supabase.from).mockReturnValue(builder({ data: [{ id: 'g1' }], error: null }) as never);
    await expect(deleteWeightGoal({ id: 'g1', version: 1 })).resolves.toEqual({ status: 'deleted' });
  });

  it('«Todo» lee todos los meses en orden cronológico', async () => {
    const monthly = builder({ data: [], error: null });
    jest.mocked(supabase.from).mockReturnValue(monthly as never);
    await expect(loadAllMonthlySummaries('user-a')).resolves.toEqual({ status: 'ok', data: [] });
    expect(monthly.gte).not.toHaveBeenCalled();
    expect(monthly.order).toHaveBeenCalledWith('month', { ascending: true });
  });
});
