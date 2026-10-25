import { router } from 'expo-router';
import { MailCheck } from 'lucide-react-native';

import { AuthHeader } from '@/components/auth-header';
import { AppText, Button, Card, Screen } from '@/components/ui';

/**
 * Registro cerrado: TYRA es solo por invitación ([auth] enable_signup = false en el servidor).
 * Las cuentas las crea un administrador; la persona verifica su correo al aceptar la invitación
 * y DESPUÉS crea su contraseña. Esta pantalla solo lo explica.
 */
export default function SignUpScreen() {
  return (
    <Screen centered>
      <AuthHeader title="TYRA es por invitación" subtitle="Las cuentas las crea el administrador de la familia." />
      <Card tone="muted">
        <AppText variant="secondary">
          Pídele una invitación. Te llegará un correo con un enlace y un código: al aceptarla confirmas tu correo y
          después creas tu contraseña.
        </AppText>
      </Card>
      <Button title="Tengo un código de invitación" icon={MailCheck} onPress={() => router.replace('/accept-invite')} />
      <Button title="Volver a iniciar sesión" variant="ghost" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
