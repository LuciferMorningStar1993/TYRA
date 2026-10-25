import { StyleSheet, View } from 'react-native';

import { TyraLogo } from '@/components/tyra-logo';
import { AppText } from '@/components/ui';
import { decorative } from '@/design/a11y';
import { useTheme } from '@/design/theme-provider';
import { space } from '@/design/tokens';

export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.logo}>
        <TyraLogo variant="full" height={96} />
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
  logo: { alignItems: 'flex-start', marginBottom: space.xs },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
