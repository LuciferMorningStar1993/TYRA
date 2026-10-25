import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Save, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { WeightCorrections } from '@/components/weight-corrections';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { space } from '@/design/tokens';
import { parseDateOnly } from '@/lib/profile';
import {
  formatKg,
  formatMeasuredOn,
  MIN_MEASURED_ON,
  validateWeightForm,
  type WeightEntry,
  type WeightFormErrors,
} from '@/lib/weight';
import { loadWeightEntry, weightActionMessage } from '@/lib/weight-api';
import { useSession } from '@/providers/session-provider';
import { useWeight, type WeightActionResult } from '@/providers/weight-provider';

type EntryState =
  | { status: 'new' }
  | { status: 'loading' }
  | { status: 'ready'; entry: WeightEntry }
  | { status: 'missing' }
  | { status: 'error' };

/** Registrar una medición, o corregir/eliminar una existente (?id=). Confirma la fecha del peso heredado. */
export default function RegisterWeightScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session, profile } = useSession();
  const userId = session?.user.id;
  const { current, addEntry, updateEntry, deleteEntry } = useWeight();

  const [entryState, setEntryState] = useState<EntryState>(id ? { status: 'loading' } : { status: 'new' });
  const [reloadKey, setReloadKey] = useState(0);
  const [weight, setWeight] = useState('');
  const [measuredOn, setMeasuredOn] = useState<Date | null>(() => (id ? null : new Date()));
  const [errors, setErrors] = useState<WeightFormErrors>({});
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Edición: se lee la medición (y se vuelve a leer tras un conflicto).
  useEffect(() => {
    if (!id) return;
    let active = true;
    void loadWeightEntry(id).then((result) => {
      if (!active) return;
      if (result.status === 'error') return setEntryState({ status: 'error' });
      if (!result.data) return setEntryState({ status: 'missing' });
      const entry = result.data;
      setEntryState({ status: 'ready', entry });
      setWeight(String(entry.weightKg));
      setMeasuredOn(entry.measuredOn ? parseDateOnly(entry.measuredOn) : null);
    });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  const entry = entryState.status === 'ready' ? entryState.entry : null;
  const confirmingLegacy = entry !== null && entry.measuredOn === null;
  // Peso heredado sin fecha: se sugiere el día del onboarding; solo se guarda si la persona confirma.
  const suggestedDate = confirmingLegacy && profile?.onboarded_at ? new Date(profile.onboarded_at) : null;
  const dateValue = measuredOn ?? suggestedDate;
  const title = !id ? 'Registrar peso' : confirmingLegacy ? 'Confirmar fecha' : 'Editar medición';

  function handleFailure(result: WeightActionResult) {
    setMessage({ tone: 'error', text: weightActionMessage(result) ?? 'No pudimos guardar.' });
    if (result.status === 'conflict') setReloadKey((value) => value + 1);
  }

  async function save() {
    const { errors: nextErrors, value } = validateWeightForm({ weight, measuredOn: dateValue });
    setErrors(nextErrors);
    setMessage(null);
    if (!value) return;
    // Peso vigente ANTES de guardar: registrar un día anterior no lo cambia.
    const latestDate = current?.dateConfirmed ? current.entry.measuredOn : null;
    setSaving(true);
    const result = entry ? await updateEntry(entry, value, userId) : await addEntry(value, userId);
    setSaving(false);
    if (result.status !== 'ok') return handleFailure(result);
    if (!entry && latestDate && value.measuredOn < latestDate && current) {
      setMessage({
        tone: 'success',
        text: `Guardado en tu historial. Tu peso actual sigue siendo ${formatKg(current.entry.weightKg)} (${formatMeasuredOn(latestDate)}).`,
      });
      setWeight('');
      return;
    }
    router.back();
  }

  async function remove() {
    if (!entry) return;
    setSaving(true);
    const result = await deleteEntry(entry, userId);
    setSaving(false);
    setConfirmingDelete(false);
    if (result.status !== 'deleted') return handleFailure(result);
    router.back();
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title }} />
      {entryState.status === 'loading' && <AppText variant="secondary">Cargando…</AppText>}
      {entryState.status === 'missing' && (
        <Card>
          <AppText variant="secondary">Esta medición ya no existe; pudo eliminarse en otro dispositivo.</AppText>
          <Button title="Volver" variant="outline" onPress={() => router.back()} />
        </Card>
      )}
      {entryState.status === 'error' && (
        <Card>
          <AppText variant="secondary" tone="error">
            No pudimos cargar la medición. Revisa tu conexión.
          </AppText>
          <Button title="Reintentar" variant="outline" onPress={() => setReloadKey((value) => value + 1)} />
        </Card>
      )}

      {(entryState.status === 'new' || entry) && (
        <>
          <Card>
            {confirmingLegacy && (
              <AppText variant="secondary">
                Este peso venía de tu perfil y no tiene fecha de medición. Elige el día en que te pesaste; la sugerencia es
                el día en que creaste tu perfil. Al confirmarla, se incluirá en tu evolución.
              </AppText>
            )}
            <TextField
              label="Peso (kg)"
              value={weight}
              onChangeText={setWeight}
              error={errors.weight}
              placeholder="70.5"
              keyboardType="decimal-pad"
            />
            <DateField
              key={`${entry?.id ?? 'nuevo'}:${entry?.version ?? 0}:${dateValue ? 'con-fecha' : 'sin-fecha'}`}
              label="Fecha de la medición"
              value={dateValue}
              onChange={setMeasuredOn}
              minimumDate={MIN_MEASURED_ON}
              maximumDate={new Date()}
              error={errors.measuredOn}
            />
            {message && (
              <AppText
                variant="secondary"
                tone={message.tone}
                accessibilityLiveRegion={message.tone === 'error' ? 'assertive' : 'polite'}>
                {message.text}
              </AppText>
            )}
            <Button
              title={confirmingLegacy ? 'Confirmar fecha' : entry ? 'Guardar corrección' : 'Guardar'}
              icon={Save}
              loading={saving}
              onPress={() => void save()}
            />
          </Card>

          {entry && (
            <Card>
              <WeightCorrections entryId={entry.id} version={entry.version} />
            </Card>
          )}

          {entry && (
            <Card>
              {confirmingDelete ? (
                <View style={styles.confirm}>
                  <AppText variant="secondary">
                    ¿Eliminar la medición de {formatKg(entry.weightKg)}
                    {entry.measuredOn ? ` del ${formatMeasuredOn(entry.measuredOn)}` : ''}? Dejará de contar en tu peso y
                    evolución.
                  </AppText>
                  <Button title="Sí, eliminar" icon={Trash2} variant="destructive" loading={saving} onPress={() => void remove()} />
                  <Button title="Cancelar" variant="ghost" onPress={() => setConfirmingDelete(false)} />
                </View>
              ) : (
                <Button title="Eliminar medición" icon={Trash2} variant="ghost" onPress={() => setConfirmingDelete(true)} />
              )}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  confirm: { gap: space.xs },
});
