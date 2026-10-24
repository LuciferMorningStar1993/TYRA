import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { ColorTokens } from '@/design/palettes';
import { useTheme } from '@/design/theme-provider';
import { controlHeight, radius, space } from '@/design/tokens';

import { AppText } from './app-text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';

type VariantStyle = {
  background: keyof ColorTokens | null;
  pressedBackground: keyof ColorTokens | null;
  foreground: keyof ColorTokens;
  border: keyof ColorTokens | null;
};

const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: { background: 'primary', pressedBackground: 'primaryPressed', foreground: 'onPrimary', border: null },
  secondary: {
    background: 'secondary',
    pressedBackground: 'secondaryPressed',
    foreground: 'onSecondary',
    border: null,
  },
  outline: { background: null, pressedBackground: 'surfaceMuted', foreground: 'primary', border: 'borderStrong' },
  ghost: { background: null, pressedBackground: 'surfaceMuted', foreground: 'primary', border: null },
  destructive: { background: 'error', pressedBackground: 'error', foreground: 'onError', border: null },
};

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  /** Contenido a la izquierda en lugar de un ícono Lucide (p. ej. el logo de Google). */
  leading?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon: Icon,
  leading,
  loading = false,
  disabled = false,
  accessibilityHint,
}: ButtonProps) {
  const { colors } = useTheme();
  const config = VARIANTS[variant];
  const inactive = disabled || loading;
  const foreground = colors[config.foreground];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={(state) => {
        // `focused` solo existe en web/teclado (react-native-web).
        const { pressed, focused } = state as typeof state & { focused?: boolean };
        const background = pressed ? config.pressedBackground : config.background;
        return [
          styles.base,
          {
            backgroundColor: background ? colors[background] : 'transparent',
            borderColor: config.border ? colors[config.border] : 'transparent',
            borderWidth: config.border ? 1.5 : 0,
            opacity: inactive ? 0.55 : variant === 'destructive' && pressed ? 0.85 : 1,
          },
          focused && { outlineColor: colors.focusRing, outlineWidth: 3, outlineStyle: 'solid' as const },
        ];
      }}>
      {loading ? (
        <ActivityIndicator color={foreground} accessibilityLabel="Cargando" />
      ) : (
        <View style={styles.content}>
          {leading}
          {Icon && <Icon size={20} color={foreground} strokeWidth={2.25} />}
          <AppText variant="bodyStrong" style={{ color: foreground }}>
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: controlHeight.button,
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
