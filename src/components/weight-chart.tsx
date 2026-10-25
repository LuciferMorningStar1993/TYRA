import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { decorative } from '@/design/a11y';
import { useTheme } from '@/design/theme-provider';
import { space } from '@/design/tokens';
import { formatDateOnly } from '@/lib/profile';
import { chartLayout, chartSummary, formatKg, formatMeasuredOn, type ChartPoint } from '@/lib/weight';

const PADDING = 10;

/**
 * Evolución del peso con mediciones vigentes y fechadas. Cada punto es un día con medición; los
 * días sin datos no se interpolan (x sigue el calendario real). Para lectores de pantalla se
 * resume en texto; la lista del historial es la alternativa detallada.
 */
export function WeightChart({
  points,
  from,
  to,
  height = 160,
}: {
  points: readonly ChartPoint[];
  from: Date;
  to: Date;
  height?: number;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const coordinates = width > 0 ? chartLayout(points, { width, height, padding: PADDING }, from, to) : [];
  const weights = points.map((point) => point.weightKg);

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { height, borderColor: colors.border }]}>
        <AppText variant="secondary" align="center">
          Sin mediciones en este periodo.
        </AppText>
      </View>
    );
  }

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={chartSummary(points)} style={styles.chart}>
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
            {coordinates.length > 1 && (
              <Polyline
                points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')}
                fill="none"
                stroke={colors.primary}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {coordinates.map(({ x, y }, index) => (
              <Circle key={points[index].measuredOn} cx={x} cy={y} r={4} fill={colors.primary} />
            ))}
          </Svg>
        )}
      </View>
      {/* Extremos del periodo (el eje x es el calendario real, no la primera y última medición). */}
      <View style={styles.axis} {...decorative}>
        <AppText variant="caption">{formatMeasuredOn(formatDateOnly(from))}</AppText>
        <AppText variant="caption">{formatMeasuredOn(formatDateOnly(to))}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: space.xxs },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: space.md },
});
