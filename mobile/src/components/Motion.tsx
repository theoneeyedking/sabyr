import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View,
  type PressableProps, type StyleProp, type ViewStyle,
} from 'react-native';

const NATIVE = Platform.OS !== 'web';

// Если в системе включено «уменьшить движение», анимации появления и пульсации отключаются.
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduceMotion = !!v; }).catch(() => {});

/** Плавное появление блока: лёгкий подъём и проявление, с задержкой по порядку (index). */
export function Reveal({
  index = 0, children, style,
}: {
  index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(v, {
      toValue: 1, duration: 420, delay: Math.min(index, 7) * 55, easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE,
    }).start();
  }, [v, index]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Нажимаемый блок, который слегка «проседает» под пальцем и пружинит обратно. */
export function PressableScale({
  style, children, scaleTo = 0.97, onPressIn, onPressOut, disabled, ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>; children: React.ReactNode; scaleTo?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number) =>
    Animated.spring(scale, { toValue: value, speed: 40, bounciness: 6, useNativeDriver: NATIVE }).start();
  return (
    <AnimatedPressable
      {...rest} disabled={disabled}
      onPressIn={(e) => { if (!disabled) to(scaleTo); onPressIn?.(e); }}
      onPressOut={(e) => { to(1); onPressOut?.(e); }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Медленно расходящиеся кольца — «дыхание» вокруг значка паузы. */
export function Breathing({ color, size, spread = 1.9 }: { color: string; size: number; spread?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 3200, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
      ]));
    const la = loop(a, 0);
    const lb = loop(b, 1600);
    la.start();
    lb.start();
    return () => { la.stop(); lb.stop(); };
  }, [a, b]);
  const ring = (v: Animated.Value) => ({
    width: size, height: size, borderRadius: size / 2, backgroundColor: color,
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, spread] }) }],
  });
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <Animated.View style={[styles.abs, ring(a)]} />
      <Animated.View style={[styles.abs, ring(b)]} />
    </View>
  );
}

/** Три точки «помощник печатает». */
export function TypingDots({ color }: { color: string }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = dots.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 160),
      Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(v, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
      Animated.delay((2 - i) * 160 + 240),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);
  return (
    <View style={styles.dots}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, {
            backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }]}
        />
      ))}
    </View>
  );
}

/** Число, плавно доезжающее до целевого значения (для дуги риска и полосок). */
export function useTween(target: number, duration = 900): number {
  const [value, setValue] = useState(reduceMotion ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduceMotion) { setValue(target); from.current = target; return; }
    const start = Date.now();
    const origin = from.current;
    let frame = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const next = origin + (target - origin) * eased;
      from.current = next;
      setValue(next);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

/** Уникальный id для градиентов SVG: на web экраны стека живут в одном документе. */
export function useSvgId(prefix: string): string {
  return prefix + useId().replace(/[^a-zA-Z0-9]/g, '');
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
