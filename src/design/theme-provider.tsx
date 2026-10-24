import { StatusBar } from 'expo-status-bar';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

import { useSession } from '@/providers/session-provider';

import { PALETTES, type ColorScheme, type ColorTokens, type PaletteId } from './palettes';
import {
  isColorMode,
  isPaletteId,
  readStoredPreferences,
  storePreferences,
  type ColorMode,
} from './theme-preferences';

const DEFAULT_PALETTE: PaletteId = 'indigo';
const DEFAULT_MODE: ColorMode = 'system';

type ThemeContextValue = {
  palette: PaletteId;
  mode: ColorMode;
  scheme: ColorScheme;
  isDark: boolean;
  colors: ColorTokens;
  setPalette: (palette: PaletteId) => void;
  setMode: (mode: ColorMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = use(ThemeContext);
  if (!value) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  }
  return value;
}

/**
 * Prioridad: preferencia guardada en el perfil (sincroniza entre dispositivos) →
 * preferencia guardada en el dispositivo → valores por defecto.
 * El género solo se usa como sugerencia al registrarse; nunca cambia el tema después.
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  const { profile, updateProfile } = useSession();
  const systemScheme = useColorScheme();
  const [local, setLocal] = useState(readStoredPreferences);

  const palette: PaletteId = isPaletteId(profile?.theme_palette)
    ? profile.theme_palette
    : (local.palette ?? DEFAULT_PALETTE);
  const mode: ColorMode = isColorMode(profile?.color_mode)
    ? profile.color_mode
    : (local.mode ?? DEFAULT_MODE);
  const scheme: ColorScheme = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  // Copia local para pintar el tema correcto en el siguiente arranque, antes de cargar el perfil.
  useEffect(() => {
    storePreferences(palette, mode);
  }, [palette, mode]);

  const setPalette = useCallback(
    (next: PaletteId) => {
      setLocal((current) => ({ ...current, palette: next }));
      if (profile) void updateProfile({ theme_palette: next });
    },
    [profile, updateProfile],
  );

  const setMode = useCallback(
    (next: ColorMode) => {
      setLocal((current) => ({ ...current, mode: next }));
      if (profile) void updateProfile({ color_mode: next });
    },
    [profile, updateProfile],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      palette,
      mode,
      scheme,
      isDark: scheme === 'dark',
      colors: PALETTES[palette][scheme],
      setPalette,
      setMode,
    }),
    [palette, mode, scheme, setPalette, setMode],
  );

  return (
    <ThemeContext value={value}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext>
  );
}
