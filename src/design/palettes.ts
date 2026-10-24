// Paletas de TYRA. Los valores de marca vienen del brief; las variantes "on*",
// superficies y tonos oscuros están ajustados para cumplir WCAG AA (ver palettes.test.ts).

export type PaletteId = 'aurora' | 'nordic' | 'indigo';
export type ColorScheme = 'light' | 'dark';

/** Tokens semánticos de color. Los componentes solo consumen estos nombres. */
export type ColorTokens = {
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  secondary: string;
  secondaryPressed: string;
  onSecondary: string;
  accent: string;
  onAccent: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  border: string;
  borderStrong: string;
  success: string;
  warning: string;
  error: string;
  onError: string;
  focusRing: string;
  shadow: string;
};

export type PaletteDefinition = {
  id: PaletteId;
  name: string;
  description: string;
  /** Colores de marca originales (para muestras e ilustraciones). */
  brand: { primary: string; secondary: string; accent: string };
  light: ColorTokens;
  dark: ColorTokens;
};

export const PALETTES: Record<PaletteId, PaletteDefinition> = {
  aurora: {
    id: 'aurora',
    name: 'TYRA Aurora',
    description: 'Violeta y turquesa',
    brand: { primary: '#7035D9', secondary: '#008EAE', accent: '#F3B4E6' },
    light: {
      primary: '#7035D9',
      primaryPressed: '#5A26B8',
      onPrimary: '#FFFFFF',
      primarySoft: '#EFE7FC',
      secondary: '#00718B',
      secondaryPressed: '#005B70',
      onSecondary: '#FFFFFF',
      accent: '#F3B4E6',
      onAccent: '#211A30',
      background: '#FAF8FF',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      surfaceMuted: '#F2EDFA',
      textPrimary: '#211A30',
      textSecondary: '#5C546D',
      textDisabled: '#9C95AB',
      border: '#E6E0F0',
      borderStrong: '#857C97',
      success: '#1D7A4C',
      warning: '#8F5B00',
      error: '#C0262D',
      onError: '#FFFFFF',
      focusRing: '#7035D9',
      shadow: '#2B1A4D',
    },
    dark: {
      primary: '#B597FF',
      primaryPressed: '#9F7AF5',
      onPrimary: '#1B1035',
      primarySoft: '#2E2349',
      secondary: '#4FC6E0',
      secondaryPressed: '#38AFC9',
      onSecondary: '#04222A',
      accent: '#F3B4E6',
      onAccent: '#2A1530',
      background: '#121019',
      surface: '#1B1825',
      surfaceElevated: '#242032',
      surfaceMuted: '#2A253A',
      textPrimary: '#F2EEFA',
      textSecondary: '#B9B1CB',
      textDisabled: '#6E6782',
      border: '#332D45',
      borderStrong: '#7F7595',
      success: '#5CD69A',
      warning: '#F2BC55',
      error: '#FF8E86',
      onError: '#2C0A0A',
      focusRing: '#F3B4E6',
      shadow: '#000000',
    },
  },
  nordic: {
    id: 'nordic',
    name: 'TYRA Nordic',
    description: 'Azul y verde petróleo',
    brand: { primary: '#2455D6', secondary: '#087F75', accent: '#88BFF2' },
    light: {
      primary: '#2455D6',
      primaryPressed: '#1B44B0',
      onPrimary: '#FFFFFF',
      primarySoft: '#E5ECFB',
      secondary: '#087F75',
      secondaryPressed: '#06675F',
      onSecondary: '#FFFFFF',
      accent: '#88BFF2',
      onAccent: '#18232F',
      background: '#F4F6F8',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      surfaceMuted: '#EAEEF2',
      textPrimary: '#18232F',
      textSecondary: '#4F5D6B',
      textDisabled: '#929DA8',
      border: '#DDE3E9',
      borderStrong: '#77838F',
      success: '#1D7A4C',
      warning: '#8F5B00',
      error: '#C0262D',
      onError: '#FFFFFF',
      focusRing: '#2455D6',
      shadow: '#0F1C2E',
    },
    dark: {
      primary: '#86A9FF',
      primaryPressed: '#6E94F2',
      onPrimary: '#0A1633',
      primarySoft: '#1E2B45',
      secondary: '#4FD1C1',
      secondaryPressed: '#3ABAAA',
      onSecondary: '#04231F',
      accent: '#88BFF2',
      onAccent: '#0B1A2A',
      background: '#0D1218',
      surface: '#151C25',
      surfaceElevated: '#1C2531',
      surfaceMuted: '#212C3A',
      textPrimary: '#E9EEF4',
      textSecondary: '#A8B5C3',
      textDisabled: '#5F6C7A',
      border: '#29343F',
      borderStrong: '#6D7C8C',
      success: '#5CD69A',
      warning: '#F2BC55',
      error: '#FF8E86',
      onError: '#2C0A0A',
      focusRing: '#88BFF2',
      shadow: '#000000',
    },
  },
  indigo: {
    id: 'indigo',
    name: 'TYRA Indigo',
    description: 'Índigo y esmeralda',
    brand: { primary: '#4945E8', secondary: '#16A889', accent: '#B5A5FF' },
    light: {
      primary: '#4945E8',
      primaryPressed: '#3733C7',
      onPrimary: '#FFFFFF',
      primarySoft: '#ECEBFD',
      secondary: '#0B7A62',
      secondaryPressed: '#08634F',
      onSecondary: '#FFFFFF',
      accent: '#B5A5FF',
      onAccent: '#171B2B',
      background: '#F7F8FC',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      surfaceMuted: '#EEF0F7',
      textPrimary: '#171B2B',
      textSecondary: '#535870',
      textDisabled: '#979BB0',
      border: '#E1E3EE',
      borderStrong: '#7B7F97',
      success: '#1D7A4C',
      warning: '#8F5B00',
      error: '#C0262D',
      onError: '#FFFFFF',
      focusRing: '#4945E8',
      shadow: '#14163A',
    },
    dark: {
      primary: '#A4A1FF',
      primaryPressed: '#8D89F5',
      onPrimary: '#13123A',
      primarySoft: '#25264A',
      secondary: '#4FDBB9',
      secondaryPressed: '#3AC4A3',
      onSecondary: '#04261E',
      accent: '#B5A5FF',
      onAccent: '#191538',
      background: '#0F1020',
      surface: '#181A2D',
      surfaceElevated: '#21233A',
      surfaceMuted: '#262944',
      textPrimary: '#ECEDF8',
      textSecondary: '#ADB0C8',
      textDisabled: '#62657E',
      border: '#2E3150',
      borderStrong: '#737796',
      success: '#5CD69A',
      warning: '#F2BC55',
      error: '#FF8E86',
      onError: '#2C0A0A',
      focusRing: '#B5A5FF',
      shadow: '#000000',
    },
  },
};

export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];

export type Gender = 'female' | 'male' | 'other' | 'unspecified';

/** Sugerencia inicial de paleta según el género (nunca es una restricción). */
export function suggestedPalette(gender: Gender | null | undefined): PaletteId {
  if (gender === 'female') return 'aurora';
  if (gender === 'male') return 'nordic';
  return 'indigo';
}
