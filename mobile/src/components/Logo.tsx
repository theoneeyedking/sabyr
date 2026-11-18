import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors, fonts } from '../theme';
import { useSvgId } from './Motion';

const TAPS_TO_OPEN = 5;
const TAP_WINDOW_MS = 2500;

/** Знак Sabyr — «пауза» в скруглённом квадрате. */
export function Mark({ size = 52 }: { size?: number }) {
  const id = useSvgId('mark');
  const bar = { width: size * 0.13, height: size * 0.4, y: size * 0.3, rx: size * 0.065, fill: colors.onPrimary };
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.primaryLift} />
          <Stop offset="1" stopColor={colors.primaryDeep} />
        </LinearGradient>
      </Defs>
      <Rect width={size} height={size} rx={size * 0.3} fill={`url(#${id})`} />
      <Rect x={size * 0.31} {...bar} />
      <Rect x={size * 0.56} {...bar} />
    </Svg>
  );
}

/** Логотип Sabyr. Пять быстрых нажатий или долгое нажатие открывают скрытое демо-меню. */
export function Logo({ onSecret, compact }: { onSecret: () => void; compact?: boolean }) {
  const taps = useRef<number[]>([]);
  const onPress = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((ts) => now - ts < TAP_WINDOW_MS), now];
    if (taps.current.length >= TAPS_TO_OPEN) {
      taps.current = [];
      onSecret();
    }
  };
  return (
    <Pressable onPress={onPress} onLongPress={onSecret} delayLongPress={700} testID="logo" style={styles.wrap}>
      <View style={styles.mark}><Mark size={compact ? 42 : 52} /></View>
      <Text style={[styles.word, compact && styles.wordCompact]}>Sabyr</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  mark: { borderRadius: 16, boxShadow: '0 6px 16px rgba(15,39,66,0.25)' },
  word: { fontFamily: fonts.extra, fontSize: 32, letterSpacing: -1, color: colors.ink },
  wordCompact: { fontSize: 26, letterSpacing: -0.8 },
});
