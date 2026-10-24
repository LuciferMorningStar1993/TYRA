import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform } from 'react-native';

import { AppText, Button, Card, Field, Input, OptionGroup, Screen } from '@/components/ui';
import type { ActivityLevel, Goal, Sex } from '@/lib/health';
import { formatDateOnly } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

const SEX_OPTIONS = [
  { value: 'female', label: 'Mujer' },
  { value: 'male', label: 'Hombre' },
] as const satisfies readonly { value: Sex; label: string }[];

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentario' },
  { value: 'light', label: 'Ligero (1-3 días)' },
  { value: 'moderate', label: 'Moderado (3-5 días)' },
  { value: 'active', label: 'Activo (6-7 días)' },
  { value: 'very_active', label: 'Muy activo' },
] as const satisfies readonly { value: ActivityLevel; label: string }[];

const GOAL_OPTIONS = [
  { value: 'lose', label: 'Bajar de peso' },
  { value: 'maintain', label: 'Mantener' },
  { value: 'gain', label: 'Subir / ganar músculo' },
] as const satisfies readonly { value: Goal; label: string }[];

const DEFAULT_BIRTH_DATE = new Date(1990, 0, 1);

function parseDecimal(text: string): number | null {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default function OnboardingScreen() {
  const { session, refreshProfile, signOut } = useSession();

  const [displayName, setDisplayName] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heightCm = parseDecimal(height);
  const weightKg = parseDecimal(weight);
  const isComplete =
    !!displayName.trim() && !!sex && !!birthDate && !!heightCm && !!weightKg && !!activity && !!goal;

  async function save() {
    if (!session || !isComplete) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        sex,
        birth_date: formatDateOnly(birthDate),
        height_cm: heightCm,
        weight_kg: weightKg,
        activity_level: activity,
        goal,
        onboarded_at: new Date().toISOString(),
      })
      .eq('id', session.user.id);
    if (updateError) {
      setSaving(false);
      setError(
        updateError.code === '23514'
          ? 'Revisa estatura (50-260 cm) y peso (20-400 kg).'
          : updateError.message,
      );
      return;
    }
    // Al recargar el perfil, onboarded_at ya existe y el layout lleva al inicio.
    await refreshProfile();
  }

  return (
    <Screen>
      <AppText variant="title">Cuéntanos de ti</AppText>
      <AppText variant="muted">
        Con estos datos calculamos tu IMC y las calorías que necesitas al día.
      </AppText>

      <Card>
        <Field label="¿Cómo te llamamos?">
          <Input value={displayName} onChangeText={setDisplayName} placeholder="Nombre" />
        </Field>

        <Field label="Sexo biológico (para el cálculo metabólico)">
          <OptionGroup options={SEX_OPTIONS} value={sex} onChange={setSex} />
        </Field>

        <Field label="Fecha de nacimiento">
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={birthDate ?? DEFAULT_BIRTH_DATE}
              mode="date"
              display="compact"
              maximumDate={new Date()}
              onValueChange={(_event, date) => setBirthDate(date)}
              style={{ alignSelf: 'flex-start' }}
            />
          ) : (
            <>
              <Button
                title={birthDate ? birthDate.toLocaleDateString('es-MX') : 'Elegir fecha'}
                variant="secondary"
                onPress={() => setShowAndroidPicker(true)}
              />
              {showAndroidPicker && (
                <DateTimePicker
                  value={birthDate ?? DEFAULT_BIRTH_DATE}
                  mode="date"
                  maximumDate={new Date()}
                  onValueChange={(_event, date) => {
                    setShowAndroidPicker(false);
                    setBirthDate(date);
                  }}
                  onDismiss={() => setShowAndroidPicker(false)}
                />
              )}
            </>
          )}
        </Field>

        <Field label="Estatura (cm)">
          <Input value={height} onChangeText={setHeight} placeholder="170" keyboardType="decimal-pad" />
        </Field>

        <Field label="Peso (kg)">
          <Input value={weight} onChangeText={setWeight} placeholder="70.5" keyboardType="decimal-pad" />
        </Field>
      </Card>

      <Card>
        <Field label="Nivel de actividad">
          <OptionGroup options={ACTIVITY_OPTIONS} value={activity} onChange={setActivity} />
        </Field>
        <Field label="Meta">
          <OptionGroup options={GOAL_OPTIONS} value={goal} onChange={setGoal} />
        </Field>
      </Card>

      {error && <AppText variant="error">{error}</AppText>}

      <Button title="Guardar y continuar" onPress={save} loading={saving} disabled={!isComplete} />
      <Button title="Cerrar sesión" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
