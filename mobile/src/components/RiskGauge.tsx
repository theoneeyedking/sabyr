import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { RiskLevel } from '../api/types';
import { useApp } from '../state/AppContext';
import { colors, font, levelColor, radius, space } from '../theme';

/** Спокойная шкала риска 0–100 с тремя зонами и двумя составляющими (отправитель / получатель). */
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
  const pos = Math.min(99, Math.max(1, score)); // маркер не выходит за края шкалы
  return (
    <View style={styles.wrap} testID="risk-gauge">
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={styles.caption}>{t('sabyr.risk')}</Text>
          <View style={[styles.levelPill, { backgroundColor: tone.bg }]}>
            <Text style={[styles.levelText, { color: tone.fg }]} testID="risk-level">{t(`level.${level}`)}</Text>
          </View>
        </View>
        <View style={styles.scoreBox}>
          <Text style={[styles.score, { color: tone.fg }]} testID="risk-score">{score}</Text>
          <Text style={styles.outOf}>{t('sabyr.riskOf')}</Text>
        </View>
      </View>

      <View style={styles.track}>
        <View style={[styles.zone, { flex: 40, backgroundColor: '#BFE0DA' }]} />
        <View style={[styles.zone, { flex: 30, backgroundColor: '#F1D9A2' }]} />
        <View style={[styles.zone, { flex: 30, backgroundColor: '#E9BFA3' }]} />
        <View style={[styles.marker, { left: `${pos}%`, backgroundColor: tone.fg }]} />
      </View>
      <View style={styles.scale}>
        <Text style={styles.tick}>0</Text>
        <Text style={[styles.tick, styles.tick40]}>40</Text>
        <Text style={[styles.tick, styles.tick70]}>70</Text>
        <Text style={styles.tick}>100</Text>
      </View>

      <SubScore label={t('sabyr.senderScore')} value={senderScore} testID="risk-sender" />
      <SubScore label={t('sabyr.recipientScore')} value={recipientScore} testID="risk-recipient" />
    </View>
  );
}

function SubScore({ label, value, testID }: { label: string; value: number | null; testID: string }) {
  if (value == null) return null;
  const v = Math.min(100, Math.max(0, value));
  return (
    <View style={styles.sub}>
      <View style={styles.subHead}>
        <Text style={styles.subLabel}>{label}</Text>
        <Text style={styles.subValue} testID={testID}>{value}</Text>
      </View>
      <View style={styles.subTrack}>
        <View style={[styles.subFill, { width: `${v}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  caption: { fontSize: font.small, color: colors.inkSoft, marginBottom: 6 },
  levelPill: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.chip },
  levelText: { fontSize: font.lead, fontWeight: '800' },
  scoreBox: { alignItems: 'flex-end' },
  score: { fontSize: 56, lineHeight: 60, fontWeight: '800' },
  outOf: { fontSize: font.small, color: colors.inkSoft },
  track: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'visible', marginTop: space.sm },
  zone: { height: 16 },
  marker: {
    position: 'absolute', top: -6, width: 8, height: 28, borderRadius: 4, marginLeft: -4,
    borderWidth: 2, borderColor: colors.surface,
  },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xs },
  tick: { fontSize: 14, color: colors.inkSoft },
  tick40: { position: 'absolute', left: '40%', marginLeft: -8 },
  tick70: { position: 'absolute', left: '70%', marginLeft: -8 },
  sub: { gap: 6 },
  subHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
  subLabel: { flex: 1, fontSize: font.small + 1, color: colors.ink },
  subValue: { fontSize: font.body, fontWeight: '700', color: colors.ink },
  subTrack: { height: 8, borderRadius: 4, backgroundColor: colors.disabledBg, overflow: 'hidden' },
  subFill: { height: 8, borderRadius: 4, backgroundColor: colors.inkSoft },
});
