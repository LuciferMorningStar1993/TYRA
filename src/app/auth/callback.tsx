import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme-provider';
import { completeOAuthRedirect } from '@/lib/auth';

/**
 * Destino del redirect de Google (tyra://auth/callback). Normalmente el código lo
 * procesa signInWithGoogle; esta ruta cubre el caso en que el sistema abre la app
 * directamente con el link.
 */
export default function AuthCallbackScreen() {
  const { colors } = useTheme();
  const url = Linking.useLinkingURL();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!url) return;
    completeOAuthRedirect(url).finally(() => setDone(true));
  }, [url]);

  // Sin link que procesar (p. ej. navegación directa) no hay nada que esperar.
  if (done || !url) return <Redirect href="/" />;

  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} accessibilityLabel="Iniciando sesión" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
