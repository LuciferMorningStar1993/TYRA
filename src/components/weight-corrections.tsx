import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { space } from '@/design/tokens';
import { formatKg, formatMeasuredOn } from '@/lib/weight';
import { loadCorrections, type WeightCorrection } from '@/lib/weight-api';

/** Lo que no aparece puede haber vencido: nunca se afirma que algo «no se corrigió». */
export const NO_CORRECTIONS_IN_HISTORY =
  'No hay correcciones de esta medición en el historial disponible (últimos 180 días).';

export const CORRECTIONS_RETENTION_NOTE =
  'El historial de correcciones se borra automáticamente a los 180 días. Tus mediciones se conservan mientras no las elimines o elimines tu cuenta.';

const formatDate = (value: string | null) => (value ? formatMeasuredOn(value) : 'sin fecha');

export function describeCorrection(correction: WeightCorrection): string {
  const when = new Date(correction.changedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const before = `${formatKg(correction.oldWeightKg)}, ${formatDate(correction.oldMeasuredOn)}`;
  if (correction.action === 'deletion') return `${when}: se eliminó (${before}).`;
  const after = `${formatKg(correction.newWeightKg ?? correction.oldWeightKg)}, ${formatDate(correction.newMeasuredOn)}`;
  return `${when}: antes ${before}; después ${after}.`;
}

/** Correcciones de una medición (valores anteriores), con el aviso de retención. */
export function WeightCorrections({ entryId, version }: { entryId: string; version: number }) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; corrections: WeightCorrection[] } | { status: 'error' }
  >({ status: 'loading' });

  // `version` cambia con cada corrección: se vuelve a leer. La respuesta de una lectura anterior se descarta.
  useEffect(() => {
    let active = true;
    void loadCorrections(entryId).then((result) => {
      if (!active) return;
      setState(result.status === 'ok' ? { status: 'ready', corrections: result.data } : { status: 'error' });
    });
    return () => {
      active = false;
    };
  }, [entryId, version]);

  return (
    <View style={styles.block}>
      <AppText variant="cardTitle">Historial de correcciones</AppText>
      {state.status === 'loading' && <AppText variant="secondary">Cargando…</AppText>}
      {state.status === 'error' && (
        <AppText variant="secondary" tone="error">
          No pudimos cargar las correcciones.
        </AppText>
      )}
      {state.status === 'ready' &&
        (state.corrections.length === 0 ? (
          <AppText variant="secondary">{NO_CORRECTIONS_IN_HISTORY}</AppText>
        ) : (
          state.corrections.map((correction) => (
            <AppText key={correction.id} variant="secondary" tabular>
              {describeCorrection(correction)}
            </AppText>
          ))
        ))}
      <AppText variant="caption">{CORRECTIONS_RETENTION_NOTE}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.xxs + 2 },
});
