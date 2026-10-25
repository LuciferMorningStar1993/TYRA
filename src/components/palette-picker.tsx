import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { PALETTE_IDS, PALETTES, type PaletteId } from '@/design/palettes';
import { useTheme } from '@/design/theme-provider';
import { controlHeight, radius, space } from '@/design/tokens';

/** Selector de paleta con muestras de color. La activa lleva check y texto "Seleccionado". */
export function PalettePicker({
  value,
  onChange,
  suggested,
}: {
  value: PaletteId;
  onChange: (palette: PaletteId) => void;
  suggested?: PaletteId;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Paleta de colores" style={styles.list}>
      {PALETTE_IDS.map((id) => {
        const palette = PALETTES[id];
        const selected = id === value;
        const status = [selected && 'Seleccionado', id === suggested && 'Sugerido'].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityLabel={`${palette.name}, ${palette.description}${status ? `. ${status}` : ''}`}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(id)}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: selected ? colors.primary : colors.border,
                borderWidth: selected ? 2 : 1,
                backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
              },
            ]}>
            <View style={styles.swatches}>
              {[palette.brand.primary, palette.brand.secondary, palette.brand.accent].map((color) => (
                <View key={color} style={[styles.swatch, { backgroundColor: color, borderColor: colors.surface }]} />
              ))}
            </View>
            <View style={styles.text}>
              <AppText variant="bodyStrong">{palette.name}</AppText>
              <AppText variant="secondary">
                {palette.description}
                {status ? ` · ${status}` : ''}
              </AppText>
            </View>
            {selected && <Check size={22} color={colors.primary} strokeWidth={2.5} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xs },
  option: {
    minHeight: controlHeight.touchTarget + space.md,
    borderRadius: radius.control,
    padding: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  swatches: { flexDirection: 'row' },
  swatch: { width: 26, height: 26, borderRadius: radius.pill, borderWidth: 2, marginRight: -8 },
  text: { flex: 1, marginLeft: space.xs },
});
