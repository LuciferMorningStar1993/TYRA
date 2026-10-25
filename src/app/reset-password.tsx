import { LockKeyhole, LogOut } from 'lucide-react-native';
import { useState } from 'react';

import { AuthHeader } from '@/components/auth-header';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { updatePassword } from '@/lib/auth';
import { passwordProblem } from '@/lib/identifier';
import { useSession } from '@/providers/session-provider';

/**
 * Contraseña nueva o primera contraseña. Solo se monta con una sesión de recuperación o con una
 * invitación recién aceptada (ruta 'reset-password', ver resolveRoute), nunca con una sesión normal.
 */
export default function ResetPasswordScreen() {
  const { completeRecovery, signOut, passwordSetupMode } = useSession();
  const isInvite = passwordSetupMode === 'invite';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ otherSessionsRevoked: boolean } | null>(null);

  async function handleSave() {
    const next: typeof errors = {};
    const problem = passwordProblem(password);
    if (problem) next.password = problem;
    if (confirm !== password) next.confirm = 'Las contraseñas no coinciden.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setError(null);
    setSaving(true);
    const result = await updatePassword(password);
    setSaving(false);
    if (result.status === 'error') {
      setError(result.error);
      return;
    }
    setDone({ otherSessionsRevoked: result.otherSessionsRevoked });
  }

  if (done) {
    return (
      <Screen centered>
        <AuthHeader
          title={isInvite ? 'Cuenta activada' : 'Contraseña actualizada'}
          subtitle={isInvite ? 'Ya puedes entrar con tu correo y tu contraseña.' : 'Ya puedes usar tu contraseña nueva.'}
        />
        <Card tone="muted">
          <AppText variant="secondary" accessibilityLiveRegion="polite">
            {isInvite
              ? 'Tu cuenta quedó lista. Desde Perfil puedes agregar un alias de teléfono para entrar con tu número.'
              : done.otherSessionsRevoked
              ? 'Cerramos tu sesión en los demás dispositivos; puede tardar hasta una hora en dejar de funcionar del todo. Este dispositivo sigue conectado.'
              : 'Tu contraseña sí cambió, pero no pudimos confirmar que se cerró tu sesión en los demás dispositivos. Si crees que alguien más tiene acceso, vuelve a cambiar tu contraseña más tarde.'}
          </AppText>
        </Card>
        <Button title="Continuar" onPress={completeRecovery} />
      </Screen>
    );
  }

  return (
    <Screen centered>
      <AuthHeader
        title={isInvite ? 'Crea tu contraseña' : 'Crea una contraseña nueva'}
        subtitle={
          isInvite
            ? 'Tu correo ya está verificado. Usa al menos 8 caracteres, con letras y números.'
            : 'Usa al menos 8 caracteres, con letras y números.'
        }
      />
      <TextField
        label="Contraseña nueva"
        password
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <TextField
        label="Confirmar contraseña nueva"
        password
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />
      {error && (
        <AppText variant="secondary" tone="error" accessibilityLiveRegion="assertive">
          {error}
        </AppText>
      )}
      <Button title="Guardar contraseña" icon={LockKeyhole} onPress={handleSave} loading={saving} />
      <Button title="Cancelar y cerrar sesión" icon={LogOut} variant="ghost" onPress={signOut} />
    </Screen>
  );
}
