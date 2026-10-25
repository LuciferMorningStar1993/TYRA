import { createElement, useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/design/theme-provider';
import { controlHeight, radius, space, typography } from '@/design/tokens';
import { MIN_BIRTH_DATE } from '@/lib/onboarding';
import { formatDateOnly, parseDateOnly } from '@/lib/profile';

import type { BirthDateFieldProps } from './birth-date-field';

/**
 * Web: <input type="date"> nativo del navegador. Es accesible con teclado y lector de
 * pantalla, y tiene su propio calendario; no requiere dependencias.
 */
export function BirthDateField({ value, onChange, error }: BirthDateFieldProps) {
  const { colors } = useTheme();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const errorId = `${id}-error`;

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
        'Fecha de nacimiento',
      )}
      {createElement('input', {
        id,
        type: 'date',
        // No controlado: si React reescribe `value` en cada render, borra la fecha que se está tecleando.
        defaultValue: value ? formatDateOnly(value) : undefined,
        min: formatDateOnly(MIN_BIRTH_DATE),
        max: formatDateOnly(new Date()),
        required: true,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
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
      {error && (
        <AppText variant="secondary" tone="error" nativeID={errorId} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xxs + 2 },
});
