// Resuelve a qué Supabase se conecta la app.
//
// Modo normal: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (de .env.local).
// Modo QA local (EXPO_PUBLIC_QA_LOCAL=1, ver docs/qa-local.md): usa SOLO las variables
// EXPO_PUBLIC_QA_SUPABASE_*, que no existen en .env.local, y rechaza cualquier host que no
// sea local ANTES de crear el cliente. Así una prueba manual nunca escribe en el remoto.

export type SupabaseEnv = {
  qaLocal?: string;
  url?: string;
  publishableKey?: string;
  qaUrl?: string;
  qaPublishableKey?: string;
};

export type SupabaseConfig = { mode: 'normal' | 'qa-local'; url: string; publishableKey: string };

/** Hosts aceptados en QA local: esta máquina, el emulador de Android y redes privadas (LAN). */
export function isLocalBackendUrl(url: string): boolean {
  const match = /^https?:\/\/(\[[^\]]+\]|[^/:?#]+)(?::\d+)?(?:[/?#]|$)/i.exec(url.trim());
  if (!match) return false;
  const host = match[1].toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]') return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  return (
    a === 127 || // loopback
    a === 10 || // incluye 10.0.2.2 (emulador de Android)
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31)
  );
}

export function resolveSupabaseConfig(env: SupabaseEnv): SupabaseConfig {
  if (env.qaLocal === '1') {
    if (!env.qaUrl || !env.qaPublishableKey) {
      throw new Error(
        '[QA local] Faltan EXPO_PUBLIC_QA_SUPABASE_URL / EXPO_PUBLIC_QA_SUPABASE_PUBLISHABLE_KEY. Usa `npm run start:qa`.',
      );
    }
    if (!isLocalBackendUrl(env.qaUrl)) {
      throw new Error(`[QA local] Backend bloqueado: "${env.qaUrl}" no es local. No se creó el cliente.`);
    }
    return { mode: 'qa-local', url: env.qaUrl, publishableKey: env.qaPublishableKey };
  }

  if (!env.url || !env.publishableKey) {
    throw new Error(
      'Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local (ver .env.example)',
    );
  }
  return { mode: 'normal', url: env.url, publishableKey: env.publishableKey };
}

/** Descripción segura de la configuración efectiva (sin claves). */
export function describeSupabaseConfig(config: SupabaseConfig): string {
  return `Supabase (${config.mode}): ${config.url} · clave publicable: presente`;
}
