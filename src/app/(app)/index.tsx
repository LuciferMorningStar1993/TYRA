import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { healthSummary, type BmiCategory } from '@/lib/health';
import { toHealthProfile } from '@/lib/profile';
import { useSession } from '@/providers/session-provider';

const BMI_LABELS: Record<BmiCategory, string> = {
  underweight: 'Bajo peso',
  normal: 'Peso saludable',
  overweight: 'Sobrepeso',
  obese: 'Obesidad',
};

export default function HomeScreen() {
  const { profile, signOut } = useSession();
  const healthProfile = profile ? toHealthProfile(profile) : null;
  const summary = healthProfile ? healthSummary(healthProfile) : null;

  return (
    <Screen>
      <AppText variant="title">Hola, {profile?.display_name ?? ''} 👋</AppText>

      {summary ? (
        <>
          <Card>
            <AppText variant="muted">Tu meta diaria</AppText>
            <AppText variant="title">{summary.targetKcal.toLocaleString('es-MX')} kcal</AppText>
            <AppText variant="muted">
              Gasto estimado {summary.tdee.toLocaleString('es-MX')} kcal · Metabolismo basal{' '}
              {summary.bmr.toLocaleString('es-MX')} kcal
            </AppText>
          </Card>

          <View style={styles.row}>
            <View style={styles.flex}>
              <Card>
                <AppText variant="muted">IMC</AppText>
                <AppText variant="subtitle">{summary.bmi}</AppText>
                <AppText variant="muted">{BMI_LABELS[summary.bmiCategory]}</AppText>
              </Card>
            </View>
            <View style={styles.flex}>
              <Card>
                <AppText variant="muted">Edad</AppText>
                <AppText variant="subtitle">{summary.age} años</AppText>
                <AppText variant="muted">{profile?.weight_kg} kg</AppText>
              </Card>
            </View>
          </View>
        </>
      ) : (
        <AppText variant="error">Tu perfil está incompleto.</AppText>
      )}

      <AppText variant="muted">
        Próximamente: registro de comidas, rutinas, gastos y metas de ahorro.
      </AppText>

      <Button title="Cerrar sesión" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
