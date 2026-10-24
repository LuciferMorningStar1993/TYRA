import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { SplashScreen, Stack } from 'expo-router';

import { ThemeProvider, useTheme } from '@/design/theme-provider';
import { SessionProvider, useSession } from '@/providers/session-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  return (
    <SessionProvider>
      <ThemeProvider>
        <SplashScreenController fontsReady={fontsLoaded || !!fontError} />
        <RootNavigator />
      </ThemeProvider>
    </SessionProvider>
  );
}

function SplashScreenController({ fontsReady }: { fontsReady: boolean }) {
  const { isLoading } = useSession();
  if (fontsReady && !isLoading) {
    SplashScreen.hide();
  }
  return null;
}

function RootNavigator() {
  const { session, profile, isLoading } = useSession();
  const { colors } = useTheme();
  // Mientras se carga el perfil no sabemos si ya hizo onboarding: se queda en las
  // pantallas de acceso (tapadas por el splash en el arranque).
  const isReady = !!session && !isLoading;
  const isOnboarded = !!profile?.onboarded_at;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={isReady && isOnboarded}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={isReady && !isOnboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={!isReady}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
    </Stack>
  );
}
