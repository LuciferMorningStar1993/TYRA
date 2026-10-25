import { FinanceSummaryCard } from '@/components/finance-summary-card';
import { HealthSummarySection } from '@/components/health-summary-section';
import { AppText, Screen } from '@/components/ui';
import { useSession } from '@/providers/session-provider';

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function HomeScreen() {
  const { profile } = useSession();

  return (
    <Screen edges={['top']}>
      <AppText variant="secondary">{greeting()}</AppText>
      <AppText variant="title">{profile?.display_name ?? 'Hola'}</AppText>

      <HealthSummarySection />
      <FinanceSummaryCard />
    </Screen>
  );
}
