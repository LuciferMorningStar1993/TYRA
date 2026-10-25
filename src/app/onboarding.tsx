import { LogOut } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { BirthDateField } from '@/components/birth-date-field';
import { PalettePicker } from '@/components/palette-picker';
import { AppText, Button, Card, OptionGroup, Screen, TextField } from '@/components/ui';
import { ACTIVITY_OPTIONS, GENDER_OPTIONS, GOAL_OPTIONS, SEX_OPTIONS } from '@/constants/options';
import { draftPalette, suggestedPalette, type Gender, type PaletteId } from '@/design/palettes';
import { useTheme } from '@/design/theme-provider';
import type { ActivityLevel, Goal, Sex } from '@/lib/health';
import { submitOnboarding, type OnboardingErrors } from '@/lib/onboarding';
import { formatDateOnly } from '@/lib/profile';
import { completeOnboarding } from '@/lib/weight-api';
import { useSession } from '@/providers/session-provider';

export default function OnboardingScreen() {
  const { profile, refreshProfile, signOut } = useSession();
  const { previewPalette } = useTheme();

  // Se decide una sola vez: elegir una paleta (borrador) nunca debe ocultar campos.
  // Quien se registró con Google aún no tiene género ni paleta.
  const [showAppearance] = useState(() => !profile?.theme_palette);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [gender, setGender] = useState<Gender | null>((profile?.gender as Gender | null) ?? null);
  const [explicitPalette, setExplicitPalette] = useState<PaletteId | null>(null);
  const [sex, setSex] = useState<Sex | null>(
    profile?.gender === 'female' || profile?.gender === 'male' ? profile.gender : null,
  );
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  // Día de la primera medición: se fija al abrir el formulario y se reutiliza en cada reintento,
  // aunque ya sea otro día (un reintento después de medianoche no crea un segundo día).
  const [measuredOn, setMeasuredOn] = useState(() => formatDateOnly(new Date()));

  const palette = showAppearance ? draftPalette(explicitPalette, gender) : null;

  // Vista previa del borrador: se ve en toda la app pero solo se guarda al confirmar.
  useEffect(() => {
    previewPalette(palette);
  }, [palette, previewPalette]);
  useEffect(() => () => previewPalette(null), [previewPalette]);

  function handleGender(next: Gender) {
    setGender(next);
    if (!sex && (next === 'female' || next === 'male')) setSex(next);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await submitOnboarding(
      { displayName, gender, sex, birthDate, height, weight, activity, goal, palette },
      completeOnboarding,
      measuredOn,
    );
    if (result.status === 'saved') {
      // Completo (o ya lo estaba): al recargar el perfil confirmado, el layout raíz lleva al inicio.
      await refreshProfile();
      setSaving(false);
      return;
    }
    setSaving(false);
    setSaveFailed(result.status === 'failed');
    if (result.status === 'invalid') {
      setErrors(result.errors);
      setError('Revisa los campos marcados.');
      return;
    }
    setErrors({});
    setError(result.message);
    // Pasaron más de 2 días: el siguiente intento registra el peso de hoy, tras confirmarlo.
    if (result.reason === 'invalid_measured_on') setMeasuredOn(formatDateOnly(new Date()));
  }

  return (
    <Screen>
      <AppText variant="title">Cuéntanos de ti</AppText>
      <AppText tone="secondary">
        Con estos datos calculamos tu IMC y una estimación de las calorías que necesitas al día.
      </AppText>

      <Card>
        <TextField
          label="¿Cómo te llamamos?"
          value={displayName}
          onChangeText={setDisplayName}
          error={errors.displayName}
          autoComplete="name"
        />

        {showAppearance && (
          <OptionGroup label="Género (opcional)" options={GENDER_OPTIONS} value={gender} onChange={handleGender} />
        )}

        <OptionGroup
          label="Sexo biológico (para el cálculo metabólico)"
          options={SEX_OPTIONS}
          value={sex}
          onChange={setSex}
          error={errors.sex}
        />

        <BirthDateField value={birthDate} onChange={setBirthDate} error={errors.birthDate} />

        <TextField
          label="Estatura (cm)"
          value={height}
          onChangeText={setHeight}
          error={errors.height}
          placeholder="170"
          keyboardType="decimal-pad"
        />
        <TextField
          label="Peso (kg)"
          value={weight}
          onChangeText={setWeight}
          error={errors.weight}
          placeholder="70.5"
          keyboardType="decimal-pad"
        />
      </Card>

      <Card>
        <OptionGroup
          label="Nivel de actividad"
          options={ACTIVITY_OPTIONS}
          value={activity}
          onChange={setActivity}
          error={errors.activity}
        />
        <OptionGroup label="Meta" options={GOAL_OPTIONS} value={goal} onChange={setGoal} error={errors.goal} />
      </Card>

      {showAppearance && palette && (
        <Card>
          <AppText variant="cardTitle">Elige tus colores</AppText>
          <AppText variant="secondary">Puedes elegir cualquier paleta y cambiarla después en Perfil.</AppText>
          <PalettePicker value={palette} suggested={suggestedPalette(gender)} onChange={setExplicitPalette} />
        </Card>
      )}

      {error && (
        <AppText variant="secondary" tone="error" accessibilityLiveRegion="assertive">
          {error}
        </AppText>
      )}

      <Button title={saveFailed ? 'Reintentar' : 'Guardar y continuar'} onPress={save} loading={saving} />
      <Button title="Cerrar sesión" icon={LogOut} variant="ghost" onPress={signOut} />
    </Screen>
  );
}
