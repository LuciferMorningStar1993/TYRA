import { StatusBar } from 'expo-status-bar';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

import { createLatestWriter } from '@/lib/latest-writer';
import { useSession } from '@/providers/session-provider';

import { PALETTES, type ColorScheme, type ColorTokens, type PaletteId } from './palettes';
import {
  clearPendingAppearance,
  isColorMode,
  isPaletteId,
  readPendingAppearance,
  readStoredPreferences,
  storePreferences,
  writePendingAppearance,
  type ColorMode,
  type PendingAppearance,
} from './theme-preferences';

const DEFAULT_PALETTE: PaletteId = 'indigo';
const DEFAULT_MODE: ColorMode = 'system';

export const APPEARANCE_SAVE_ERROR =
  'No pudimos guardar tu apariencia en tu cuenta. Se aplicó en este dispositivo; reintenta para sincronizarla.';

type ThemeContextValue = {
  palette: PaletteId;
  mode: ColorMode;
  scheme: ColorScheme;
  isDark: boolean;
  colors: ColorTokens;
  setPalette: (palette: PaletteId) => void;
  setMode: (mode: ColorMode) => void;
  /** Muestra una paleta sin guardarla (borradores de registro y onboarding). null la quita. */
  previewPalette: (palette: PaletteId | null) => void;
  /** Error del último guardado de apariencia del usuario actual, si falló. */
  saveError: string | null;
  retrySave: () => void;
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
 * Prioridad: vista previa (borrador) → elección pendiente de confirmar de este usuario →
 * perfil (sincroniza entre dispositivos) → última apariencia del dispositivo → valores por defecto.
 * El género solo sugiere la paleta en los borradores; nunca cambia el tema guardado.
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  const { session, profile, saveProfile } = useSession();
  const userId = session?.user.id ?? null;
  const systemScheme = useColorScheme();

  // Se vuelve a leer el almacenamiento al cambiar de usuario y tras cada elección.
  const [storageVersion, setStorageVersion] = useState(0);
  const pending = useMemo(
    () => (userId ? readPendingAppearance(userId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, storageVersion],
  );
  const device = useMemo(
    () => readStoredPreferences(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, storageVersion],
  );
  const [preview, setPreview] = useState<PaletteId | null>(null);
  const [saveError, setSaveError] = useState<{ owner: string; message: string } | null>(null);

  const palette: PaletteId =
    pending?.palette ??
    (isPaletteId(profile?.theme_palette) ? profile.theme_palette : null) ??
    device.palette ??
    DEFAULT_PALETTE;
  const mode: ColorMode =
    pending?.mode ?? (isColorMode(profile?.color_mode) ? profile.color_mode : null) ?? device.mode ?? DEFAULT_MODE;
  const shownPalette = preview ?? palette;
  const scheme: ColorScheme = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  // Copia local para pintar el tema correcto en el siguiente arranque (sin parpadeo).
  useEffect(() => {
    storePreferences(palette, mode);
  }, [palette, mode]);

  // El escritor se crea una vez y siempre usa el saveProfile vigente.
  const saveRef = useRef(saveProfile);
  useEffect(() => {
    saveRef.current = saveProfile;
  }, [saveProfile]);
  const writerRef = useRef<ReturnType<typeof createLatestWriter<PendingAppearance>> | null>(null);
  const sendPending = useCallback((next: PendingAppearance) => {
    writerRef.current ??= createLatestWriter<PendingAppearance>(
      async (choice) => {
        const result = await saveRef.current({ theme_palette: choice.palette, color_mode: choice.mode }, choice.owner);
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      },
      (choice, result) => {
        if (result.ok) {
          // Solo borra si nadie registró una elección más nueva mientras tanto.
          clearPendingAppearance(choice.owner, choice.version);
          setSaveError((current) => (current?.owner === choice.owner ? null : current));
        } else if (result.error !== 'stale_session') {
          // El pendiente se conserva para reintentar; el error queda asociado a su usuario.
          setSaveError({ owner: choice.owner, message: APPEARANCE_SAVE_ERROR });
        }
        setStorageVersion((value) => value + 1);
      },
    );
    writerRef.current.set(next);
  }, []);

  // Al cargar el perfil, reenvía una elección que quedó sin confirmar (fallo, app cerrada o logout).
  const profileLoaded = !!profile;
  useEffect(() => {
    if (!userId || !profileLoaded) return;
    const stillPending = readPendingAppearance(userId);
    if (stillPending) sendPending(stillPending);
  }, [userId, profileLoaded, sendPending]);

  const choose = useCallback(
    (nextPalette: PaletteId, nextMode: ColorMode) => {
      if (userId) {
        // Se registra antes de enviar: si la app se cierra a mitad, la intención no se pierde.
        sendPending(writePendingAppearance(userId, nextPalette, nextMode));
      } else {
        storePreferences(nextPalette, nextMode);
      }
      setStorageVersion((value) => value + 1);
    },
    [userId, sendPending],
  );

  const setPalette = useCallback((next: PaletteId) => choose(next, mode), [choose, mode]);
  const setMode = useCallback((next: ColorMode) => choose(palette, next), [choose, palette]);

  const retrySave = useCallback(() => {
    if (!userId) return;
    sendPending(readPendingAppearance(userId) ?? writePendingAppearance(userId, palette, mode));
  }, [userId, palette, mode, sendPending]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      palette: shownPalette,
      mode,
      scheme,
      isDark: scheme === 'dark',
      colors: PALETTES[shownPalette][scheme],
      setPalette,
      setMode,
      previewPalette: setPreview,
      saveError: saveError?.owner === userId ? saveError.message : null,
      retrySave,
    }),
    [shownPalette, mode, scheme, setPalette, setMode, saveError, userId, retrySave],
  );

  return (
    <ThemeContext value={value}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext>
  );
}
