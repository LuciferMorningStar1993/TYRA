import { router } from 'expo-router';
import { RotateCcw, Save, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { InfoHint } from '@/components/info-hint';
import { startNotice, WeightGoalProgress } from '@/components/weight-goal-progress';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { space } from '@/design/tokens';
import { useWeightGoal } from '@/hooks/use-weight-goal';
import { bmi, bmiCategory, HEALTH_AGE_POLICY, type Goal } from '@/lib/health';
import { HEALTH_HELP } from '@/lib/health-help';
import { formatKg, formatMeasuredOn } from '@/lib/weight';
import { goalActionMessage } from '@/lib/weight-api';
import { goalDirection, validateGoalTarget, type GoalDirection } from '@/lib/weight-goal';
import { useSession } from '@/providers/session-provider';
import { useWeight, type GoalActionResult } from '@/providers/weight-provider';

const BMI_LABELS = { underweight: 'bajo peso', normal: 'peso saludable', overweight: 'sobrepeso', obese: 'obesidad' } as const;
const PROFILE_GOAL_DIRECTION: Record<Goal, GoalDirection> = { lose: 'lose', gain: 'gain', maintain: 'maintain' };

/** Meta de peso opcional: fijar, cambiar, reiniciar el punto de partida o eliminarla. */
export default function WeightGoalScreen() {
  const { session, profile } = useSession();
  const userId = session?.user.id;
  const { state, current, saveGoal, deleteGoal } = useWeight();
  const goalState = useWeightGoal();
  const overview = state.status === 'ready' ? state.overview : null;
  const goal = overview?.goal ?? null;

  const [target, setTarget] = useState(goal ? String(goal.targetWeightKg) : '');
  // Meta (id + versión) que muestra el campo: si cambia (otra creación, guardado o recarga tras un
  // conflicto), el campo pasa a mostrar la meta vigente.
  const goalKey = goal ? `${goal.id}:${goal.version}` : null;
  const [targetFor, setTargetFor] = useState(goalKey);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);

  if (goalKey !== targetFor) {
    setTargetFor(goalKey);
    setTarget(goal ? String(goal.targetWeightKg) : '');
  }

  if (goalState.status !== 'ready' || !overview) {
    return (
      <Screen edges={['bottom']}>
        <AppText variant="secondary" tone={goalState.status === 'error' ? 'error' : undefined}>
          {goalState.status === 'error' ? 'No pudimos cargar tu meta. Revisa tu conexión.' : 'Cargando…'}
        </AppText>
      </Screen>
    );
  }

  const { progress, start, age } = goalState;
  const latestDated = overview.recent[0] ?? null;
  const parsed = validateGoalTarget(target);
  const heightCm = profile?.height_cm ? Number(profile.height_cm) : null;
  const bmiText =
    parsed.targetKg && heightCm
      ? (() => {
          const value = bmi(parsed.targetKg, heightCm);
          return `Con tu estatura, ${formatKg(parsed.targetKg)} corresponde a un IMC de ${value} (${BMI_LABELS[bmiCategory(value)]}, OMS). Es solo una referencia.`;
        })()
      : null;
  const startForDirection = goal?.startWeightKg ?? latestDated?.weightKg ?? null;
  const direction = parsed.targetKg && startForDirection ? goalDirection(startForDirection, parsed.targetKg) : null;
  const profileGoal = profile?.goal as Goal | null;
  const mismatch = direction && profileGoal && PROFILE_GOAL_DIRECTION[profileGoal] !== direction;

  function show(result: GoalActionResult, success: string) {
    const text = goalActionMessage(result);
    setMessage(text ? { tone: 'error', text } : { tone: 'success', text: success });
  }

  async function save(resetStart = false) {
    setError(null);
    setMessage(null);
    setConfirm(null);
    const { targetKg, error: targetError } = validateGoalTarget(target);
    if (targetKg === null) return setError(targetError ?? 'Revisa la meta.');
    setSaving(true);
    const result = await saveGoal({ targetKg, goal: goal ?? undefined, resetStart }, userId);
    setSaving(false);
    show(result, resetStart ? 'Punto de partida reiniciado.' : goal ? 'Meta actualizada.' : 'Meta guardada.');
  }

  async function remove() {
    if (!goal) return;
    setMessage(null);
    setConfirm(null);
    setSaving(true);
    const result = await deleteGoal(goal, userId);
    setSaving(false);
    if (result.status === 'deleted') return router.back();
    show(result, '');
  }

  if (progress.status === 'not_eligible') {
    return (
      <Screen edges={['bottom']}>
        <Card>
          <AppText variant="secondary">
            La meta de peso está disponible desde los {HEALTH_AGE_POLICY.weightGoal.minAge} años
            {age === null ? ' y necesita tu fecha de nacimiento' : ''}. Puedes seguir registrando tu peso y consultar tu
            historial.
          </AppText>
          {goal && (
            <Button title="Eliminar meta guardada" icon={Trash2} variant="ghost" loading={saving} onPress={() => void remove()} />
          )}
        </Card>
      </Screen>
    );
  }


  const notice = goal ? startNotice(goal, start, overview.goalStartEntry) : null;

  return (
    <Screen edges={['bottom']}>
      <Card>
        <AppText variant="cardTitle">{goal ? 'Tu meta de peso' : 'Fijar meta de peso'}</AppText>
        {goal ? (
          <WeightGoalProgress progress={progress} notice={notice} />
        ) : latestDated ? (
          <AppText variant="secondary">
            Tu punto de partida será tu medición más reciente: {formatKg(latestDated.weightKg)} (
            {formatMeasuredOn(latestDated.measuredOn ?? '')}).
          </AppText>
        ) : (
          <AppText variant="secondary">
            {current
              ? 'Confirma la fecha de tu peso del perfil o registra una medición para fijar tu meta.'
              : 'Registra tu peso para fijar una meta.'}
          </AppText>
        )}
        {goal && (
          <AppText variant="caption">
            Punto de partida registrado al fijar tu meta: {formatKg(goal.startWeightKg)} ({formatMeasuredOn(goal.startMeasuredOn)}).
          </AppText>
        )}

        {(goal || latestDated) && (
          <>
            <TextField
              label="Peso meta (kg)"
              value={target}
              onChangeText={setTarget}
              error={error}
              placeholder="68"
              keyboardType="decimal-pad"
            />
            {bmiText && <AppText variant="caption">{bmiText}</AppText>}
            {mismatch && (
              <AppText variant="secondary">
                Tu objetivo en Datos de salud es otro. Esta meta no lo cambia ni cambia tu meta de calorías.
              </AppText>
            )}
            {message && (
              <AppText
                variant="secondary"
                tone={message.tone}
                accessibilityLiveRegion={message.tone === 'error' ? 'assertive' : 'polite'}>
                {message.text}
              </AppText>
            )}
            <Button title={goal ? 'Guardar cambios' : 'Guardar meta'} icon={Save} loading={saving} onPress={() => void save()} />
          </>
        )}
        <InfoHint help={HEALTH_HELP.goalProgress} />
      </Card>

      {goal && (
        <Card>
          {confirm === 'reset' && latestDated ? (
            <View style={styles.confirm}>
              <AppText variant="secondary">
                Tu nuevo punto de partida será {formatKg(latestDated.weightKg)} ({formatMeasuredOn(latestDated.measuredOn ?? '')}).
                Tu avance empezará de nuevo desde ahí.
              </AppText>
              <Button title="Sí, reiniciar" icon={RotateCcw} loading={saving} onPress={() => void save(true)} />
              <Button title="Cancelar" variant="ghost" onPress={() => setConfirm(null)} />
            </View>
          ) : confirm === 'delete' ? (
            <View style={styles.confirm}>
              <AppText variant="secondary">¿Eliminar tu meta? Tus mediciones no cambian.</AppText>
              <Button title="Sí, eliminar meta" icon={Trash2} variant="destructive" loading={saving} onPress={() => void remove()} />
              <Button title="Cancelar" variant="ghost" onPress={() => setConfirm(null)} />
            </View>
          ) : (
            <View style={styles.confirm}>
              {latestDated && (
                <Button title="Reiniciar punto de partida" icon={RotateCcw} variant="outline" onPress={() => setConfirm('reset')} />
              )}
              <Button title="Eliminar meta" icon={Trash2} variant="ghost" onPress={() => setConfirm('delete')} />
            </View>
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  confirm: { gap: space.xs },
});
