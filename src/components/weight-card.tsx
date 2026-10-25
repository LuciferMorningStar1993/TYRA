import { router } from 'expo-router';
import { History, Scale, Target } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { WeightChart } from '@/components/weight-chart';
import { WeightGoalProgress } from '@/components/weight-goal-progress';
import { useWeightGoal } from '@/hooks/use-weight-goal';
import { AppText, Button, Card } from '@/components/ui';
import { space } from '@/design/tokens';
import { chartPoints, formatKg, formatMeasuredOn, rangeStart } from '@/lib/weight';
import { useWeight } from '@/providers/weight-provider';

/** Tarjeta «Peso» de Salud: peso vigente, evolución de 30 días y accesos a registrar e historial. */
export function WeightCard() {
  const { state, current, reload } = useWeight();
  const goalState = useWeightGoal();
  const goal = goalState.status === 'ready' ? goalState.progress : null;
  const showGoal = goal && goal.status !== 'not_eligible' && (goal.status !== 'no_goal' || goal.canSet);
  const today = new Date();
  const from = rangeStart('30d', today);

  return (
    <Card>
      <AppText variant="cardTitle">Peso</AppText>
      {state.status === 'loading' && <AppText variant="secondary">Cargando…</AppText>}
      {state.status === 'error' && (
        <>
          <AppText variant="secondary" tone="error" accessibilityLiveRegion="polite">
            No pudimos cargar tu peso. Revisa tu conexión.
          </AppText>
          <Button title="Reintentar" variant="outline" onPress={() => void reload()} />
        </>
      )}
      {state.status === 'ready' && (
        <>
          {current ? (
            <View
              accessible
              accessibilityLabel={`Peso actual ${formatKg(current.entry.weightKg)}. ${
                current.entry.measuredOn ? `Medido el ${formatMeasuredOn(current.entry.measuredOn)}` : 'Fecha sin confirmar'
              }.`}>
              <AppText variant="display" tabular>
                {formatKg(current.entry.weightKg)}
              </AppText>
              <AppText variant="secondary">
                {current.entry.measuredOn ? formatMeasuredOn(current.entry.measuredOn) : 'Peso de tu perfil · fecha sin confirmar'}
              </AppText>
            </View>
          ) : (
            <AppText variant="secondary">Aún no registras tu peso.</AppText>
          )}
          {state.overview.legacy && (
            <View style={styles.notice}>
              <AppText variant="secondary">
                Tu peso del perfil ({formatKg(state.overview.legacy.weightKg)}) no tiene fecha de medición. Confírmala para
                incluirlo en tu evolución.
              </AppText>
              <Button
                title="Confirmar fecha"
                variant="outline"
                onPress={() => router.push({ pathname: '/peso/registrar', params: { id: state.overview.legacy!.id } })}
              />
            </View>
          )}
          {state.overview.recent.length > 0 && (
            <WeightChart points={chartPoints(state.overview.recent, from)} from={from} to={today} height={96} />
          )}
        </>
      )}
      {showGoal && goal.status !== 'no_goal' && <WeightGoalProgress progress={goal} />}
      <View style={styles.actions}>
        <Button title="Registrar peso" icon={Scale} onPress={() => router.push('/peso/registrar')} />
        {showGoal && (
          <Button
            title={goal.status === 'no_goal' ? 'Fijar meta' : 'Ver meta'}
            icon={Target}
            variant="outline"
            onPress={() => router.push('/peso/meta')}
          />
        )}
        <Button title="Ver historial" icon={History} variant="outline" onPress={() => router.push('/peso')} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  notice: { gap: space.xs },
  actions: { gap: space.xs, marginTop: space.xs },
});
