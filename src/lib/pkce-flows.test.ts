// Regresión: dos flujos PKCE en curso (p. ej. dos registros/reenvíos, o registro + Google).
// Usa el cliente REAL de supabase-js con un fetch simulado: cada enlace debe intercambiarse con
// el verificador de SU flujo (vía sb_flow_id), no con el más reciente.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { completeAuthRedirect } from './auth';

jest.mock('expo-linking', () => ({ createURL: (path: string) => `tyra://${path}` }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn(), openAuthSessionAsync: jest.fn() }));
// `mock*`: única forma de que la fábrica de jest.mock acceda a una variable del archivo.
const mockClient: { current: SupabaseClient | null } = { current: null };
jest.mock('./supabase', () => ({
  get supabase() {
    return mockClient.current;
  },
  supabaseConfig: { mode: 'normal', url: 'http://supabase.test', publishableKey: 'test' },
}));

// SHA-256 de Node para recalcular el desafío PKCE (sin agregar @types/node al proyecto).
const { createHash } = jest.requireActual<{
  createHash: (algorithm: string) => { update: (data: string) => { digest: (encoding: 'base64url') => string } };
}>('crypto');

type Call = { url: string; body: Record<string, unknown> };

function fakeResponse(body: unknown) {
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
}

const USER = { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'ana@example.com', identities: [{}] };

function setup() {
  const calls: Call[] = [];
  const memory = new Map<string, string>();
  const fetchMock = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
    if (url.includes('/token?grant_type=pkce')) {
      return fakeResponse({
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: USER,
      });
    }
    if (url.includes('/recover')) return fakeResponse({});
    return fakeResponse(USER); // /signup con confirmación: usuario sin sesión
  });

  mockClient.current = createClient('http://supabase.test', 'publishable-test', {
    auth: {
      storage: {
        getItem: (key) => memory.get(key) ?? null,
        setItem: (key, value) => void memory.set(key, value),
        removeItem: (key) => void memory.delete(key),
      },
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
      experimental: { appendPkceFlowIdToRedirects: true }, // igual que src/lib/supabase.ts
    },
    global: { fetch: fetchMock as unknown as typeof fetch },
  });
  return { calls, client: mockClient.current };
}

/** Datos del flujo que salió en una petición de registro: redirect con sb_flow_id y desafío PKCE. */
function flowFrom(call: Call) {
  const redirectTo = new URL(call.url).searchParams.get('redirect_to') ?? '';
  return {
    redirectTo,
    flowId: new URL(redirectTo.replace('tyra://', 'http://tyra/')).searchParams.get('sb_flow_id'),
    challenge: String(call.body.code_challenge),
    method: String(call.body.code_challenge_method),
  };
}

function matchesChallenge(verifier: unknown, flow: ReturnType<typeof flowFrom>): boolean {
  const value = String(verifier);
  const derived = flow.method === 's256' ? createHash('sha256').update(value).digest('base64url') : value;
  return derived === flow.challenge;
}

afterEach(async () => {
  await mockClient.current?.auth.signOut({ scope: 'local' });
  mockClient.current = null;
});

it('cada enlace usa el verificador de su propio flujo aunque haya otro más reciente', async () => {
  const { calls, client } = setup();

  await client.auth.signUp({ email: 'ana@example.com', password: 'Prueba2026', options: { emailRedirectTo: 'tyra://auth/callback' } });
  await client.auth.signUp({ email: 'ana@example.com', password: 'Prueba2026', options: { emailRedirectTo: 'tyra://auth/callback' } });
  const [flowA, flowB] = calls.filter((call) => call.url.includes('/signup')).map(flowFrom);

  expect(flowA.flowId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  expect(flowB.flowId).not.toBe(flowA.flowId);
  expect(flowA.redirectTo).toBe(`tyra://auth/callback?sb_flow_id=${flowA.flowId}`);

  // El usuario abre primero el enlace del flujo A (el más viejo).
  await expect(completeAuthRedirect(`${flowA.redirectTo}&code=code-a`)).resolves.toEqual({
    status: 'signed_in',
    kind: 'sign_in',
  });
  const exchangeA = calls.filter((call) => call.url.includes('grant_type=pkce')).at(-1)!;
  expect(exchangeA.body.auth_code).toBe('code-a');
  expect(matchesChallenge(exchangeA.body.code_verifier, flowA)).toBe(true);
  expect(matchesChallenge(exchangeA.body.code_verifier, flowB)).toBe(false);

  // El flujo B conserva su verificador y también se completa.
  await expect(completeAuthRedirect(`${flowB.redirectTo}&code=code-b`)).resolves.toEqual({
    status: 'signed_in',
    kind: 'sign_in',
  });
  const exchangeB = calls.filter((call) => call.url.includes('grant_type=pkce')).at(-1)!;
  expect(matchesChallenge(exchangeB.body.code_verifier, flowB)).toBe(true);
});

it('sin sb_flow_id (comportamiento anterior) se usaría el verificador más reciente', async () => {
  const { calls, client } = setup();
  await client.auth.signUp({ email: 'ana@example.com', password: 'Prueba2026', options: { emailRedirectTo: 'tyra://auth/callback' } });
  await client.auth.signUp({ email: 'ana@example.com', password: 'Prueba2026', options: { emailRedirectTo: 'tyra://auth/callback' } });
  const [flowA, flowB] = calls.filter((call) => call.url.includes('/signup')).map(flowFrom);

  await completeAuthRedirect('tyra://auth/callback?code=code-a');
  const exchange = calls.filter((call) => call.url.includes('grant_type=pkce')).at(-1)!;
  // Documenta el defecto corregido: el code de A se gastaría con el verificador de B.
  expect(matchesChallenge(exchange.body.code_verifier, flowB)).toBe(true);
  expect(matchesChallenge(exchange.body.code_verifier, flowA)).toBe(false);
});

it('recuperación y confirmación en curso a la vez: cada enlace conserva su tipo', async () => {
  const { calls, client } = setup();
  const events: string[] = [];
  client.auth.onAuthStateChange((event) => events.push(event));

  await client.auth.resetPasswordForEmail('ana@example.com', { redirectTo: 'tyra://auth/callback' });
  await client.auth.signUp({ email: 'beto@example.com', password: 'Prueba2026', options: { emailRedirectTo: 'tyra://auth/callback' } });
  const recovery = flowFrom(calls.find((call) => call.url.includes('/recover'))!);
  const signup = flowFrom(calls.find((call) => call.url.includes('/signup'))!);
  // /recover manda redirect_to en la query; el desafío va en el cuerpo igual que en /signup.
  expect(recovery.flowId).toBeTruthy();
  expect(recovery.flowId).not.toBe(signup.flowId);

  // El enlace de recuperación (el más viejo) se abre primero.
  await expect(completeAuthRedirect(`${recovery.redirectTo}&code=code-r`)).resolves.toEqual({
    status: 'signed_in',
    kind: 'recovery',
  });
  expect(events).toContain('PASSWORD_RECOVERY');
  const exchangeR = calls.filter((call) => call.url.includes('grant_type=pkce')).at(-1)!;
  expect(matchesChallenge(exchangeR.body.code_verifier, recovery)).toBe(true);

  // El de confirmación sigue siendo un inicio normal, no una recuperación.
  await expect(completeAuthRedirect(`${signup.redirectTo}&code=code-s`)).resolves.toEqual({
    status: 'signed_in',
    kind: 'sign_in',
  });
});
