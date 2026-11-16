import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font } from '../theme';

const TAPS_TO_OPEN = 5;
const TAP_WINDOW_MS = 2500;

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
      <View style={[styles.mark, compact && styles.markCompact]}>
        <View style={[styles.pause, compact && styles.pauseCompact]} />
        <View style={[styles.pause, compact && styles.pauseCompact]} />
      </View>
      <Text style={[styles.word, compact && styles.wordCompact]}>Sabyr</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  markCompact: { width: 44, height: 44, borderRadius: 14, gap: 6 },
  pause: { width: 8, height: 24, borderRadius: 4, backgroundColor: colors.onPrimary },
  pauseCompact: { width: 6, height: 18 },
  word: { fontSize: font.huge - 4, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },
  wordCompact: { fontSize: font.title },
});
