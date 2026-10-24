import { RefreshCw } from 'lucide-react-native';

import { PalettePicker } from '@/components/palette-picker';
import { AppText, Button, Card, OptionGroup, Screen } from '@/components/ui';
import { COLOR_MODE_OPTIONS } from '@/constants/options';
import { useTheme } from '@/design/theme-provider';

export default function AppearanceScreen() {
  const { palette, mode, setPalette, setMode, saveError, retrySave } = useTheme();

  return (
    <Screen edges={['bottom']}>
      {saveError && (
        <Card tone="muted">
          <AppText variant="secondary" tone="error" accessibilityLiveRegion="assertive">
            {saveError}
          </AppText>
          <Button title="Reintentar" icon={RefreshCw} variant="outline" onPress={retrySave} />
        </Card>
      )}

      <Card>
        <OptionGroup label="Modo de color" options={COLOR_MODE_OPTIONS} value={mode} onChange={setMode} />
        <AppText variant="secondary">Automático sigue la configuración de tu teléfono.</AppText>
      </Card>

      <Card>
        <AppText variant="cardTitle">Paleta</AppText>
        <PalettePicker value={palette} onChange={setPalette} />
      </Card>

      <Card>
        <AppText variant="cardTitle">Vista previa</AppText>
        <AppText>Así se ven los botones con tu tema.</AppText>
        <Button title="Principal" onPress={() => {}} />
        <Button title="Secundario" variant="secondary" onPress={() => {}} />
        <Button title="Contorno" variant="outline" onPress={() => {}} />
      </Card>
    </Screen>
  );
}
