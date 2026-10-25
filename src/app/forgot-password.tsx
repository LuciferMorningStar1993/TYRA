import { router, useLocalSearchParams } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { AuthHeader } from '@/components/auth-header';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { AUTH_EMAIL_COOLDOWN_SECONDS, requestPasswordReset } from '@/lib/auth';
import { isEmail } from '@/lib/identifier';

/** Mismo texto exista o no la cuenta: no revela qué correos están registrados. */
export const RESET_SENT_MESSAGE =
  'Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva. Ábrelo en este mismo dispositivo y navegador. Revisa también la carpeta de spam.';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit() {
    if (!isEmail(email)) {
      setEmailError('Escribe un correo válido.');
      return;
    }
    setEmailError(null);
    setMessage(null);
    setSending(true);
    const result = await requestPasswordReset(email.trim().toLowerCase());
    setSending(false);
    if (result.status === 'network_error') {
      setMessage({ tone: 'error', text: result.message });
      return;
    }
    setCooldown(AUTH_EMAIL_COOLDOWN_SECONDS);
    setMessage({ tone: 'success', text: RESET_SENT_MESSAGE });
  }

  return (
    <Screen centered>
      <AuthHeader title="Recupera tu contraseña" subtitle="Te enviaremos un enlace para crear una nueva." />
      <TextField
        label="Correo"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={handleSubmit}
      />

      {message && (
        <Card tone="muted">
          <AppText
            variant="secondary"
            tone={message.tone === 'error' ? 'error' : 'success'}
            accessibilityLiveRegion="polite">
            {message.text}
          </AppText>
        </Card>
      )}

      <Button
        title={cooldown > 0 ? `Enviar de nuevo en ${cooldown} s` : 'Enviar enlace'}
        icon={KeyRound}
        onPress={handleSubmit}
        loading={sending}
        disabled={cooldown > 0}
      />
      <Button title="Volver a iniciar sesión" variant="ghost" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
