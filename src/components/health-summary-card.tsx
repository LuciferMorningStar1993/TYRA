import { HeartPulse } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { radius, space } from '@/design/tokens';
import { formatNumber } from '@/lib/format';
import type { BmiCategory, HealthSummary } from '@/lib/health';

const BMI_LABELS: Record<BmiCategory, string> = {
  underweight: 'Bajo peso',
  normal: 'Peso saludable',
  overweight: 'Sobrepeso',
  obese: 'Obesidad',
};

/** Resumen de salud: meta calórica e indicadores base (con resumen textual accesible). */
export function HealthSummaryCard({ summary, weightKg }: { summary: HealthSummary; weightKg: number }) {
  const { colors } = useTheme();
  const kcal = formatNumber(summary.targetKcal);
  return (
    <Card>
      <View
        style={styles.header}
        accessible
        accessibilityLabel={`Salud. Meta diaria ${kcal} kilocalorías. IMC ${summary.bmi}, ${BMI_LABELS[summary.bmiCategory]}.`}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <HeartPulse size={22} color={colors.primary} />
        </View>
        <AppText variant="cardTitle">Salud</AppText>
      </View>

      <AppText variant="secondary">Meta diaria</AppText>
      <AppText variant="display" tabular>
        {kcal} <AppText variant="body" tone="secondary">kcal</AppText>
      </AppText>
      <AppText variant="secondary" tabular>
        Gasto estimado {formatNumber(summary.tdee)} kcal · Basal {formatNumber(summary.bmr)} kcal
      </AppText>

      <View style={styles.metrics}>
        <Metric label="IMC" value={String(summary.bmi)} detail={BMI_LABELS[summary.bmiCategory]} />
        <Metric label="Peso" value={`${formatNumber(weightKg, 1)} kg`} detail={`${summary.age} años`} />
      </View>
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
