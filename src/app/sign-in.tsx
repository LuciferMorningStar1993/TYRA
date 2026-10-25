import { router } from 'expo-router';
import { LogIn } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthHeader, OrDivider } from '@/components/auth-header';
import { GoogleLogo } from '@/components/google-logo';
import { AppText, Button, Screen, TextField } from '@/components/ui';
import { space } from '@/design/tokens';
import { signInWithGoogle, signInWithPassword } from '@/lib/auth';
import { parseIdentifier } from '@/lib/identifier';

export default function SignInScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Correo pendiente de confirmar (solo si se inició con correo). */
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState<'password' | 'google' | null>(null);

  async function handleSignIn() {
    const parsed = parseIdentifier(identifier);
    if (!parsed) {
      setIdentifierError('Escribe un correo válido o un teléfono de 10 dígitos.');
      return;
    }
    setIdentifierError(null);
    setError(null);
    setUnconfirmedEmail(null);
    setLoading('password');
    const result = await signInWithPassword(parsed, password);
    setLoading(null);
    setError(result.error);
    if (result.needsEmailConfirmation && parsed.kind === 'email') setUnconfirmedEmail(parsed.email);
    // Si fue exitoso, el layout raíz redirige según la sesión.
  }

  async function handleGoogle() {
    setError(null);
    setLoading('google');
    const result = await signInWithGoogle();
    setLoading(null);
    setError(result.error);
  }

  return (
    <Screen centered>
      <AuthHeader title="Bienvenido a TYRA" subtitle="Tu salud y tus finanzas en un solo lugar." />

      <TextField
        label="Correo o teléfono"
        hint="Tu teléfono a 10 dígitos o tu correo."
        value={identifier}
        onChangeText={setIdentifier}
        error={identifierError}
        autoCapitalize="none"
        autoComplete="username"
        textContentType="username"
        keyboardType="email-address"
        returnKeyType="next"
      />
      <TextField
        label="Contraseña"
        password
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={handleSignIn}
      />

      {error && (
        <AppText variant="secondary" tone="error" accessibilityLiveRegion="assertive">
          {error}
        </AppText>
      )}
      {unconfirmedEmail && (
        <Button
          title="Reenviar enlace de confirmación"
          variant="outline"
          onPress={() => router.push({ pathname: '/check-email', params: { email: unconfirmedEmail } })}
        />
      )}

      <Button
        title="¿Olvidaste tu contraseña?"
        variant="ghost"
        onPress={() => {
          const parsed = parseIdentifier(identifier);
          router.push({
            pathname: '/forgot-password',
            params: parsed?.kind === 'email' ? { email: parsed.email } : {},
          });
        }}
      />

      <Button
        title="Iniciar sesión"
        icon={LogIn}
        onPress={handleSignIn}
        loading={loading === 'password'}
        disabled={!identifier.trim() || !password || loading !== null}
      />

      <OrDivider />

      <Button
        title="Continuar con Google"
        variant="outline"
        leading={<GoogleLogo />}
        onPress={handleGoogle}
        loading={loading === 'google'}
        disabled={loading !== null}
      />

      <View style={styles.footer}>
        <AppText variant="body" tone="secondary">
          ¿Te invitaron a TYRA?
        </AppText>
        <Button title="Tengo un código de invitación" variant="ghost" onPress={() => router.push('/accept-invite')} />
        <Button title="¿Cómo obtengo una cuenta?" variant="ghost" onPress={() => router.push('/sign-up')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: 'center', gap: space.xxs, marginTop: space.xs },
});
