// Tokens no cromáticos del sistema de diseño TYRA.
import type { TextStyle } from 'react-native';

/** Espaciado en múltiplos de 4. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  control: 12,
  button: 14,
  card: 18,
  sheet: 24,
  pill: 999,
} as const;

/** Alturas mínimas de controles (objetivo táctil ≥ 48 dp). */
export const controlHeight = {
  touchTarget: 48,
  button: 52,
  input: 52,
  tabBar: 64,
} as const;

export const breakpoints = {
  tablet: 768,
  desktop: 1024,
} as const;

export const motion = {
  fast: 150,
  normal: 200,
  slow: 250,
} as const;

/** Familias Inter cargadas con @expo-google-fonts/inter (una por peso, necesario en Android). */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Límite de escalado de texto del sistema (200%). */
export const MAX_FONT_SCALE = 2;

export type TypographyVariant =
  | 'display'
  | 'title'
  | 'section'
  | 'cardTitle'
  | 'body'
  | 'bodyStrong'
  | 'secondary'
  | 'label'
  | 'caption';

export const typography: Record<TypographyVariant, TextStyle> = {
  display: { fontFamily: fontFamily.bold, fontSize: 32, lineHeight: 40 },
  title: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 36 },
  section: { fontFamily: fontFamily.semibold, fontSize: 22, lineHeight: 30 },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 24 },
  secondary: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16 },
};

/** Sombra suave para tarjetas; el color sale del tema (token shadow). */
export function softShadow(color: string, isDark: boolean) {
  return {
    shadowColor: color,
    shadowOpacity: isDark ? 0.4 : 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: isDark ? 0 : 3,
  } as const;
}
