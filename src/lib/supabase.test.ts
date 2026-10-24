// El cliente real: en modo QA local con URL remota no debe crearse (ni salir ninguna petición).

import { installMemoryStorage } from '@/test-utils/memory-storage';

jest.mock('expo-sqlite/localStorage/install', () => ({}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() } })),
}));

installMemoryStorage();

const ENV_KEYS = [
  'EXPO_PUBLIC_QA_LOCAL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_QA_SUPABASE_URL',
  'EXPO_PUBLIC_QA_SUPABASE_PUBLISHABLE_KEY',
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function loadClientModule(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  let createClient!: jest.Mock;
  let error: unknown = null;
  jest.isolateModules(() => {
    createClient = jest.requireMock<typeof import('@supabase/supabase-js')>('@supabase/supabase-js').createClient as jest.Mock;
    try {
      jest.requireActual('./supabase');
    } catch (thrown) {
      error = thrown;
    }
  });
  return { createClient, error };
}

const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
  throw new Error('No debe haber peticiones de red en estas pruebas');
});

afterEach(() => {
  jest.clearAllMocks();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

afterAll(() => fetchSpy.mockRestore());

it('QA local + URL remota: lanza antes de crear el cliente y sin peticiones', () => {
  const { createClient, error } = loadClientModule({
    EXPO_PUBLIC_QA_LOCAL: '1',
    EXPO_PUBLIC_QA_SUPABASE_URL: 'https://hzvyhfnlidprpnswfurw.supabase.co',
    EXPO_PUBLIC_QA_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_qa',
  });
  expect(String(error)).toMatch(/Backend bloqueado/);
  expect(createClient).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('QA local + destino local: crea el cliente con la URL local', () => {
  const info = jest.spyOn(console, 'info').mockImplementation(() => {});
  const { createClient, error } = loadClientModule({
    EXPO_PUBLIC_QA_LOCAL: '1',
    EXPO_PUBLIC_SUPABASE_URL: 'https://hzvyhfnlidprpnswfurw.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_remote',
    EXPO_PUBLIC_QA_SUPABASE_URL: 'http://127.0.0.1:55321',
    EXPO_PUBLIC_QA_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_qa_local',
  });
  expect(error).toBeNull();
  expect(createClient).toHaveBeenCalledWith('http://127.0.0.1:55321', 'sb_publishable_qa_local', expect.anything());
  expect(info.mock.calls.join(' ')).not.toContain('sb_publishable_qa_local');
  info.mockRestore();
});

it('modo normal: usa las variables normales', () => {
  const { createClient, error } = loadClientModule({
    EXPO_PUBLIC_SUPABASE_URL: 'https://hzvyhfnlidprpnswfurw.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_remote',
  });
  expect(error).toBeNull();
  expect(createClient).toHaveBeenCalledWith(
    'https://hzvyhfnlidprpnswfurw.supabase.co',
    'sb_publishable_remote',
    expect.anything(),
  );
});
