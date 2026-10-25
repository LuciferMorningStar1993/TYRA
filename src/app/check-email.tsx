import { router, useLocalSearchParams } from 'expo-router';
import { MailCheck, RefreshCw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { decorative } from '@/design/a11y';
import { useTheme } from '@/design/theme-provider';
import { AUTH_EMAIL_COOLDOWN_SECONDS, resendConfirmation } from '@/lib/auth';
import { isEmail } from '@/lib/identifier';

/** Supabase limita los reenvíos (max_frequency = 1 min en config.toml). */
export const RESEND_COOLDOWN_SECONDS = AUTH_EMAIL_COOLDOWN_SECONDS;

/**
 * Después de registrarse no hay sesión: hay que abrir el enlace del correo. Esta pantalla
 * lo explica y permite reenviarlo. Sin `email` en la ruta (p. ej. desde un enlace expirado),
 * pide el correo.
 */
export default function CheckEmailScreen() {
  const { colors } = useTheme();
  // `sent=1`: acabamos de enviar el correo (registro), así que arranca la espera para reenviar.
  const params = useLocalSearchParams<{ email?: string; sent?: string }>();
  const justSent = params.sent === '1';
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [cooldown, setCooldown] = useState(justSent ? RESEND_COOLDOWN_SECONDS : 0);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const emailValid = isEmail(email);

  async function handleResend() {
    if (!emailValid) {
      setMessage({ tone: 'error', text: 'Escribe un correo válido.' });
      return;
    }
    setSending(true);
    setMessage(null);
    const result = await resendConfirmation(email.trim().toLowerCase());
    setSending(false);
    if (result.error) {
      setMessage({ tone: 'error', text: result.error });
      return;
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setMessage({ tone: 'success', text: 'Listo. Si el correo tiene una cuenta pendiente, te llegará un enlace nuevo.' });
  }

  return (
    <Screen centered>
      <View {...decorative}>
        <MailCheck size={40} color={colors.primary} />
      </View>
      <AppText variant="title">Revisa tu correo</AppText>
      <AppText tone="secondary">
        {justSent
          ? `Si ${params.email} no tenía cuenta, te enviamos un enlace para confirmarlo. Ábrelo en este dispositivo para entrar directo.`
          : 'Te enviamos un enlace nuevo para confirmar tu correo. Ábrelo en este dispositivo para entrar directo.'}
      </AppText>
      <AppText variant="secondary">
        Si ya tenías cuenta con ese correo, inicia sesión. Revisa también la carpeta de spam.
      </AppText>

      {!params.email && (
        <TextField
          label="Correo"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
      )}

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
        title={cooldown > 0 ? `Reenviar enlace en ${cooldown} s` : 'Reenviar enlace'}
        icon={RefreshCw}
        variant="outline"
        onPress={handleResend}
        loading={sending}
        disabled={cooldown > 0}
      />
      <Button title="Ir a iniciar sesión" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
