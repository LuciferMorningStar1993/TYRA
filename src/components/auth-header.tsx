import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { decorative } from '@/design/a11y';
import { useTheme } from '@/design/theme-provider';
import { radius, space } from '@/design/tokens';

export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={[styles.logo, { backgroundColor: colors.primary }]} {...decorative}>
        <AppText variant="title" tone="onPrimary">
          T
        </AppText>
      </View>
      <AppText variant="title">{title}</AppText>
      <AppText variant="body" tone="secondary">
        {subtitle}
      </AppText>
    </View>
  );
}

export function OrDivider() {
  const { colors } = useTheme();
  return (
    <View style={styles.divider} {...decorative}>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
      <AppText variant="secondary">o</AppText>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs, marginBottom: space.xs },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
