import { describeSupabaseConfig, isLocalBackendUrl, resolveSupabaseConfig } from './supabase-config';

const REMOTE = 'https://hzvyhfnlidprpnswfurw.supabase.co';
const LOCAL = 'http://127.0.0.1:55321';

describe('isLocalBackendUrl', () => {
  it.each([
    'http://127.0.0.1:55321',
    'http://localhost:55321',
    'http://tyra.localhost',
    'http://[::1]:55321',
    'http://10.0.2.2:55321',
    'http://192.168.1.20:55321',
    'http://172.20.0.5:55321/rest/v1',
  ])('acepta %s', (url) => {
    expect(isLocalBackendUrl(url)).toBe(true);
  });

  it.each([
    REMOTE,
    'https://example.com',
    'http://127.0.0.1.attacker.com',
    'http://localhost.attacker.com',
    'http://172.32.0.1',
    'http://8.8.8.8',
    'ftp://localhost',
    'localhost:55321',
    '',
  ])('rechaza %p', (url) => {
    expect(isLocalBackendUrl(url)).toBe(false);
  });
});

describe('resolveSupabaseConfig', () => {
  const normal = { url: REMOTE, publishableKey: 'sb_publishable_normal' };

  it('modo normal: sin cambios', () => {
    expect(resolveSupabaseConfig(normal)).toEqual({ mode: 'normal', ...normal });
  });

  it('modo QA con URL remota: se bloquea', () => {
    expect(() =>
      resolveSupabaseConfig({ ...normal, qaLocal: '1', qaUrl: REMOTE, qaPublishableKey: 'sb_publishable_qa' }),
    ).toThrow(/Backend bloqueado/);
  });

  it('modo QA ignora las variables normales (remotas) aunque existan', () => {
    expect(
      resolveSupabaseConfig({ ...normal, qaLocal: '1', qaUrl: LOCAL, qaPublishableKey: 'sb_publishable_qa' }),
    ).toEqual({ mode: 'qa-local', url: LOCAL, publishableKey: 'sb_publishable_qa' });
  });

  it('modo QA sin variables QA: falla cerrado, nunca cae al remoto', () => {
    expect(() => resolveSupabaseConfig({ ...normal, qaLocal: '1' })).toThrow(/Faltan EXPO_PUBLIC_QA/);
  });

  it('describe la configuración sin exponer la clave', () => {
    const text = describeSupabaseConfig({ mode: 'qa-local', url: LOCAL, publishableKey: 'sb_publishable_secretito' });
    expect(text).toContain(LOCAL);
    expect(text).not.toContain('secretito');
  });
});
