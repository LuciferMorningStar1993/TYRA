import { router } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { AuthHeader, OrDivider } from '@/components/auth-header';
import { GoogleLogo } from '@/components/google-logo';
import { PalettePicker } from '@/components/palette-picker';
import { AppText, Button, Card, OptionGroup, Screen, TextField } from '@/components/ui';
import { GENDER_OPTIONS } from '@/constants/options';
import { draftPalette, suggestedPalette, type Gender, type PaletteId } from '@/design/palettes';
import { useTheme } from '@/design/theme-provider';
import { signInWithGoogle, signUp } from '@/lib/auth';
import { isEmail, normalizePhone, passwordProblem } from '@/lib/identifier';

type FieldErrors = Partial<Record<'displayName' | 'email' | 'phone' | 'password' | 'confirm', string>>;

export default function SignUpScreen() {
  const { previewPalette } = useTheme();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [explicitPalette, setExplicitPalette] = useState<PaletteId | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<'form' | 'google' | null>(null);

  // El género solo sugiere; si la persona ya eligió una paleta, se respeta.
  const palette = draftPalette(explicitPalette, gender);

  // Vista previa del borrador; se guarda en el perfil al crear la cuenta.
  useEffect(() => {
    previewPalette(palette);
  }, [palette, previewPalette]);
  useEffect(() => () => previewPalette(null), [previewPalette]);

  function validate(): { phone: string | null } | null {
    const next: FieldErrors = {};
    if (!displayName.trim()) next.displayName = 'Escribe tu nombre.';
    if (!isEmail(email)) next.email = 'Escribe un correo válido.';
    const normalizedPhone = phone.trim() ? normalizePhone(phone) : null;
    if (phone.trim() && !normalizedPhone) next.phone = 'Usa 10 dígitos, por ejemplo 55 1234 5678.';
    const problem = passwordProblem(password);
    if (problem) next.password = problem;
    if (confirm !== password) next.confirm = 'Las contraseñas no coinciden.';
    setErrors(next);
    return Object.keys(next).length === 0 ? { phone: normalizedPhone } : null;
  }

  async function handleSignUp() {
    const valid = validate();
    if (!valid) return;
    setError(null);
    setLoading('form');
    const result = await signUp({
      displayName: displayName.trim(),
      email: email.trim().toLowerCase(),
      phone: valid.phone,
      password,
      gender,
      palette,
    });
    setLoading(null);
    setError(result.error);
    // Con sesión activa, el layout raíz lleva al onboarding.
  }

  async function handleGoogle() {
    setError(null);
    setLoading('google');
    const result = await signInWithGoogle();
    setLoading(null);
    setError(result.error);
  }

  return (
    <Screen>
      <AuthHeader title="Crea tu cuenta" subtitle="Solo te toma un minuto." />

      <Button
        title="Registrarme con Google"
        variant="outline"
        leading={<GoogleLogo />}
        onPress={handleGoogle}
        loading={loading === 'google'}
        disabled={loading !== null}
      />

      <OrDivider />

      <TextField
        label="Nombre"
        value={displayName}
        onChangeText={setDisplayName}
        error={errors.displayName}
        autoComplete="name"
        textContentType="name"
      />
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
        label="Teléfono (opcional)"
        hint="Alias para iniciar sesión con tu número. Aún no lo verificamos por SMS."
        value={phone}
        onChangeText={setPhone}
        error={errors.phone}
        autoComplete="tel"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      <TextField
        label="Contraseña"
        hint="Mínimo 8 caracteres, con letras y números."
        password
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <TextField
        label="Confirmar contraseña"
        password
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        autoComplete="new-password"
        textContentType="newPassword"
      />

      <Card tone="muted">
        <OptionGroup
          label="Género (opcional)"
          options={GENDER_OPTIONS}
          value={gender}
          onChange={setGender}
        />
        <AppText variant="secondary">
          Lo usamos solo para sugerirte colores. Puedes elegir cualquier paleta y cambiarla cuando quieras.
        </AppText>
        <AppText variant="label">Paleta de colores</AppText>
        <PalettePicker
          value={palette}
          suggested={suggestedPalette(gender)}
          onChange={setExplicitPalette}
        />
      </Card>

      {error && (
        <AppText variant="secondary" tone="error" accessibilityLiveRegion="assertive">
          {error}
        </AppText>
      )}

      <Button
        title="Crear cuenta"
        icon={UserPlus}
        onPress={handleSignUp}
        loading={loading === 'form'}
        disabled={loading !== null}
      />
      <Button title="Ya tengo cuenta" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
