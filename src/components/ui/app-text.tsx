import { Text, type TextProps } from 'react-native';

import type { ColorTokens } from '@/design/palettes';
import { useTheme } from '@/design/theme-provider';
import { MAX_FONT_SCALE, typography, type TypographyVariant } from '@/design/tokens';

export type TextTone = 'primary' | 'secondary' | 'brand' | 'error' | 'success' | 'warning' | 'onPrimary';

const TONE_TOKEN: Record<TextTone, keyof ColorTokens> = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  brand: 'primary',
  error: 'error',
  success: 'success',
  warning: 'warning',
  onPrimary: 'onPrimary',
};

export type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  tone?: TextTone;
  /** Números tabulares para cantidades (montos, calorías). */
  tabular?: boolean;
  align?: 'left' | 'center' | 'right';
};

export function AppText({
  variant = 'body',
  tone,
  tabular = false,
  align,
  style,
  ...props
}: AppTextProps) {
  const { colors } = useTheme();
  const defaultTone: TextTone = variant === 'secondary' || variant === 'caption' ? 'secondary' : 'primary';
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      accessibilityRole={
        variant === 'display' || variant === 'title' || variant === 'section' ? 'header' : undefined
      }
      {...props}
      style={[
        typography[variant],
        { color: colors[TONE_TOKEN[tone ?? defaultTone]] },
        tabular && { fontVariant: ['tabular-nums'] },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
