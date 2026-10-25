import { Dumbbell, Utensils } from 'lucide-react-native';

import { ComingSoonCard } from '@/components/coming-soon-card';
import { HealthSummaryCard } from '@/components/health-summary-card';
import { AppText, Screen } from '@/components/ui';
import { useHealthSummary } from '@/hooks/use-health-summary';

export default function HealthScreen() {
  const health = useHealthSummary();
  return (
    <Screen edges={['top']}>
      <AppText variant="title">Salud</AppText>
      {health && <HealthSummaryCard summary={health.summary} weightKg={health.weightKg} />}
      <ComingSoonCard icon={Utensils} title="Comidas" description="Foto de tu plato y conteo de calorías y macros." />
      <ComingSoonCard icon={Dumbbell} title="Entrenamiento" description="Rutinas guiadas con temporizador y músculos trabajados." />
    </Screen>
  );
}
