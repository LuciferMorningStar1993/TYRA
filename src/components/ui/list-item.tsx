import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme-provider';
import { controlHeight, radius, space } from '@/design/tokens';

import { AppText } from './app-text';

export function ListItem({
  title,
  subtitle,
  icon: Icon,
  onPress,
  destructive = false,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const tint = destructive ? colors.error : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}>
      {Icon && (
        <View style={[styles.icon, { backgroundColor: destructive ? colors.surfaceMuted : colors.primarySoft }]}>
          <Icon size={20} color={tint} />
        </View>
      )}
      <View style={styles.text}>
        <AppText variant="bodyStrong" tone={destructive ? 'error' : 'primary'}>
          {title}
        </AppText>
        {subtitle && <AppText variant="secondary">{subtitle}</AppText>}
      </View>
      {!destructive && <ChevronRight size={20} color={colors.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: controlHeight.touchTarget + space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
    borderRadius: radius.control,
  },
  icon: { width: 40, height: 40, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
