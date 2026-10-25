import { Image, StyleSheet, type ImageProps } from 'react-native';

import { decorative } from '@/design/a11y';
import { LOGO_ASPECT_RATIO, logoTintColor, resolveLogoVariant, type LogoVariant } from '@/design/brand';
import { useTheme } from '@/design/theme-provider';

const SOURCES = {
  emblem: require('../../assets/brand/tyra-emblem.png'),
  full: require('../../assets/brand/tyra-logo.png'),
};

type A11yProps = Pick<
  ImageProps,
  'accessible' | 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityElementsHidden' | 'importantForAccessibility' | 'aria-hidden'
>;

type Props = {
  /** `full`: emblema + «TYRA» (desde 96 de alto; si no cabe se muestra el emblema). */
  variant?: LogoVariant;
  /** Alto en dp; el ancho sale de la proporción original. */
  height: number;
  /** true si al lado ya se lee «TYRA» o el logo solo decora: se oculta a lectores de pantalla. */
  decorative?: boolean;
};

/** Logo de TYRA con fondo transparente: cian en temas oscuros y textPrimary en claros. */
export function TyraLogo({ variant = 'emblem', height, decorative: isDecorative = false }: Props) {
  const { isDark, colors } = useTheme();
  const shown = resolveLogoVariant(variant, height);
  const tintColor = logoTintColor(isDark, colors);
  const a11y: A11yProps = isDecorative
    ? decorative
    : { accessible: true, accessibilityRole: 'image', accessibilityLabel: 'TYRA' };

  return (
    <Image
      {...a11y}
      source={SOURCES[shown]}
      resizeMode="contain"
      style={[styles.image, { height, width: height * LOGO_ASPECT_RATIO[shown] }, tintColor ? { tintColor } : null]}
    />
  );
}

const styles = StyleSheet.create({
  image: { flexShrink: 0 },
});
