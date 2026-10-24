import { router } from 'expo-router';
import { LogOut, Palette } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, ListItem, Screen } from '@/components/ui';
import { decorative } from '@/design/a11y';
import { PALETTES } from '@/design/palettes';
import { useTheme } from '@/design/theme-provider';
import { radius, space } from '@/design/tokens';
import { useSession } from '@/providers/session-provider';

const MODE_LABEL = { system: 'Automático', light: 'Claro', dark: 'Oscuro' } as const;

export default function ProfileScreen() {
  const { session, profile, signOut } = useSession();
  const { colors, palette, mode } = useTheme();
  const name = profile?.display_name ?? 'Tu perfil';

  return (
    <Screen edges={['top']}>
      <AppText variant="title">Perfil</AppText>

      <Card>
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]} {...decorative}>
            <AppText variant="section" tone="onPrimary">
              {name.charAt(0).toUpperCase()}
            </AppText>
          </View>
          <View style={styles.flex}>
            <AppText variant="cardTitle">{name}</AppText>
            {session?.user.email && <AppText variant="secondary">{session.user.email}</AppText>}
            {profile?.phone && <AppText variant="secondary">{profile.phone}</AppText>}
          </View>
        </View>
      </Card>

      <AppText variant="label">Configuración</AppText>
      <Card>
        <ListItem
          icon={Palette}
          title="Apariencia"
          subtitle={`${PALETTES[palette].name} · ${MODE_LABEL[mode]}`}
          onPress={() => router.push('/apariencia')}
        />
      </Card>

      <Card>
        <ListItem icon={LogOut} title="Cerrar sesión" destructive onPress={signOut} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 56, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
