import { router } from 'expo-router';
import { Plus, Scale } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { InfoHint } from '@/components/info-hint';
import { MonthlyWeightSummary } from '@/components/monthly-weight-summary';
import { RecentWeightActivity } from '@/components/recent-weight-activity';
import { WeightChart } from '@/components/weight-chart';
import { AppText, Button, Card, ListItem, OptionGroup, Screen, type Option } from '@/components/ui';
import { HEALTH_HELP } from '@/lib/health-help';
import { formatDateOnly } from '@/lib/profile';
import {
  chartPoints,
  formatKg,
  formatMeasuredOn,
  monthlyStatuses,
  rangeStart,
  wasCorrected,
  type ChartRange,
  type WeightEntry,
} from '@/lib/weight';
import { loadHistoryPage, loadWeightRange } from '@/lib/weight-api';
import { useSession } from '@/providers/session-provider';
import { useWeight } from '@/providers/weight-provider';

const RANGE_OPTIONS: readonly Option<ChartRange>[] = [
  { value: '30d', label: '30 días' },
  { value: '90d', label: '90 días' },
  { value: '1y', label: '1 año' },
];

type RangeData = { key: string; status: 'ok'; entries: WeightEntry[] } | { key: string; status: 'error' };
type ExtraPages = { revision: number; entries: WeightEntry[]; hasMore: boolean };

const openEntry = (id: string) => router.push({ pathname: '/peso/registrar', params: { id } });

/** Historial y evolución del peso: gráfica por rango, resúmenes mensuales y lista paginada. */
export default function WeightHistoryScreen() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { state, revision, reload } = useWeight();
  const [range, setRange] = useState<ChartRange>('90d');
  const [rangeData, setRangeData] = useState<RangeData | null>(null);
  const [extra, setExtra] = useState<ExtraPages | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);

  const today = new Date();
  const from = rangeStart(range, today);
  const fromKey = formatDateOnly(from);
  // La gráfica se vuelve a leer al cambiar el rango o tras cualquier cambio confirmado (revision).
  const rangeKey = `${userId}:${fromKey}:${revision}`;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void loadWeightRange(userId, fromKey).then((result) => {
      if (!active) return; // respuesta de un rango, revisión o sesión anterior
      setRangeData(result.status === 'ok' ? { key: rangeKey, status: 'ok', entries: result.data } : { key: rangeKey, status: 'error' });
    });
    return () => {
      active = false;
    };
  }, [userId, fromKey, rangeKey]);

  if (state.status !== 'ready') {
    return (
      <Screen edges={['bottom']}>
        {state.status === 'loading' ? (
          <AppText variant="secondary">Cargando…</AppText>
        ) : (
          <Card>
            <AppText variant="secondary" tone="error">
              No pudimos cargar tu historial. Revisa tu conexión.
            </AppText>
            <Button title="Reintentar" variant="outline" onPress={() => void reload()} />
          </Card>
        )}
      </Screen>
    );
  }

  const { overview } = state;
  // Las páginas adicionales solo valen para la revisión con la que se cargaron.
  const currentExtra = extra?.revision === revision ? extra : null;
  const history = [...overview.recent, ...(currentExtra?.entries ?? [])];
  const hasMore = currentExtra ? currentExtra.hasMore : overview.hasMore;
  const chart = rangeData?.key === rangeKey ? rangeData : null;

  async function loadMore() {
    const last = history[history.length - 1];
    if (!userId || !last?.measuredOn) return;
    setLoadingMore(true);
    setPageError(false);
    const requestRevision = revision;
    const result = await loadHistoryPage(userId, last.measuredOn);
    setLoadingMore(false);
    if (result.status === 'error') {
      setPageError(true);
      return;
    }
    // Si mientras tanto hubo un cambio confirmado (otra revisión), esta página se descarta al leerla.
    setExtra((previous) => ({
      revision: requestRevision,
      entries: [...(previous?.revision === requestRevision ? previous.entries : []), ...result.data.entries],
      hasMore: result.data.hasMore,
    }));
  }

  const empty = history.length === 0 && !overview.legacy;

  return (
    <Screen edges={['bottom']}>
      <Button title="Registrar peso" icon={Plus} onPress={() => router.push('/peso/registrar')} />

      {empty ? (
        <Card>
          <AppText variant="secondary">Aún no registras tu peso. Tus mediciones aparecerán aquí.</AppText>
        </Card>
      ) : (
        <>
          <Card>
            <AppText variant="cardTitle">Evolución</AppText>
            <OptionGroup label="Periodo" options={RANGE_OPTIONS} value={range} onChange={setRange} />
            {!chart && <AppText variant="secondary">Cargando…</AppText>}
            {chart?.status === 'error' && (
              <AppText variant="secondary" tone="error">
                No pudimos cargar la gráfica.
              </AppText>
            )}
            {chart?.status === 'ok' && <WeightChart points={chartPoints(chart.entries)} from={from} to={today} />}
            {overview.legacy && (
              <AppText variant="caption">El peso de tu perfil sin fecha confirmada no aparece en la gráfica ni en los resúmenes.</AppText>
            )}
          </Card>

          <Card>
            <AppText variant="cardTitle">Resumen por mes</AppText>
            <InfoHint help={HEALTH_HELP.monthlyChange} />
            <MonthlyWeightSummary months={monthlyStatuses(overview.monthly, from, today)} />
          </Card>

          <Card>
            <AppText variant="cardTitle">Mediciones</AppText>
            {overview.legacy && (
              <ListItem
                title={formatKg(overview.legacy.weightKg)}
                subtitle="Peso de tu perfil · fecha sin confirmar"
                icon={Scale}
                onPress={() => openEntry(overview.legacy!.id)}
              />
            )}
            {history.map((entry) => (
              <ListItem
                key={entry.id}
                title={formatKg(entry.weightKg)}
                subtitle={`${entry.measuredOn ? formatMeasuredOn(entry.measuredOn) : 'Sin fecha'}${wasCorrected(entry) ? ' · Corregida' : ''}`}
                onPress={() => openEntry(entry.id)}
              />
            ))}
            {pageError && (
              <AppText variant="secondary" tone="error">
                No pudimos cargar más mediciones.
              </AppText>
            )}
            {hasMore && <Button title="Ver más" variant="outline" loading={loadingMore} onPress={() => void loadMore()} />}
          </Card>
        </>
      )}

      {/* Visible también sin mediciones vigentes: lo eliminado sigue en el historial disponible. */}
      {userId && <RecentWeightActivity userId={userId} revision={revision} />}
    </Screen>
  );
}
