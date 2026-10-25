import { router } from 'expo-router';
import { HeartPulse, Scale } from 'lucide-react-native';

import { HealthSummaryCard } from '@/components/health-summary-card';
import { AppText, Button, Card } from '@/components/ui';
import { useHealthSummary } from '@/hooks/use-health-summary';
import { formatMeasuredOn } from '@/lib/weight';

/** Resumen de salud con el peso vigente y sus estados (cargando, error, sin peso). Inicio y Salud. */
export function HealthSummarySection() {
  const health = useHealthSummary();

  if (health.status === 'ready') {
    const { entry, dateConfirmed } = health.weight;
    const caption =
      dateConfirmed && entry.measuredOn
        ? `Peso del ${formatMeasuredOn(entry.measuredOn)}.`
        : 'Peso de tu perfil · fecha sin confirmar.';
    return <HealthSummaryCard summary={health.summary} weightKg={entry.weightKg} weightCaption={caption} />;
  }

  return (
    <Card>
      <AppText variant="cardTitle">Salud</AppText>
      {health.status === 'loading' && <AppText variant="secondary">Cargando tu resumen de salud…</AppText>}
      {health.status === 'error' && (
        <>
          <AppText variant="secondary" tone="error" accessibilityLiveRegion="polite">
            No pudimos cargar tu peso. Revisa tu conexión.
          </AppText>
          <Button title="Reintentar" variant="outline" onPress={() => void health.retry()} />
        </>
      )}
      {health.status === 'no_weight' && (
        <>
          <AppText variant="secondary">Registra tu peso para calcular tu IMC y una estimación de calorías.</AppText>
          <Button title="Registrar peso" icon={Scale} onPress={() => router.push('/peso/registrar')} />
        </>
      )}
      {health.status === 'incomplete' && (
        <>
          <AppText variant="secondary">Completa tus datos de salud para ver tu resumen.</AppText>
          <Button title="Datos de salud" icon={HeartPulse} variant="outline" onPress={() => router.push('/datos-salud')} />
        </>
      )}
    </Card>
  );
}
