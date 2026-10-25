import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { radius, space } from '@/design/tokens';

export function ComingSoonCard({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  const { colors } = useTheme();
  return (
    <Card tone="muted">
      <View style={styles.row} accessible accessibilityLabel={`${title}. Próximamente. ${description}`}>
        <View style={[styles.icon, { backgroundColor: colors.surface }]}>
          <Icon size={22} color={colors.textSecondary} />
        </View>
        <View style={styles.text}>
          <AppText variant="bodyStrong">{title}</AppText>
          <AppText variant="secondary">{description}</AppText>
          <AppText variant="caption" tone="brand">
            Próximamente
          </AppText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
