import { FinanceSummaryCard } from '@/components/finance-summary-card';
import { HealthSummaryCard } from '@/components/health-summary-card';
import { AppText, Screen } from '@/components/ui';
import { useHealthSummary } from '@/hooks/use-health-summary';
import { useSession } from '@/providers/session-provider';

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function HomeScreen() {
  const { profile } = useSession();
  const health = useHealthSummary();

  return (
    <Screen edges={['top']}>
      <AppText variant="secondary">{greeting()}</AppText>
      <AppText variant="title">{profile?.display_name ?? 'Hola'}</AppText>

      {health && <HealthSummaryCard summary={health.summary} weightKg={health.weightKg} />}
      <FinanceSummaryCard />
    </Screen>
  );
}
