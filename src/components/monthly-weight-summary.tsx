import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { controlHeight, radius, space } from '@/design/tokens';
import { describeChange, formatKg, formatMeasuredOn, formatMonth, type MonthStatus } from '@/lib/weight';

/**
 * Un renglón por mes del rango: sin datos, insuficiente (una medición) o con promedio y variación
 * entre la primera y la última medición del mes. No compara años ni saca conclusiones estacionales.
 */
export function MonthlyWeightSummary({
  months,
  groupByYear = false,
}: {
  months: readonly MonthStatus[];
  /** «Todo»: agrupa por año; el más reciente abierto. */
  groupByYear?: boolean;
}) {
  if (!groupByYear) {
    return (
      <View style={styles.list}>
        {months.map((month) => (
          <MonthRow key={month.month} month={month} />
        ))}
      </View>
    );
  }
  const years = [...new Set(months.map((month) => month.month.slice(0, 4)))];
  return (
    <View style={styles.list}>
      {years.map((year, index) => (
        <YearGroup key={year} year={year} months={months.filter((month) => month.month.startsWith(year))} initiallyOpen={index === 0} />
      ))}
    </View>
  );
}

function YearGroup({ year, months, initiallyOpen }: { year: string; months: readonly MonthStatus[]; initiallyOpen: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const withData = months.filter((month) => month.status !== 'no_data').length;
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={styles.list}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${year}: ${withData} de ${months.length} meses con datos`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.yearToggle, pressed && { backgroundColor: colors.surfaceMuted }]}>
        <AppText variant="bodyStrong" style={styles.yearTitle}>
          {year}
        </AppText>
        <AppText variant="secondary">
          {withData} de {months.length} meses con datos
        </AppText>
        <Chevron size={18} color={colors.primary} />
      </Pressable>
      {open && months.map((month) => <MonthRow key={month.month} month={month} />)}
    </View>
  );
}

function MonthRow({ month }: { month: MonthStatus }) {
  const { colors } = useTheme();
  const title = formatMonth(month.month);
  let detail: string;
  if (month.status === 'no_data') {
    detail = 'Sin datos';
  } else if (month.status === 'insufficient') {
    detail = `Una medición: ${formatKg(month.weightKg)} (${formatMeasuredOn(month.measuredOn)}). Datos insuficientes para promedio y variación.`;
  } else {
    detail =
      `${month.entries} mediciones · promedio ${formatKg(month.averageKg)} · ` +
      `de ${formatKg(month.firstWeightKg)} a ${formatKg(month.lastWeightKg)} (${describeChange(month.changeKg)})`;
  }
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${detail}`}
      style={[styles.row, { backgroundColor: colors.surfaceMuted }]}>
      <AppText variant="bodyStrong">{title}</AppText>
      <AppText variant="secondary" tabular>
        {detail}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xs },
  yearToggle: {
    minHeight: controlHeight.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.control,
    paddingHorizontal: space.xxs,
  },
  yearTitle: { flex: 1 },
  row: { borderRadius: radius.control, padding: space.sm, gap: 2 },
});
