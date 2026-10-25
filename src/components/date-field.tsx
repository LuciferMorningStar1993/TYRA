import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { space } from '@/design/tokens';

export type DateFieldProps = {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  minimumDate: Date;
  maximumDate: Date;
  /** Fecha que muestra el selector cuando aún no hay valor. */
  initialPickerDate?: Date;
  hint?: string;
  error?: string | null;
};

/** Fecha con el selector nativo (iOS compacto, diálogo en Android). En web: date-field.web.tsx. */
export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  initialPickerDate,
  hint,
  error,
}: DateFieldProps) {
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const pickerDate = value ?? initialPickerDate ?? maximumDate;

  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="compact"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onValueChange={(_event, date) => onChange(date)}
          accessibilityLabel={label}
          style={styles.iosPicker}
        />
      ) : (
        <>
          <Button
            title={value ? value.toLocaleDateString() : 'Elegir fecha'}
            icon={CalendarDays}
            variant="outline"
            accessibilityHint={`Abre el calendario: ${label.toLowerCase()}`}
            onPress={() => setShowAndroidPicker(true)}
          />
          {showAndroidPicker && (
            <DateTimePicker
              value={pickerDate}
              mode="date"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onValueChange={(_event, date) => {
                setShowAndroidPicker(false);
                onChange(date);
              }}
              onDismiss={() => setShowAndroidPicker(false)}
            />
          )}
        </>
      )}
      {error ? (
        <AppText variant="secondary" tone="error" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="secondary">{hint}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xxs + 2 },
  iosPicker: { alignSelf: 'flex-start' },
});
