import { PiggyBank, ReceiptText } from 'lucide-react-native';

import { ComingSoonCard } from '@/components/coming-soon-card';
import { FinanceSummaryCard } from '@/components/finance-summary-card';
import { AppText, Screen } from '@/components/ui';

export default function FinanceScreen() {
  return (
    <Screen edges={['top']}>
      <AppText variant="title">Finanzas</AppText>
      <FinanceSummaryCard />
      <ComingSoonCard icon={ReceiptText} title="Movimientos" description="Ingresos y gastos por cuenta, y lectura de tickets con foto." />
      <ComingSoonCard icon={PiggyBank} title="Ahorro e inversión" description="Metas de ahorro y simulador de CETES." />
    </Screen>
  );
}
