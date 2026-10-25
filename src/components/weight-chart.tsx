import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { decorative } from '@/design/a11y';
import { useTheme } from '@/design/theme-provider';
import { space } from '@/design/tokens';
import { formatDateOnly } from '@/lib/profile';
import { chartLayout, chartSummary, formatKg, formatMeasuredOn, weightScale, weightToY, type ChartPoint } from '@/lib/weight';

const PADDING = 10;

/**
 * Evolución del peso con mediciones vigentes y fechadas. Para lectores de pantalla se resume en
 * texto; la lista del historial es la alternativa detallada.
 * - Diario (por defecto): cada punto RELLENO es una medición; los días sin datos no se interpolan.
 * - Mensual («Todo»): cada círculo VACÍO es un promedio mensual; la línea solo une meses consecutivos
 *   (`segments`), así que un mes sin datos la interrumpe.
 * - Meta: línea punteada si cae dentro de la escala; si no, se indica en texto.
 */
export function WeightChart({
  points,
  from,
  to,
  height = 160,
  segments,
  summary,
  goalKg,
}: {
  points: readonly ChartPoint[];
  from: Date;
  to: Date;
  height?: number;
  /** Solo en modo mensual: índices de meses consecutivos con datos. */
  segments?: readonly (readonly number[])[];
  /** Resumen accesible propio (p. ej. el mensual). */
  summary?: string;
  goalKg?: number | null;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const monthly = segments !== undefined;
  const size = { width, height, padding: PADDING };
  const coordinates = width > 0 ? chartLayout(points, size, from, to) : [];
  const scale = weightScale(points);
  const goalY = width > 0 && scale && goalKg ? weightToY(goalKg, scale, size) : null;
  const goalOutside = Boolean(goalKg && scale && (goalKg < scale.min || goalKg > scale.max));
  const weights = points.map((point) => point.weightKg);
  const lines = monthly ? segments : [points.map((_, index) => index)];

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { height, borderColor: colors.border }]}>
        <AppText variant="secondary" align="center">
          Sin mediciones en este periodo.
        </AppText>
      </View>
    );
  }

  const goalText = goalKg
    ? goalOutside
      ? ` Meta: ${formatKg(goalKg)} (fuera de la escala de este periodo).`
      : ` Línea de meta en ${formatKg(goalKg)}.`
    : '';

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${summary ?? chartSummary(points)}${goalText}`}
      style={styles.chart}>
      <View style={styles.axis} {...decorative}>
        <AppText variant="caption" tabular>
          Máx. {formatKg(Math.max(...weights))}
        </AppText>
        <AppText variant="caption" tabular>
          Mín. {formatKg(Math.min(...weights))}
        </AppText>
      </View>
      <View style={{ height }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} {...decorative}>
        {width > 0 && (
          <Svg width={width} height={height}>
            <Line x1={PADDING} y1={height - PADDING} x2={width - PADDING} y2={height - PADDING} stroke={colors.border} strokeWidth={1} />
            {goalY !== null && (
              <Line
                x1={PADDING}
                y1={goalY}
                x2={width - PADDING}
                y2={goalY}
                stroke={colors.textSecondary}
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
            )}
            {lines.map((indices) =>
              indices.length > 1 ? (
                <Polyline
                  key={indices.join('-')}
                  points={indices.map((index) => `${coordinates[index].x},${coordinates[index].y}`).join(' ')}
                  fill="none"
                  stroke={colors.primary}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null,
            )}
            {coordinates.map(({ x, y }, index) =>
              monthly ? (
                <Circle key={points[index].measuredOn} cx={x} cy={y} r={5} fill={colors.surface} stroke={colors.primary} strokeWidth={2} />
              ) : (
                <Circle key={points[index].measuredOn} cx={x} cy={y} r={4} fill={colors.primary} />
              ),
            )}
          </Svg>
        )}
      </View>
      {/* Extremos del periodo (el eje x es el calendario real, no la primera y última medición). */}
      <View style={styles.axis} {...decorative}>
        <AppText variant="caption">{formatMeasuredOn(formatDateOnly(from))}</AppText>
        <AppText variant="caption">{formatMeasuredOn(formatDateOnly(to))}</AppText>
      </View>
      {(monthly || goalKg) && (
        <View style={styles.legend} {...decorative}>
          {monthly && <AppText variant="caption">○ Promedio mensual · ● Medición</AppText>}
          {goalKg && !goalOutside && <AppText variant="caption">– – Meta {formatKg(goalKg)}</AppText>}
          {goalKg && goalOutside && <AppText variant="caption">Meta: {formatKg(goalKg)} (fuera de la escala de este periodo)</AppText>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: space.xxs },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  legend: { gap: 2 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: space.md },
});
