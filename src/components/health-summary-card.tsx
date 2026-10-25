import { HeartPulse } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { radius, space } from '@/design/tokens';
import { formatNumber } from '@/lib/format';
import { HEALTH_AGE_POLICY, type BmiCategory, type Goal, type HealthSummary } from '@/lib/health';

const BMI_LABELS: Record<BmiCategory, string> = {
  underweight: 'Bajo peso',
  normal: 'Peso saludable',
  overweight: 'Sobrepeso',
  obese: 'Obesidad',
};

const GOAL_LABELS: Record<Goal, string> = {
  lose: 'para bajar de peso',
  maintain: 'para mantener tu peso',
  gain: 'para subir de peso',
};

/** Explicación de por qué no hay estimación de gasto. */
export function expenditureUnavailableMessage(summary: HealthSummary): string | null {
  const { expenditure } = summary;
  if (expenditure.available) return null;
  if (expenditure.reason === 'invalid_estimate') {
    return 'Con los datos de tu perfil la fórmula no da una estimación válida. Revisa estatura y peso.';
  }
  return summary.age < HEALTH_AGE_POLICY.energyEstimate.minAge
    ? `La estimación de calorías está disponible a partir de los ${HEALTH_AGE_POLICY.energyEstimate.minAge} años.`
    : 'Para tu edad la estimación automática de calorías no está validada.';
}

/** Explicación de por qué no hay meta automática (cuando sí hay gasto estimado). */
export function targetUnavailableMessage(summary: HealthSummary): string | null {
  const { target } = summary;
  if (target.available || target.reason === 'no_expenditure' || target.reason === 'no_bmi') return null;
  if (target.reason === 'below_basal') {
    return 'Una meta automática para bajar de peso quedaría por debajo de tu gasto basal estimado, así que no la calculamos. Un profesional puede ayudarte a definir un plan.';
  }
  return 'Con tu IMC actual no ofrecemos una meta automática para este objetivo. Un profesional puede ayudarte a definir un plan.';
}

/**
 * Resumen de salud. Muestra por separado el gasto estimado (descriptivo) y la meta según
 * el objetivo (recomendación), y explica cada resultado no disponible.
 */
export function HealthSummaryCard({ summary, weightKg }: { summary: HealthSummary; weightKg: number }) {
  const { colors } = useTheme();
  const { bmi, expenditure, target } = summary;
  const expenditureMessage = expenditureUnavailableMessage(summary);
  const targetMessage = targetUnavailableMessage(summary);

  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <HeartPulse size={22} color={colors.primary} />
        </View>
        <AppText variant="cardTitle">Salud</AppText>
      </View>

      {target.available && (
        <View
          accessible
          accessibilityLabel={`Meta diaria ${GOAL_LABELS[target.goal]}: ${formatNumber(target.kcal)} kilocalorías.`}>
          <AppText variant="secondary">Meta diaria {GOAL_LABELS[target.goal]}</AppText>
          <AppText variant="display" tabular>
            {formatNumber(target.kcal)} <AppText variant="body" tone="secondary">kcal</AppText>
          </AppText>
        </View>
      )}

      {expenditure.available ? (
        <AppText
          variant="secondary"
          tabular
          accessibilityLabel={`Gasto diario estimado ${formatNumber(expenditure.tdee)} kilocalorías; basal ${formatNumber(expenditure.bmr)}.`}>
          Gasto diario estimado {formatNumber(expenditure.tdee)} kcal · Basal {formatNumber(expenditure.bmr)} kcal
        </AppText>
      ) : (
        <AppText variant="secondary">{expenditureMessage}</AppText>
      )}

      {targetMessage && <AppText variant="secondary">{targetMessage}</AppText>}

      <View style={styles.metrics}>
        {bmi.available && <Metric label="IMC" value={String(bmi.value)} detail={BMI_LABELS[bmi.category]} />}
        <Metric label="Peso" value={`${formatNumber(weightKg, 1)} kg`} detail={`${summary.age} años`} />
      </View>

      {expenditure.available && (
        <AppText variant="caption">Estimación orientativa; no sustituye la valoración de un profesional.</AppText>
      )}
    </Card>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metric, { backgroundColor: colors.surfaceMuted }]}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="cardTitle" tabular>
        {value}
      </AppText>
      <AppText variant="secondary">{detail}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  icon: { width: 40, height: 40, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  metric: { flex: 1, borderRadius: radius.control, padding: space.sm, gap: 2 },
});
