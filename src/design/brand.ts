// Identidad visual de TYRA. Los assets salen de assets/brand/source/ con scripts/brand-assets.sh
// (ver docs/brand.md): solo recorte y fondo transparente; el símbolo no se redibuja.
import type { ColorTokens } from './palettes';

/** Cian del símbolo original. Solo se usa sobre fondos oscuros (contraste ≥ 13:1). */
export const BRAND_CYAN = '#06F5FC';
/** Fondo oscuro del original: iconos de plataforma, splash y favicon. */
export const BRAND_BACKGROUND = '#0B1116';

export type LogoVariant = 'emblem' | 'full';

/** Ancho / alto de cada asset (tyra-emblem.png 631×767, tyra-logo.png 798×970). */
export const LOGO_ASPECT_RATIO: Record<LogoVariant, number> = {
  emblem: 631 / 767,
  full: 798 / 970,
};

/** Por debajo de este alto la palabra «TYRA» del logo completo queda diminuta: se usa el emblema. */
export const MIN_FULL_LOGO_HEIGHT = 96;

export function resolveLogoVariant(variant: LogoVariant, height: number): LogoVariant {
  return variant === 'full' && height < MIN_FULL_LOGO_HEIGHT ? 'emblem' : variant;
}

/**
 * Color del logo dentro de la app. En temas oscuros, el cian original (sin tinte). En claros el
 * cian no llega a 3:1, así que la misma forma se tiñe con textPrimary.
 */
export function logoTintColor(isDark: boolean, colors: ColorTokens): string | undefined {
  return isDark ? undefined : colors.textPrimary;
}
