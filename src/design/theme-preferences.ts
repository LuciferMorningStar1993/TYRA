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
