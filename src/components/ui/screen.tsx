import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme-provider';
import { breakpoints, space } from '@/design/tokens';

/**
 * Contenedor base de pantalla: fondo del tema, área segura, scroll y teclado.
 * En pantallas anchas limita el ancho del contenido para que siga siendo legible.
 */
export function Screen({
  children,
  edges = ['top', 'bottom'],
  centered = false,
}: PropsWithChildren<{ edges?: Edge[]; centered?: boolean }>) {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, centered && styles.centered]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: space.lg },
  centered: { justifyContent: 'center' },
  content: { width: '100%', maxWidth: breakpoints.tablet, alignSelf: 'center', gap: space.md },
});
