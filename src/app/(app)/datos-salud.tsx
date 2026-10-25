import { router } from 'expo-router';
import { Save } from 'lucide-react-native';
import { useState } from 'react';

import { AppText, Button, Card, OptionGroup, Screen, TextField } from '@/components/ui';
import { ACTIVITY_OPTIONS, GOAL_OPTIONS } from '@/constants/options';
import type { ActivityLevel, Goal } from '@/lib/health';
import { validateHealthData } from '@/lib/onboarding';
import { useSession } from '@/providers/session-provider';

/** Estatura, actividad y objetivo. El peso se registra aparte (historial de mediciones). */
export default function HealthDataScreen() {
  const { session, profile, saveProfile } = useSession();
  const [height, setHeight] = useState(profile?.height_cm ? String(profile.height_cm) : '');
  const [activity, setActivity] = useState<ActivityLevel | null>((profile?.activity_level as ActivityLevel | null) ?? null);
  const [goal, setGoal] = useState<Goal | null>((profile?.goal as Goal | null) ?? null);
  const [errors, setErrors] = useState<{ height?: string; activity?: string; goal?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const { errors: nextErrors, patch } = validateHealthData({ height, activity, goal });
    setErrors(nextErrors);
    setError(null);
    if (!patch) return;
    setSaving(true);
    const result = await saveProfile(patch, session?.user.id);
    setSaving(false);
    if (!result.ok) {
      setError(
        /check constraint/i.test(result.error)
          ? 'Algún dato está fuera de rango.'
          : result.error === 'no_session' || result.error === 'stale_session'
            ? 'Tu sesión cambió. Vuelve a iniciar sesión.'
            : 'No pudimos guardar. Revisa tu conexión e inténtalo de nuevo.',
      );
      return;
    }
    // El perfil confirmado ya está en la sesión: Inicio y Salud recalculan el resumen.
    router.back();
  }

  return (
    <Screen edges={['bottom']}>
      <Card>
        <TextField
          label="Estatura (cm)"
          value={height}
          onChangeText={setHeight}
          error={errors.height}
          placeholder="170"
          keyboardType="decimal-pad"
        />
        <OptionGroup label="Nivel de actividad" options={ACTIVITY_OPTIONS} value={activity} onChange={setActivity} error={errors.activity} />
        <OptionGroup label="Meta" options={GOAL_OPTIONS} value={goal} onChange={setGoal} error={errors.goal} />
        {error && (
          <AppText variant="secondary" tone="error" accessibilityLiveRegion="assertive">
            {error}
          </AppText>
        )}
        <Button title="Guardar" icon={Save} loading={saving} onPress={() => void save()} />
      </Card>
      <AppText variant="caption">Tu peso se registra desde Salud → Peso, con su fecha de medición.</AppText>
    </Screen>
  );
}
