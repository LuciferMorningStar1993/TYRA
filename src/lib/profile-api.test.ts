import { loadProfile, saveProfile } from './profile-api';
import { supabase } from './supabase';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

type QueryResult = { data: unknown; error: { message: string } | null };

/** Imita el query builder encadenable de supabase-js y resuelve con `result`. */
function mockQuery(result: QueryResult | Error) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'update', 'eq']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
  jest.mocked(supabase.from).mockReturnValue(builder as never);
  return builder;
}

const PROFILE = { id: 'user-a', display_name: 'Ana' };

beforeEach(() => jest.clearAllMocks());

describe('loadProfile', () => {
  it('devuelve el perfil cargado', async () => {
    mockQuery({ data: PROFILE, error: null });
    await expect(loadProfile('user-a')).resolves.toEqual({ status: 'loaded', profile: PROFILE });
  });

  it('distingue perfil ausente de error', async () => {
    mockQuery({ data: null, error: null });
    await expect(loadProfile('user-a')).resolves.toEqual({ status: 'missing' });
  });

  it('un error de PostgREST es "error", no "ausente"', async () => {
    mockQuery({ data: null, error: { message: 'JWT expired' } });
    await expect(loadProfile('user-a')).resolves.toEqual({ status: 'error', message: 'JWT expired' });
  });

  it('un fallo de red (excepción) es "error"', async () => {
    mockQuery(new TypeError('Network request failed'));
    await expect(loadProfile('user-a')).resolves.toEqual({ status: 'error', message: 'Network request failed' });
  });
});

describe('saveProfile', () => {
  it('sin sesión no llama al servidor ni informa éxito', async () => {
    await expect(saveProfile(undefined, { display_name: 'x' })).resolves.toEqual({ ok: false, error: 'no_session' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('un update que no devuelve fila es un error', async () => {
    const builder = mockQuery({ data: null, error: null });
    await expect(saveProfile('user-a', { display_name: 'x' })).resolves.toEqual({ ok: false, error: 'no_row' });
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('id', 'user-a');
  });

  it('propaga el error del servidor', async () => {
    mockQuery({ data: null, error: { message: 'violates check constraint' } });
    await expect(saveProfile('user-a', { height_cm: 10 })).resolves.toEqual({
      ok: false,
      error: 'violates check constraint',
    });
  });

  it('devuelve la fila confirmada', async () => {
    mockQuery({ data: { ...PROFILE, onboarded_at: '2026-10-24T10:00:00Z' }, error: null });
    await expect(saveProfile('user-a', { onboarded_at: '2026-10-24T10:00:00Z' })).resolves.toEqual({
      ok: true,
      profile: { ...PROFILE, onboarded_at: '2026-10-24T10:00:00Z' },
    });
  });
});
