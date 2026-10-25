import { LogOut, RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { useSession } from '@/providers/session-provider';

/** Perfil cargando, inexistente o con error de red: se puede reintentar sin perder la sesión. */
export default function ProfileStatusScreen() {
  const { profileState, retryProfile, signOut } = useSession();
  const { colors } = useTheme();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    await retryProfile();
    setRetrying(false);
  }

  if (!profileState || profileState.status === 'loading') {
    return (
      <Screen centered>
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Cargando tu perfil" />
      </Screen>
    );
  }

  const isMissing = profileState.status === 'missing';

  return (
    <Screen centered>
      <AppText variant="title">{isMissing ? 'No encontramos tu perfil' : 'No pudimos cargar tu perfil'}</AppText>
      <AppText tone="secondary" accessibilityLiveRegion="polite">
        {isMissing
          ? 'Tu cuenta existe, pero su perfil no está disponible. Reintenta o vuelve a iniciar sesión.'
          : 'Revisa tu conexión a internet e inténtalo de nuevo. Tus datos están a salvo.'}
      </AppText>
      <Button title="Reintentar" icon={RefreshCw} onPress={handleRetry} loading={retrying} />
      <Button title="Cerrar sesión" icon={LogOut} variant="ghost" onPress={signOut} />
    </Screen>
  );
}
