import { Stack } from 'expo-router';

import { useTheme } from '@/design/theme-provider';
import { fontFamily } from '@/design/tokens';

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontFamily: fontFamily.semibold, color: colors.textPrimary },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="apariencia" options={{ title: 'Apariencia' }} />
    </Stack>
  );
}
