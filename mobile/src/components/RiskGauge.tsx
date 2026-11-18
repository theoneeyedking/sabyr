import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import type { RiskLevel } from '../api/types';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, levelColor, space } from '../theme';
import { useSvgId, useTween } from './Motion';
import { Pill } from './ui';

// Геометрия полукруглой шкалы (в координатах viewBox).
const W = 300;
const H = 172;
const CX = 150;
const CY = 152;
const R = 122;
const STROKE = 18;
const LENGTH = Math.PI * R;

/** Точка на дуге для значения 0–100 (0 — слева, 100 — справа). */
function point(value: number, r = R): { x: number; y: number } {
  const a = Math.PI * (1 + value / 100);
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

const ARC = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

/** Шкала риска 0–100: дуга плавно заполняется до оценки, пороги 40 и 70 отмечены засечками. */
export function RiskGauge({
  score, level, senderScore, recipientScore,
}: {
  score: number;
  level: RiskLevel;
  senderScore: number | null;
  recipientScore: number | null;
}) {
  const { t } = useApp();
  const tone = levelColor[level];
  const id = useSvgId('risk');
  const shown = useTween(Math.min(100, Math.max(0, score)), 1100);
  const knob = point(shown);
  return (
    <View style={styles.wrap} testID="risk-gauge">
      <View style={styles.top}>
        <Text style={styles.caption}>{t('sabyr.risk')}</Text>
        <Pill label={t(`level.${level}`)} fg={tone.fg} bg={tone.bg} dot testID="risk-level" />
      </View>

      <View style={styles.gauge}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={CX - R} y1="0" x2={CX + R} y2="0">
              <Stop offset="0" stopColor={colors.lowVivid} />
              <Stop offset="0.5" stopColor={colors.mediumVivid} />
              <Stop offset="1" stopColor={colors.highVivid} />
            </LinearGradient>
          </Defs>
          <Path d={ARC} stroke="rgba(15,27,42,0.07)" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
          {shown > 0.5 ? (
            <Path
              d={ARC} stroke={`url(#${id})`} strokeWidth={STROKE} strokeLinecap="round" fill="none"
              strokeDasharray={`${(LENGTH * shown) / 100} ${LENGTH}`}
            />
          ) : null}
          {[40, 70].map((mark) => {
            const a = point(mark, R + 15);
            const b = point(mark, R + 21);
            const label = point(mark, R + 33);
            return (
              <React.Fragment key={mark}>
                <Path d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke={colors.inkFaint} strokeWidth={2} strokeLinecap="round" />
                <SvgText
                  x={label.x} y={label.y + 4} fontSize="12" fontFamily={fonts.medium} fill={colors.inkFaint}
                  textAnchor="middle"
                >
                  {mark}
                </SvgText>
              </React.Fragment>
            );
          })}
          <Circle cx={knob.x} cy={knob.y} r={13} fill="rgba(15,27,42,0.12)" />
          <Circle cx={knob.x} cy={knob.y} r={11} fill={colors.surface} />
          <Circle cx={knob.x} cy={knob.y} r={6} fill={tone.vivid} />
        </Svg>
        <View style={styles.center}>
          <Text style={[styles.score, { color: tone.fg }]} testID="risk-score">{score}</Text>
          <Text style={styles.outOf}>{t('sabyr.riskOf')}</Text>
        </View>
      </View>

      <View style={styles.subs}>
        <SubScore label={t('sabyr.senderScore')} value={senderScore} testID="risk-sender" />
        <SubScore label={t('sabyr.recipientScore')} value={recipientScore} testID="risk-recipient" />
      </View>
    </View>
  );
}

function SubScore({ label, value, testID }: { label: string; value: number | null; testID: string }) {
  const width = useTween(value == null ? 0 : Math.min(100, Math.max(0, value)), 1100);
  if (value == null) return null;
  const tone = value > 70 ? levelColor.high : value >= 40 ? levelColor.medium : levelColor.low;
  return (
    <View style={styles.sub}>
      <View style={styles.subHead}>
        <Text style={styles.subLabel}>{label}</Text>
        <Text style={styles.subValue} testID={testID}>{value}</Text>
      </View>
      <View style={styles.subTrack}>
        <View style={[styles.subFill, { width: `${width}%`, backgroundColor: tone.vivid }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  caption: { fontFamily: fonts.medium, fontSize: font.small, color: colors.inkSoft },
  gauge: { width: '100%', maxWidth: 360, alignSelf: 'center', aspectRatio: W / H, marginTop: space.xs },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'flex-end' },
  score: {
    fontFamily: fonts.extra, fontSize: 68, lineHeight: 70, letterSpacing: -2.5, fontVariant: ['tabular-nums'],
  },
  outOf: { fontFamily: fonts.medium, fontSize: font.caption + 1, color: colors.inkSoft, marginBottom: 2 },
  subs: { gap: space.md, marginTop: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line },
  sub: { gap: 8 },
  subHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
  subLabel: { flex: 1, fontFamily: fonts.regular, fontSize: font.small + 1, color: colors.ink },
  subValue: { fontFamily: fonts.bold, fontSize: font.body, color: colors.ink, fontVariant: ['tabular-nums'] },
  subTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(15,27,42,0.07)', overflow: 'hidden' },
  subFill: { height: 8, borderRadius: 4 },
});
