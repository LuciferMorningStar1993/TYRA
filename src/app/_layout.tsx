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
  const { route, profileState } = useSession();
  // En el arranque el splash tapa la carga inicial del perfil; si falla, se muestra el error.
  const stillLoading = route === 'starting' || profileState?.status === 'loading';
  if (fontsReady && !stillLoading) {
    SplashScreen.hide();
  }
  return null;
}

function RootNavigator() {
  const { route } = useSession();
  const { colors } = useTheme();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={route === 'app'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={route === 'onboarding'}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      {/* Cargando, sin perfil o error recuperable: nunca se manda al onboarding por un fallo de red. */}
      <Stack.Protected guard={route === 'profile-status'}>
        <Stack.Screen name="profile-status" />
      </Stack.Protected>

      <Stack.Protected guard={route === 'auth' || route === 'starting'}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        {/* Destino del redirect de Google; con guard para que nunca sea la pantalla "por defecto". */}
        <Stack.Screen name="auth/callback" />
      </Stack.Protected>
    </Stack>
  );
}
