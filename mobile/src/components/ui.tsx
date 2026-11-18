import React from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors, font, fonts, radius, shadow, space } from '../theme';
import { Icon, type IconName } from './Icon';
import { PressableScale, Reveal, useSvgId } from './Motion';

/** Мягкое цветное свечение в верхней части экрана — фон перестаёт быть плоским. */
function Backdrop({ color, strength }: { color: string; strength: number }) {
  const id = useSvgId('glow');
  return (
    <View style={styles.backdrop}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx="28%" cy="0%" r="95%">
            <Stop offset="0" stopColor={color} stopOpacity={strength} />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Каркас экрана: шапка с кнопкой «назад», прокручиваемое содержимое и закреплённый низ. */
export function Screen({
  title, onBack, backLabel, right, footer, children, testID, glow = '#CFDCEC', glowStrength = 0.55,
}: {
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  testID?: string;
  /** Цвет свечения фона; на экране Sabyr он повторяет уровень риска. */
  glow?: string;
  glowStrength?: number;
}) {
  return (
    <SafeAreaView style={styles.safe} testID={testID}>
      <Backdrop color={glow} strength={glowStrength} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.frame}>
          {(title || onBack || right) && (
            <View style={styles.header}>
              {onBack ? (
                <PressableScale
                  onPress={onBack} style={styles.back} hitSlop={8} scaleTo={0.92}
                  accessibilityRole="button" accessibilityLabel={backLabel} testID="back"
                >
                  <Icon name="chevronLeft" size={26} color={colors.ink} stroke={2.2} />
                </PressableScale>
              ) : null}
              <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">{title}</Text>
              {right}
            </View>
          )}
          <ScrollView
            style={styles.flex} contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
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

/** Большая кнопка (не ниже 62 px) с крупной подписью. */
export function Button({
  label, onPress, variant = 'primary', disabled, loading, testID, style, icon,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  icon?: IconName;
}) {
  const off = disabled || loading;
  const fg = variant === 'primary'
    ? colors.onPrimary
    : off ? colors.inkFaint : variant === 'ghost' ? colors.inkSoft : colors.ink;
  return (
    <PressableScale
      onPress={onPress} disabled={off} testID={testID}
      accessibilityRole="button" accessibilityState={{ disabled: !!off }}
      style={[
        styles.button,
        variant === 'primary' && (off ? styles.buttonPrimaryOff : styles.buttonPrimary),
        variant === 'secondary' && (off ? styles.buttonSecondaryOff : styles.buttonSecondary),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} />
      ) : (
        <>
          <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
          {icon ? <Icon name={icon} size={22} color={fg} stroke={2.2} /> : null}
        </>
      )}
    </PressableScale>
  );
}

/** Карточка: белая поверхность с мягкой тенью. index задаёт порядок появления на экране. */
export function Card({
  children, style, testID, index,
}: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string; index?: number;
}) {
  const card = <View style={[styles.card, style]} testID={testID}>{children}</View>;
  return index == null ? card : <Reveal index={index}>{card}</Reveal>;
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]} accessibilityRole="header">{children}</Text>;
}

export function Heading({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.heading, style]}>{children}</Text>;
}

/** Небольшая подпись над значением или блоком. */
export function Caption({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.caption, style]}>{children}</Text>;
}

export function Body({ children, style, soft, testID }: {
  children: React.ReactNode; style?: StyleProp<TextStyle>; soft?: boolean; testID?: string;
}) {
  return <Text style={[styles.body, soft && styles.soft, style]} testID={testID}>{children}</Text>;
}

/** Значок в скруглённом квадрате — общий элемент списков и плиток. */
export function IconBadge({
  name, bg = colors.primarySoft, color = colors.primary, size = 52,
}: {
  name: IconName; bg?: string; color?: string; size?: number;
}) {
  return (
    <View style={[styles.iconBadge, { width: size, height: size, borderRadius: size * 0.34, backgroundColor: bg }]}>
      <Icon name={name} size={size * 0.46} color={color} stroke={2.1} />
    </View>
  );
}

/** Цветная метка-«таблетка». */
export function Pill({
  label, fg, bg, icon, testID, dot,
}: {
  label: string; fg: string; bg: string; icon?: IconName; testID?: string; dot?: boolean;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {dot ? <View style={[styles.pillDot, { backgroundColor: fg }]} /> : null}
      {icon ? <Icon name={icon} size={16} color={fg} stroke={2.3} /> : null}
      <Text style={[styles.pillText, { color: fg }]} testID={testID}>{label}</Text>
    </View>
  );
}

/** Спокойное сообщение об ошибке (без красного фона). */
export function ErrorNote({ text, testID }: { text: string | null; testID?: string }) {
  if (!text) return null;
  return (
    <View style={styles.errorNote} accessibilityRole="alert" testID={testID ?? 'error-note'}>
      <Icon name="info" size={22} color={colors.medium} />
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
      <Text style={styles.caption}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: 420, pointerEvents: 'none' },
  frame: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.md + 2, paddingTop: space.sm, paddingBottom: space.sm, minHeight: 68,
  },
  back: {
    width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, ...shadow.card,
  },
  headerTitle: { flex: 1, fontFamily: fonts.bold, fontSize: font.lead, letterSpacing: -0.3, color: colors.ink },
  content: { paddingHorizontal: space.md + 2, paddingBottom: space.xl + 8, paddingTop: space.xs, gap: space.md },
  footer: {
    paddingHorizontal: space.md + 2, paddingTop: space.md, paddingBottom: space.md + 2, gap: space.sm,
    backgroundColor: colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30,
    boxShadow: '0 -8px 30px rgba(15,39,66,0.09)',
  },
  button: {
    minHeight: 62, borderRadius: radius.button, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm,
  },
  buttonPrimary: { backgroundColor: colors.primary, ...shadow.button },
  buttonPrimaryOff: { backgroundColor: colors.disabled },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.lineStrong },
  buttonSecondaryOff: { backgroundColor: colors.disabledBg },
  buttonLabel: { fontFamily: fonts.semibold, fontSize: font.body + 1, letterSpacing: -0.2, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.card, padding: space.md + 4, gap: space.sm + 2,
    ...shadow.card,
  },
  title: { fontFamily: fonts.extra, fontSize: font.title, lineHeight: 34, letterSpacing: -0.8, color: colors.ink },
  heading: { fontFamily: fonts.bold, fontSize: font.lead, lineHeight: 27, letterSpacing: -0.3, color: colors.ink },
  caption: { fontFamily: fonts.medium, fontSize: font.small - 1, lineHeight: 21, color: colors.inkSoft },
  body: { fontFamily: fonts.regular, fontSize: font.body, lineHeight: 27, color: colors.ink },
  soft: { color: colors.inkSoft },
  iconBadge: { alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    paddingHorizontal: 13, paddingVertical: 6, borderRadius: radius.chip,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontFamily: fonts.semibold, fontSize: font.small - 1, lineHeight: 21 },
  errorNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.sm,
    backgroundColor: colors.mediumSoft, borderRadius: radius.button, padding: space.md,
  },
  errorText: { flex: 1, fontFamily: fonts.medium, fontSize: font.body - 1, lineHeight: 25, color: '#4A3100' },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xl, gap: space.md },
  row: { gap: 2 },
  rowValue: { fontFamily: fonts.semibold, fontSize: font.body, lineHeight: 26, color: colors.ink },
  rowStrong: {
    fontFamily: fonts.extra, fontSize: font.title + 4, lineHeight: 40, letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  divider: { height: 1, backgroundColor: colors.line },
});
