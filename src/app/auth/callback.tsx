import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { AcceptInviteForm } from '@/components/accept-invite-form';
import { completeAuthRedirect, parseAuthRedirect, type AuthRedirectResult } from '@/lib/auth';

/**
 * Destino de los enlaces de Auth (tyra://auth/callback o http://localhost:<puerto>/auth/callback):
 * confirmación de correo, recuperación y Google. Con éxito, el layout raíz decide la ruta (una
 * recuperación lleva a la contraseña nueva); con error, explica qué pasó y ofrece pedir otro enlace.
 */
export default function AuthCallbackScreen() {
  const { colors } = useTheme();
  const url = Linking.useLinkingURL();
  const [result, setResult] = useState<AuthRedirectResult | null>(null);
  // Enlace de invitación: no se procesa al cargar; la persona confirma con un botón.
  const params = url ? parseAuthRedirect(url) : {};
  const inviteTokenHash = params.type === 'invite' && params.token_hash ? params.token_hash : null;

  useEffect(() => {
    if (!url || inviteTokenHash) return;
    let cancelled = false;
    completeAuthRedirect(url).then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, [url, inviteTokenHash]);

  if (inviteTokenHash) return <AcceptInviteForm tokenHash={inviteTokenHash} />;

  // Sin enlace que procesar (navegación directa) o con sesión creada: el layout decide.
  if (!url || result?.status === 'signed_in') return <Redirect href="/" />;

  if (!result) {
    return (
      <Screen centered>
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Confirmando tu acceso" />
      </Screen>
    );
  }

  return (
    <Screen centered>
      <AppText variant="title">No pudimos completar el acceso</AppText>
      <AppText tone="secondary" accessibilityLiveRegion="polite">
        {result.message}
      </AppText>
      {/* El tipo de enlace no se puede saber de forma confiable sin su verificador: se ofrecen ambos caminos. */}
      {(result.reason === 'expired' || result.reason === 'exchange_failed') && (
        <>
          <Button title="Pedir otro enlace para cambiar mi contraseña" onPress={() => router.replace('/forgot-password')} />
          <Button
            title="Reenviar el enlace de confirmación"
            variant="outline"
            onPress={() => router.replace('/check-email')}
          />
        </>
      )}
      <Button title="Ir a iniciar sesión" variant="ghost" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
