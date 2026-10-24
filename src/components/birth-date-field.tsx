import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { space } from '@/design/tokens';
import { MIN_BIRTH_DATE } from '@/lib/onboarding';

const DEFAULT_BIRTH_DATE = new Date(1990, 0, 1);

export type BirthDateFieldProps = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  error?: string | null;
};

/** Fecha de nacimiento con el selector nativo (iOS compacto, diálogo en Android). En web: birth-date-field.web.tsx. */
export function BirthDateField({ value, onChange, error }: BirthDateFieldProps) {
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  return (
    <View style={styles.field}>
      <AppText variant="label">Fecha de nacimiento</AppText>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={value ?? DEFAULT_BIRTH_DATE}
          mode="date"
          display="compact"
          minimumDate={MIN_BIRTH_DATE}
          maximumDate={new Date()}
          onValueChange={(_event, date) => onChange(date)}
          accessibilityLabel="Fecha de nacimiento"
          style={styles.iosPicker}
        />
      ) : (
        <>
          <Button
            title={value ? value.toLocaleDateString() : 'Elegir fecha'}
            icon={CalendarDays}
            variant="outline"
            accessibilityHint="Abre el calendario para elegir tu fecha de nacimiento"
            onPress={() => setShowAndroidPicker(true)}
          />
          {showAndroidPicker && (
            <DateTimePicker
              value={value ?? DEFAULT_BIRTH_DATE}
              mode="date"
              minimumDate={MIN_BIRTH_DATE}
              maximumDate={new Date()}
              onValueChange={(_event, date) => {
                setShowAndroidPicker(false);
                onChange(date);
              }}
              onDismiss={() => setShowAndroidPicker(false)}
            />
          )}
        </>
      )}
      {error && (
        <AppText variant="secondary" tone="error" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xxs + 2 },
  iosPicker: { alignSelf: 'flex-start' },
});
