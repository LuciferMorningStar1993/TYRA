import 'expo-sqlite/localStorage/install';

import { PALETTE_IDS, type PaletteId } from './palettes';

export type ColorMode = 'system' | 'light' | 'dark';

export const COLOR_MODES: ColorMode[] = ['system', 'light', 'dark'];

const PALETTE_KEY = 'tyra.theme.palette';
const MODE_KEY = 'tyra.theme.mode';

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as string[]).includes(value);
}

export function isColorMode(value: unknown): value is ColorMode {
  return typeof value === 'string' && (COLOR_MODES as string[]).includes(value);
}

/**
 * Preferencias guardadas en el dispositivo. Se leen de forma síncrona al arrancar
 * para pintar el tema correcto desde el primer frame (sin parpadeo).
 */
export function readStoredPreferences(): { palette: PaletteId | null; mode: ColorMode | null } {
  try {
    const palette = localStorage.getItem(PALETTE_KEY);
    const mode = localStorage.getItem(MODE_KEY);
    return {
      palette: isPaletteId(palette) ? palette : null,
      mode: isColorMode(mode) ? mode : null,
    };
  } catch {
    return { palette: null, mode: null };
  }
}

export function storePreferences(palette: PaletteId, mode: ColorMode): void {
  try {
    localStorage.setItem(PALETTE_KEY, palette);
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Sin almacenamiento local la app sigue funcionando con la preferencia del perfil.
  }
}

/**
 * Elección de apariencia que aún no confirma el servidor. Se guarda por usuario (clave
 * propia), con sus valores y una versión, ANTES de enviar la petición: así sobrevive a un
 * fallo, a cerrar la app con la petición en curso o a cerrar sesión, y no se mezcla entre cuentas.
 */
export type PendingAppearance = { owner: string; palette: PaletteId; mode: ColorMode; version: number };

const pendingKey = (owner: string) => `tyra.theme.pending.${owner}`;

export function readPendingAppearance(owner: string): PendingAppearance | null {
  try {
    const raw = localStorage.getItem(pendingKey(owner));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAppearance>;
    if (
      parsed.owner !== owner ||
      !isPaletteId(parsed.palette) ||
      !isColorMode(parsed.mode) ||
      typeof parsed.version !== 'number'
    ) {
      return null;
    }
    return parsed as PendingAppearance;
  } catch {
    return null;
  }
}

let lastIssuedVersion = 0;

/** Registra una nueva elección pendiente con la siguiente versión y la devuelve. */
export function writePendingAppearance(owner: string, palette: PaletteId, mode: ColorMode): PendingAppearance {
  // Creciente aunque el pendiente anterior ya se haya borrado (reloj + contador): nunca se repite.
  const version = Math.max(Date.now(), lastIssuedVersion + 1, (readPendingAppearance(owner)?.version ?? 0) + 1);
  lastIssuedVersion = version;
  const pending: PendingAppearance = { owner, palette, mode, version };
  try {
    localStorage.setItem(pendingKey(owner), JSON.stringify(pending));
  } catch {
    // Sin almacenamiento local la elección sigue en memoria durante la sesión.
  }
  return pending;
}

/** Borra el pendiente solo si sigue siendo la versión confirmada (uno más reciente no se toca). */
export function clearPendingAppearance(owner: string, version: number): void {
  if (readPendingAppearance(owner)?.version !== version) return;
  try {
    localStorage.removeItem(pendingKey(owner));
  } catch {
    // Ver storePreferences.
  }
}
