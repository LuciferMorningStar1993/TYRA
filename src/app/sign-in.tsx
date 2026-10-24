import { useState } from 'react';

import { AppText, Button, Field, Input, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const OTP_LENGTH = 6;

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();

  async function sendCode() {
    setLoading(true);
    setError(null);
    // shouldCreateUser: false → solo entran los usuarios dados de alta en Supabase (la familia).
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (otpError) {
      setError(
        otpError.status === 422 || otpError.code === 'otp_disabled'
          ? 'Este correo no tiene acceso a TYRA.'
          : otpError.message,
      );
      return;
    }
    setStep('code');
  }

  async function verifyCode() {
    setLoading(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: code.trim(),
      type: 'email',
    });
    setLoading(false);
    if (verifyError) {
      setError('Código inválido o expirado.');
    }
    // Si fue exitoso, onAuthStateChange actualiza la sesión y el layout redirige.
  }

  return (
    <Screen>
      <AppText variant="title">TYRA</AppText>
      <AppText variant="muted">Salud y finanzas en un solo lugar.</AppText>

      {step === 'email' ? (
        <>
          <Field label="Correo">
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          </Field>
          <Button
            title="Enviar código"
            onPress={sendCode}
            loading={loading}
            disabled={!normalizedEmail.includes('@')}
          />
        </>
      ) : (
        <>
          <AppText>Te enviamos un código a {normalizedEmail}.</AppText>
          <Field label="Código">
            <Input
              value={code}
              onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={OTP_LENGTH}
            />
          </Field>
          <Button
            title="Entrar"
            onPress={verifyCode}
            loading={loading}
            disabled={code.length !== OTP_LENGTH}
          />
          <Button
            title="Usar otro correo"
            variant="secondary"
            onPress={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
          />
        </>
      )}

      {error && <AppText variant="error">{error}</AppText>}
    </Screen>
  );
}
