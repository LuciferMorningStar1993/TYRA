import { Phone } from 'lucide-react-native';
import { useState } from 'react';

import { AppText, Button, Card, TextField } from '@/components/ui';
import { normalizePhone } from '@/lib/identifier';
import { useSession } from '@/providers/session-provider';

/** Mensaje comprensible para los errores al guardar el alias. */
export function phoneAliasSaveError(error: string): string {
  if (/duplicate key|unique/i.test(error)) return 'Ese teléfono ya es alias de otra cuenta.';
  if (/check constraint/i.test(error)) return 'El teléfono no tiene un formato válido.';
  if (error === 'no_session' || error === 'no_row') return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  return 'No pudimos guardar el alias. Inténtalo de nuevo.';
}

/**
 * Alias de teléfono para iniciar sesión con tu número. Solo el dueño lo fija, con su sesión
 * (RLS: cada quien edita su perfil). Es un alias NO verificado: no se comprueba por SMS.
 */
export function PhoneAliasCard() {
  const { profile, saveProfile } = useSession();
  const [value, setValue] = useState(profile?.phone ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(phone: string | null) {
    setSaving(true);
    setMessage(null);
    const result = await saveProfile({ phone });
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: 'error', text: phoneAliasSaveError(result.error) });
      return;
    }
    setValue(phone ?? '');
    setMessage({ tone: 'success', text: phone ? 'Alias guardado.' : 'Alias eliminado.' });
  }

  async function handleSave() {
    const normalized = normalizePhone(value);
    if (!normalized) {
      setFieldError('Usa 10 dígitos, por ejemplo 55 1234 5678, o el formato internacional (+…).');
      return;
    }
    setFieldError(null);
    await save(normalized);
  }

  return (
    <Card>
      <AppText variant="cardTitle">Alias de teléfono</AppText>
      <AppText variant="secondary">
        Te permite iniciar sesión con tu número y tu contraseña. No lo verificamos por SMS.
      </AppText>
      <TextField
        label="Teléfono (alias no verificado)"
        icon={Phone}
        value={value}
        onChangeText={setValue}
        error={fieldError}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      {message && (
        <AppText
          variant="secondary"
          tone={message.tone === 'error' ? 'error' : 'success'}
          accessibilityLiveRegion="polite">
          {message.text}
        </AppText>
      )}
      <Button title="Guardar alias" variant="outline" onPress={handleSave} loading={saving} />
      {profile?.phone && <Button title="Quitar alias" variant="ghost" onPress={() => save(null)} disabled={saving} />}
    </Card>
  );
}
