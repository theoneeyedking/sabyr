import React from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, radius, space } from '../theme';

/** Каркас экрана: шапка с кнопкой «назад», прокручиваемое содержимое и закреплённый низ. */
export function Screen({
  title, onBack, backLabel, right, footer, children, testID,
}: {
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <SafeAreaView style={styles.safe} testID={testID}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.frame}>
          {(title || onBack || right) && (
            <View style={styles.header}>
              {onBack ? (
                <Pressable
                  onPress={onBack} style={styles.back} hitSlop={8}
                  accessibilityRole="button" accessibilityLabel={backLabel} testID="back"
                >
                  <Text style={styles.backArrow}>‹</Text>
                </Pressable>
              ) : null}
              <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">{title}</Text>
              {right}
            </View>
          )}
          <ScrollView
            style={styles.flex} contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/** Большая кнопка (не ниже 60 px) с крупной подписью. */
export function Button({
  label, onPress, variant = 'primary', disabled, loading, testID, style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress} disabled={off} testID={testID}
      accessibilityRole="button" accessibilityState={{ disabled: !!off }}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        off && (variant === 'primary' ? styles.buttonPrimaryOff : styles.buttonOff),
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'primary' ? styles.buttonLabelPrimary : styles.buttonLabelSecondary,
            off && variant !== 'primary' && styles.buttonLabelOff,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <View style={[styles.card, style]} testID={testID}>{children}</View>;
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]} accessibilityRole="header">{children}</Text>;
}

export function Heading({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.heading, style]}>{children}</Text>;
}

export function Body({ children, style, soft, testID }: {
  children: React.ReactNode; style?: StyleProp<TextStyle>; soft?: boolean; testID?: string;
}) {
  return <Text style={[styles.body, soft && styles.soft, style]} testID={testID}>{children}</Text>;
}

/** Спокойное сообщение об ошибке (без красного фона). */
export function ErrorNote({ text, testID }: { text: string | null; testID?: string }) {
  if (!text) return null;
  return (
    <View style={styles.errorNote} accessibilityRole="alert" testID={testID ?? 'error-note'}>
      <Text style={styles.errorText}>{text}</Text>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={[styles.body, styles.soft]}>{label}</Text> : null}
    </View>
  );
}

/** Строка «подпись — значение» для карточек с деталями перевода. */
export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.body, styles.soft, styles.rowLabel]}>{label}</Text>
      <Text style={[styles.body, styles.rowValue, strong && styles.rowStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg },
  frame: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm, minHeight: 64,
  },
  back: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  backArrow: { fontSize: 34, lineHeight: 38, color: colors.primary, marginTop: -4 },
  headerTitle: { flex: 1, fontSize: font.lead, fontWeight: '700', color: colors.ink },
  content: { paddingHorizontal: space.md, paddingBottom: space.xl, paddingTop: space.xs, gap: space.md },
  footer: {
    paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line,
  },
  button: {
    minHeight: 62, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonPrimaryOff: { backgroundColor: colors.disabled },
  buttonOff: { borderColor: colors.disabled, backgroundColor: colors.disabledBg },
  pressed: { opacity: 0.8 },
  buttonLabel: { fontSize: font.lead - 1, fontWeight: '700', textAlign: 'center' },
  buttonLabelPrimary: { color: colors.onPrimary },
  buttonLabelSecondary: { color: colors.primary },
  buttonLabelOff: { color: '#6B7885' },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.card, padding: space.md, gap: space.sm,
    borderWidth: 1, borderColor: colors.line,
  },
  title: { fontSize: font.title, lineHeight: 36, fontWeight: '800', color: colors.ink },
  heading: { fontSize: font.lead, lineHeight: 28, fontWeight: '700', color: colors.ink },
  body: { fontSize: font.body, lineHeight: 27, color: colors.ink },
  soft: { color: colors.inkSoft },
  errorNote: {
    backgroundColor: colors.mediumSoft, borderRadius: radius.button, padding: space.md,
    borderLeftWidth: 5, borderLeftColor: colors.medium,
  },
  errorText: { fontSize: font.body, lineHeight: 26, color: '#4A3100', fontWeight: '600' },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xl, gap: space.md },
  row: { gap: 2 },
  rowLabel: { fontSize: font.small, lineHeight: 22 },
  rowValue: { fontWeight: '600' },
  rowStrong: { fontSize: font.title, lineHeight: 36, fontWeight: '800' },
});
