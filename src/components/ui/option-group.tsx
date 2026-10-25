import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme-provider';
import { controlHeight, radius, space } from '@/design/tokens';

import { AppText } from './app-text';

export type Option<T extends string> = { value: T; label: string };

/** Selección única tipo "chips". La opción activa lleva ícono de check, no solo color. */
export function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      <AppText variant="label">{label}</AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.options}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: selected ? colors.primary : colors.borderStrong,
                  borderWidth: selected ? 2 : 1.5,
                  backgroundColor: selected ? colors.primarySoft : pressed ? colors.surfaceMuted : colors.surface,
                },
              ]}>
              {selected && <Check size={18} color={colors.primary} strokeWidth={2.5} />}
              <AppText variant="label" tone={selected ? 'brand' : 'primary'}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {error && (
        <AppText variant="secondary" tone="error" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.xs },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  option: {
    minHeight: controlHeight.touchTarget,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
  },
});
