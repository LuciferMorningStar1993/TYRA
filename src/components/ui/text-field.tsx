import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { useId, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/design/theme-provider';
import { controlHeight, MAX_FONT_SCALE, radius, space, typography } from '@/design/tokens';

import { AppText } from './app-text';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: LucideIcon;
  /** Campo de contraseña con botón para mostrar/ocultar. */
  password?: boolean;
};

export function TextField({ label, hint, error, icon: Icon, password = false, ...inputProps }: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const hintId = useId();

  const borderColor = error ? colors.error : focused ? colors.primary : colors.borderStrong;

  return (
    <View style={styles.field}>
      <AppText variant="label" nativeID={`${hintId}-label`}>
        {label}
      </AppText>
      <View
        style={[
          styles.inputRow,
          { borderColor, backgroundColor: colors.surface, borderWidth: focused || error ? 2 : 1.5 },
        ]}>
        {Icon && <Icon size={20} color={colors.textSecondary} />}
        <TextInput
          accessibilityLabel={label}
          accessibilityLabelledBy={`${hintId}-label`}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors.textDisabled}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          secureTextEntry={password && hidden}
          autoCapitalize={password ? 'none' : inputProps.autoCapitalize}
          {...inputProps}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          style={[styles.input, typography.body, { color: colors.textPrimary }]}
        />
        {password && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            hitSlop={8}
            onPress={() => setHidden((value) => !value)}
            style={styles.trailing}>
            {hidden ? (
              <Eye size={22} color={colors.textSecondary} />
            ) : (
              <EyeOff size={22} color={colors.textSecondary} />
            )}
          </Pressable>
        )}
      </View>
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
  inputRow: {
    minHeight: controlHeight.input,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  input: { flex: 1, paddingVertical: space.sm },
  trailing: {
    minWidth: controlHeight.touchTarget,
    minHeight: controlHeight.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.sm,
  },
});
