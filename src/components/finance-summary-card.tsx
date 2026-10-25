import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { radius, space } from '@/design/tokens';
import { formatCurrency } from '@/lib/format';

/**
 * Resumen financiero del mes. Aún no hay movimientos en la base de datos, así que
 * muestra el estado vacío; cuando exista el módulo de finanzas recibirá los totales.
 */
export function FinanceSummaryCard({ income = 0, expenses = 0 }: { income?: number; expenses?: number }) {
  const { colors } = useTheme();
  const balance = income - expenses;
  const isEmpty = income === 0 && expenses === 0;
  return (
    <Card>
      <View
        style={styles.header}
        accessible
        accessibilityLabel={`Finanzas del mes. Balance ${formatCurrency(balance)}. Ingresos ${formatCurrency(income)}. Gastos ${formatCurrency(expenses)}.`}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Wallet size={22} color={colors.primary} />
        </View>
        <AppText variant="cardTitle">Finanzas del mes</AppText>
      </View>

      <AppText variant="secondary">Balance</AppText>
      <AppText variant="display" tabular>
        {formatCurrency(balance)}
      </AppText>

      <View style={styles.row}>
        <Flow icon={ArrowDownLeft} label="Ingresos" amount={income} />
        <Flow icon={ArrowUpRight} label="Gastos" amount={expenses} />
      </View>

      {isEmpty && (
        <AppText variant="secondary">Aún no registras movimientos. Pronto podrás agregarlos aquí.</AppText>
      )}
    </Card>
  );
}

function Flow({ icon: Icon, label, amount }: { icon: typeof Wallet; label: string; amount: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.flow, { backgroundColor: colors.surfaceMuted }]}>
      <View style={styles.flowLabel}>
        <Icon size={16} color={colors.textSecondary} />
        <AppText variant="caption">{label}</AppText>
      </View>
      <AppText variant="bodyStrong" tabular>
        {formatCurrency(amount)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  icon: { width: 40, height: 40, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  flow: { flex: 1, borderRadius: radius.control, padding: space.sm, gap: 2 },
  flowLabel: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
});
