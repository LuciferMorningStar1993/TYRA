import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { radius, space } from '@/design/tokens';
import { describeChange, formatKg, formatMeasuredOn, formatMonth, type MonthStatus } from '@/lib/weight';

/**
 * Un renglón por mes del rango: sin datos, insuficiente (una medición) o con promedio y variación
 * entre la primera y la última medición del mes. No compara años ni saca conclusiones estacionales.
 */
export function MonthlyWeightSummary({ months }: { months: readonly MonthStatus[] }) {
  return (
    <View style={styles.list}>
      {months.map((month) => (
        <MonthRow key={month.month} month={month} />
      ))}
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
  row: { borderRadius: radius.control, padding: space.sm, gap: 2 },
});
