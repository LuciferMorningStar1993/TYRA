import { router } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useState } from 'react';

import { AuthHeader } from '@/components/auth-header';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { isEmail } from '@/lib/identifier';
import { useSession } from '@/providers/session-provider';

/**
 * Aceptar una invitación. Con `tokenHash` (vino del enlace del correo) solo muestra el botón: abrir
 * el enlace NO consume la invitación (un escáner de correo que pre-abre enlaces no la gasta). Sin
 * `tokenHash`, pide correo y código (para cuando el enlace `tyra://` no abre la app).
 * El token nunca se registra en logs.
 */
export function AcceptInviteForm({ tokenHash }: { tokenHash?: string }) {
  const { acceptInvite } = useSession();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<{ email?: string; code?: string }>({});
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const [accepting, setAccepting] = useState(false);

  async function handleAccept() {
    let input: { tokenHash: string } | { email: string; code: string };
    if (tokenHash) {
      input = { tokenHash };
    } else {
      const next: typeof errors = {};
      if (!isEmail(email)) next.email = 'Escribe el correo al que llegó la invitación.';
      if (!/^\d{6,10}$/.test(code.trim())) next.code = 'Escribe el código numérico del correo.';
      setErrors(next);
      if (Object.keys(next).length > 0) return;
      input = { email: email.trim().toLowerCase(), code: code.trim() };
    }
    setError(null);
    setAccepting(true);
    const result = await acceptInvite(input);
    setAccepting(false);
    if (result.status === 'error') setError({ message: result.message, expired: result.reason === 'expired' });
    // Aceptada: el layout raíz lleva a «Crea tu contraseña».
  }

  return (
    <Screen centered>
      <AuthHeader
        title="Aceptar invitación"
        subtitle={
          tokenHash
            ? 'Confirma que quieres activar tu cuenta de TYRA. Después crearás tu contraseña.'
            : 'Escribe tu correo y el código de la invitación. Después crearás tu contraseña.'
        }
      />
      {!tokenHash && (
        <>
          <TextField
            label="Correo"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label="Código de invitación"
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
            error={errors.code}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={10}
          />
        </>
      )}
      {error && (
        <Card tone="muted">
          <AppText variant="secondary" tone="error" accessibilityLiveRegion="assertive">
            {error.message}
          </AppText>
        </Card>
      )}
      <Button title="Aceptar invitación" icon={MailCheck} onPress={handleAccept} loading={accepting} />
      {error?.expired && (
        <Button title="Ir a iniciar sesión" variant="outline" onPress={() => router.replace('/sign-in')} />
      )}
      <Button title="Volver" variant="ghost" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
