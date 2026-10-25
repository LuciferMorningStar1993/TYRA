import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { radius, space } from '@/design/tokens';
import { formatKg, formatMeasuredOn, type WeightEntry } from '@/lib/weight';
import { describeGoalProgress, type GoalProgress, type StartStatus, type WeightGoal } from '@/lib/weight-goal';

/** Aviso cuando la medición de partida cambió después de fijar la meta (nunca es avance). */
export function startNotice(goal: WeightGoal, start: StartStatus | null, startEntry: WeightEntry | null): string | null {
  const from = `${formatKg(goal.startWeightKg)} (${formatMeasuredOn(goal.startMeasuredOn)})`;
  if (start === 'corrected' && startEntry) {
    return `La medición de partida se corrigió (antes ${formatKg(goal.startWeightKg)}, ahora ${formatKg(startEntry.weightKg)}). Tu avance se mide desde ${from}; puedes reiniciar el punto de partida.`;
  }
  if (start === 'deleted') {
    return `La medición de partida se eliminó. Tu avance se mide desde ${from}; puedes reiniciar el punto de partida.`;
  }
  return null;
}

/** Estado de la meta en palabras y, solo con avance real, una barra accesible. */
export function WeightGoalProgress({
  progress,
  notice,
}: {
  progress: GoalProgress;
  notice?: string | null;
}) {
  const { colors } = useTheme();
  const text = describeGoalProgress(progress);
  const fraction = 'progress' in progress ? progress.progress : null;
  if (!text) return null;
  return (
    <View style={styles.block}>
      <AppText variant="secondary" tabular>
        {text}
      </AppText>
      {fraction !== null && (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Avance hacia tu meta"
          // aria-value*: react-native-web no traduce accessibilityValue; estas props sirven en todas las plataformas.
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuetext={text}
          style={[styles.track, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong }]}>
          <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%`, backgroundColor: colors.primary }]} />
        </View>
      )}
      {notice && (
        <AppText variant="secondary" tone="warning" accessibilityLiveRegion="polite">
          {notice}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.xxs + 2 },
  track: { height: 10, borderRadius: radius.pill, borderWidth: 1, overflow: 'hidden' },
  fill: { height: '100%' },
});
