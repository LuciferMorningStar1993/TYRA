import { SplashScreen, Stack } from 'expo-router';

import { SessionProvider, useSession } from '@/providers/session-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <SplashScreenController />
      <RootNavigator />
    </SessionProvider>
  );
}

function SplashScreenController() {
  const { isLoading } = useSession();
  if (!isLoading) {
    SplashScreen.hide();
  }
  return null;
}

function RootNavigator() {
  const { session, profile, isLoading } = useSession();
  // Mientras se carga el perfil no sabemos si ya hizo onboarding: se queda en sign-in
  // (tapado por el splash en el arranque) para no mostrar la pantalla equivocada.
  const isReady = !!session && !isLoading;
  const isOnboarded = !!profile?.onboarded_at;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isReady && isOnboarded}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={isReady && !isOnboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={!isReady}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
