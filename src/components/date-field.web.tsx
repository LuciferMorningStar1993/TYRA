import { createElement, useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { controlHeight, radius, space, typography } from '@/design/tokens';
import { formatDateOnly, parseDateOnly } from '@/lib/profile';

import type { DateFieldProps } from './date-field';

/**
 * Web: <input type="date"> nativo del navegador. Es accesible con teclado y lector de
 * pantalla, y tiene su propio calendario; no requiere dependencias.
 */
export function DateField({ label, value, onChange, minimumDate, maximumDate, hint, error }: DateFieldProps) {
  const { colors } = useTheme();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <View style={styles.field}>
      {createElement(
        'label',
        {
          htmlFor: id,
          style: {
            fontFamily: typography.label.fontFamily,
            fontSize: typography.label.fontSize,
            lineHeight: `${typography.label.lineHeight}px`,
            color: colors.textPrimary,
          },
        },
        label,
      )}
      {createElement('input', {
        id,
        type: 'date',
        // No controlado: si React reescribe `value` en cada render, borra la fecha que se está tecleando.
        defaultValue: value ? formatDateOnly(value) : undefined,
        min: formatDateOnly(minimumDate),
        max: formatDateOnly(maximumDate),
        required: true,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        onChange: (event: { target: { value: string } }) => {
          onChange(event.target.value ? parseDateOnly(event.target.value) : null);
        },
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        style: {
          fontFamily: typography.body.fontFamily,
          fontSize: typography.body.fontSize,
          // En el DOM un lineHeight numérico es un multiplicador: se fija en px.
          lineHeight: `${typography.body.lineHeight}px`,
          minHeight: controlHeight.input,
          boxSizing: 'border-box',
          borderRadius: radius.control,
          padding: `0 ${space.md}px`,
          borderStyle: 'solid',
          borderWidth: focused || error ? 2 : 1.5,
          borderColor: error ? colors.error : focused ? colors.primary : colors.borderStrong,
          backgroundColor: colors.surface,
          color: colors.textPrimary,
          colorScheme: 'light dark',
          outline: focused ? `3px solid ${colors.focusRing}` : 'none',
          outlineOffset: 2,
        },
      })}
      {error ? (
        <AppText variant="secondary" tone="error" nativeID={errorId} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="secondary" nativeID={hintId}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xxs + 2 },
});
