import { Tabs } from 'expo-router';
import { HeartPulse, House, UserRound, Wallet, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, useWindowDimensions, View, type ColorValue } from 'react-native';

import { useTheme } from '@/design/theme-provider';
import { breakpoints, controlHeight, radius, typography } from '@/design/tokens';

function TabIcon({ icon: Icon, color, focused }: { icon: LucideIcon; color: ColorValue; focused: boolean }) {
  const { colors } = useTheme();
  // La pestaña activa se distingue por la "píldora" de fondo y el trazo más grueso, no solo por el color.
  return (
    <View style={[styles.iconPill, focused && { backgroundColor: colors.primarySoft }]}>
      <Icon size={22} color={color} strokeWidth={focused ? 2.5 : 2} />
    </View>
  );
}

const TABS: { name: string; title: string; icon: LucideIcon }[] = [
  { name: 'index', title: 'Inicio', icon: House },
  { name: 'salud', title: 'Salud', icon: HeartPulse },
  { name: 'finanzas', title: 'Finanzas', icon: Wallet },
  { name: 'perfil', title: 'Perfil', icon: UserRound },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= breakpoints.tablet;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // En tableta/escritorio la navegación pasa a una barra lateral.
        tabBarPosition: isWide ? 'left' : 'bottom',
        tabBarVariant: isWide ? 'material' : 'uikit',
        tabBarLabelPosition: isWide ? 'beside-icon' : 'below-icon',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarAllowFontScaling: true,
        tabBarLabelStyle: { ...typography.caption, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          ...(isWide ? {} : { minHeight: controlHeight.tabBar }),
        },
        tabBarItemStyle: { minHeight: controlHeight.touchTarget },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      {TABS.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarAccessibilityLabel: title,
            tabBarIcon: ({ color, focused }) => <TabIcon icon={icon} color={color} focused={focused} />,
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconPill: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: radius.pill },
});