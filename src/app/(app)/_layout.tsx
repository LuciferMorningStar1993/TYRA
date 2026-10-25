import { Stack } from 'expo-router';

import { useTheme } from '@/design/theme-provider';
import { fontFamily } from '@/design/tokens';
import { WeightProvider } from '@/providers/weight-provider';

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    // Un solo estado de peso para Inicio, Salud y las pantallas de peso.
    <WeightProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontFamily: fontFamily.semibold, color: colors.textPrimary },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}>
        {/* title: nombre del botón «atrás» que leen los lectores de pantalla en las pantallas apiladas. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Atrás' }} />
        <Stack.Screen name="apariencia" options={{ title: 'Apariencia' }} />
        <Stack.Screen name="peso/index" options={{ title: 'Peso' }} />
        <Stack.Screen name="peso/registrar" options={{ title: 'Registrar peso' }} />
        <Stack.Screen name="datos-salud" options={{ title: 'Datos de salud' }} />
      </Stack>
    </WeightProvider>
  );
}
