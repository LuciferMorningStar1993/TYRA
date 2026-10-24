import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays, LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { Platform } from 'react-native';

import { PalettePicker } from '@/components/palette-picker';
import { AppText, Button, Card, OptionGroup, Screen, TextField } from '@/components/ui';
import { ACTIVITY_OPTIONS, GENDER_OPTIONS, GOAL_OPTIONS, SEX_OPTIONS } from '@/constants/options';
import { suggestedPalette, type Gender } from '@/design/palettes';
import { useTheme } from '@/design/theme-provider';
import type { ActivityLevel, Goal, Sex } from '@/lib/health';
import { formatDateOnly } from '@/lib/profile';
import { useSession } from '@/providers/session-provider';

const DEFAULT_BIRTH_DATE = new Date(1990, 0, 1);

function parseDecimal(text: string): number | null {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default function OnboardingScreen() {
  const { profile, updateProfile, signOut } = useSession();
  const { palette, setPalette } = useTheme();

  // Quien se registró con Google aún no eligió género ni paleta.
  const needsAppearance = !profile?.theme_palette;

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [gender, setGender] = useState<Gender | null>((profile?.gender as Gender | null) ?? null);
  const [paletteTouched, setPaletteTouched] = useState(false);
  const [sex, setSex] = useState<Sex | null>(
    profile?.gender === 'female' || profile?.gender === 'male' ? profile.gender : null,
  );
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

  function handleGender(next: Gender) {
    setGender(next);
    if (!sex && (next === 'female' || next === 'male')) setSex(next);
    if (!paletteTouched) setPalette(suggestedPalette(next));
  }

  async function save() {
    if (!isComplete || !birthDate) return;
    setSaving(true);
    setError(null);
    const result = await updateProfile({
      display_name: displayName.trim(),
      gender,
      sex,
      birth_date: formatDateOnly(birthDate),
      height_cm: heightCm,
      weight_kg: weightKg,
      activity_level: activity,
      goal,
      theme_palette: palette,
      onboarded_at: new Date().toISOString(),
    });
    setSaving(false);
    if (result.error) {
      setError(
        /check constraint/i.test(result.error)
          ? 'Revisa estatura (50-260 cm) y peso (20-400 kg).'
          : 'No pudimos guardar tus datos. Inténtalo de nuevo.',
      );
    }
    // Con onboarded_at guardado, el layout raíz lleva al inicio.
  }

  return (
    <Screen>
      <AppText variant="title">Cuéntanos de ti</AppText>
      <AppText tone="secondary">
        Con estos datos calculamos tu IMC y las calorías que necesitas al día.
      </AppText>

      <Card>
        <TextField label="¿Cómo te llamamos?" value={displayName} onChangeText={setDisplayName} />

        {needsAppearance && (
          <OptionGroup label="Género (opcional)" options={GENDER_OPTIONS} value={gender} onChange={handleGender} />
        )}

        <OptionGroup label="Sexo biológico (para el cálculo metabólico)" options={SEX_OPTIONS} value={sex} onChange={setSex} />

        <AppText variant="label">Fecha de nacimiento</AppText>
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            value={birthDate ?? DEFAULT_BIRTH_DATE}
            mode="date"
            display="compact"
            maximumDate={new Date()}
            onValueChange={(_event, date) => setBirthDate(date)}
            accessibilityLabel="Fecha de nacimiento"
            style={{ alignSelf: 'flex-start' }}
          />
        ) : (
          <>
            <Button
              title={birthDate ? birthDate.toLocaleDateString() : 'Elegir fecha'}
              icon={CalendarDays}
              variant="outline"
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

        <TextField label="Estatura (cm)" value={height} onChangeText={setHeight} placeholder="170" keyboardType="decimal-pad" />
        <TextField label="Peso (kg)" value={weight} onChangeText={setWeight} placeholder="70.5" keyboardType="decimal-pad" />
      </Card>

      <Card>
        <OptionGroup label="Nivel de actividad" options={ACTIVITY_OPTIONS} value={activity} onChange={setActivity} />
        <OptionGroup label="Meta" options={GOAL_OPTIONS} value={goal} onChange={setGoal} />
      </Card>

      {needsAppearance && (
        <Card>
          <AppText variant="cardTitle">Elige tus colores</AppText>
          <PalettePicker
            value={palette}
            suggested={suggestedPalette(gender)}
            onChange={(next) => {
              setPaletteTouched(true);
              setPalette(next);
            }}
          />
        </Card>
      )}

      {error && (
        <AppText variant="secondary" tone="error" accessibilityLiveRegion="assertive">
          {error}
        </AppText>
      )}

      <Button title="Guardar y continuar" onPress={save} loading={saving} disabled={!isComplete} />
      <Button title="Cerrar sesión" icon={LogOut} variant="ghost" onPress={signOut} />
    </Screen>
  );
}
