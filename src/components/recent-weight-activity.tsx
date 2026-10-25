import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CORRECTIONS_RETENTION_NOTE, describeCorrection } from '@/components/weight-corrections';
import { AppText, Button, Card } from '@/components/ui';
import { space } from '@/design/tokens';
import { loadRecentActivity, type WeightCorrection } from '@/lib/weight-api';

type ActivityState =
  | { key: string; status: 'ok'; items: WeightCorrection[]; hasMore: boolean }
  | { key: string; status: 'error' };

/**
 * Correcciones y eliminaciones recientes de la persona, paginadas. Se muestra aunque ya no tenga
 * mediciones vigentes (p. ej. tras eliminarlas todas). `revision` reinicia la lista tras cada cambio.
 */
export function RecentWeightActivity({ userId, revision }: { userId: string; revision: number }) {
  const key = `${userId}:${revision}`;
  const [state, setState] = useState<ActivityState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);

  useEffect(() => {
    let active = true;
    void loadRecentActivity(userId).then((result) => {
      if (!active) return; // respuesta de otra sesión o revisión
      setState(result.status === 'ok' ? { key, status: 'ok', ...result.data } : { key, status: 'error' });
    });
    return () => {
      active = false;
    };
  }, [userId, key]);

  const current = state?.key === key ? state : null;

  async function loadMore() {
    if (current?.status !== 'ok') return;
    const last = current.items[current.items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    setPageError(false);
    const result = await loadRecentActivity(userId, { changedAt: last.changedAt, id: last.id });
    setLoadingMore(false);
    if (result.status === 'error') return setPageError(true);
    // Si mientras tanto cambió la revisión, la página se descarta (otra clave).
    setState((previous) =>
      previous?.key === key && previous.status === 'ok'
        ? { ...previous, items: [...previous.items, ...result.data.items], hasMore: result.data.hasMore }
        : previous,
    );
  }

  return (
    <Card>
      <AppText variant="cardTitle">Actividad reciente</AppText>
      <AppText variant="secondary">Correcciones y eliminaciones de tus mediciones.</AppText>
      {!current && <AppText variant="secondary">Cargando…</AppText>}
      {current?.status === 'error' && (
        <AppText variant="secondary" tone="error">
          No pudimos cargar la actividad reciente.
        </AppText>
      )}
      {current?.status === 'ok' && (
        <View style={styles.list}>
          {current.items.length === 0 ? (
            <AppText variant="secondary">No hay correcciones ni eliminaciones en el historial disponible (últimos 180 días).</AppText>
          ) : (
            current.items.map((item) => (
              <AppText key={item.id} variant="secondary" tabular>
                {describeCorrection(item)}
              </AppText>
            ))
          )}
          {pageError && (
            <AppText variant="secondary" tone="error">
              No pudimos cargar más actividad.
            </AppText>
          )}
          {current.hasMore && (
            <Button title="Ver más actividad" variant="outline" loading={loadingMore} onPress={() => void loadMore()} />
          )}
        </View>
      )}
      <AppText variant="caption">{CORRECTIONS_RETENTION_NOTE}</AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xxs + 2 },
});
