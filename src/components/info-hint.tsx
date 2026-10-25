import { ChevronDown, ChevronUp, Info } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { controlHeight, radius, space } from '@/design/tokens';
import type { HealthHelp } from '@/lib/health-help';

/** Ayuda desplegable: botón con su pregunta (≥ 48 dp) y, al abrirla, explicación y fuente. */
export function InfoHint({ help }: { help: HealthHelp }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={help.title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.toggle, pressed && { backgroundColor: colors.surfaceMuted }]}>
        <Info size={18} color={colors.primary} />
        <AppText variant="label" tone="brand" style={styles.title}>
          {help.title}
        </AppText>
        <Chevron size={18} color={colors.primary} />
      </Pressable>
      {open && (
        <View style={[styles.body, { backgroundColor: colors.surfaceMuted }]} accessibilityLiveRegion="polite">
          <AppText variant="secondary">{help.body}</AppText>
          <AppText variant="caption">Fuente: {help.source}</AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    minHeight: controlHeight.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.control,
    paddingHorizontal: space.xxs,
  },
  title: { flex: 1 },
  body: { borderRadius: radius.control, padding: space.sm, gap: space.xxs },
});
