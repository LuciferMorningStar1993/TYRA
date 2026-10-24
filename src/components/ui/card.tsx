import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme-provider';
import { radius, softShadow, space } from '@/design/tokens';

export function Card({
  children,
  tone = 'surface',
  style,
}: PropsWithChildren<{ tone?: 'surface' | 'muted' | 'brand'; style?: StyleProp<ViewStyle> }>) {
  const { colors, isDark } = useTheme();
  const backgroundColor =
    tone === 'muted' ? colors.surfaceMuted : tone === 'brand' ? colors.primarySoft : colors.surfaceElevated;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor, borderColor: colors.border },
        tone === 'surface' && softShadow(colors.shadow, isDark),
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: space.xs,
  },
});
