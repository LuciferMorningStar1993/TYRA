import { router } from 'expo-router';
import { Dumbbell, Ruler, Utensils } from 'lucide-react-native';

import { ComingSoonCard } from '@/components/coming-soon-card';
import { HealthSummarySection } from '@/components/health-summary-section';
import { WeightCard } from '@/components/weight-card';
import { AppText, Card, ListItem, Screen } from '@/components/ui';

export default function HealthScreen() {
  return (
    <Screen edges={['top']}>
      <AppText variant="title">Salud</AppText>
      <HealthSummarySection />
      <WeightCard />
      <Card>
        <ListItem
          title="Datos de salud"
          subtitle="Estatura, actividad y objetivo"
          icon={Ruler}
          onPress={() => router.push('/datos-salud')}
        />
      </Card>
      <ComingSoonCard icon={Utensils} title="Comidas" description="Foto de tu plato y conteo de calorías y macros." />
      <ComingSoonCard icon={Dumbbell} title="Entrenamiento" description="Rutinas guiadas con temporizador y músculos trabajados." />
    </Screen>
  );
}
