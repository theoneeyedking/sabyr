import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { HistoryItem } from '../api/types';
import { Body, Button, Card, ErrorNote, Loading, Screen } from '../components/ui';
import { formatDateTime } from '../i18n';
import { formatMoney } from '../lib/money';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, levelColor, radius, space } from '../theme';

/** История переводов. Незавершённый перевод, остановленный Sabyr, можно открыть снова. */
export function HistoryScreen({ navigation }: ScreenProps<'History'>) {
  const { api, t, describeError } = useApp();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.history());
    } catch (e) {
      setError(describeError(e));
    }
  }, [api, describeError]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const open = async (item: HistoryItem) => {
    setOpening(item.transfer_id);
    try {
      const state = await api.transfer(item.transfer_id);
      navigation.navigate(state.action === 'allow' ? 'Confirm' : 'Sabyr', { transfer: state });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setOpening(null);
    }
  };

  return (
    <Screen
      title={t('history.title')} onBack={() => navigation.goBack()} backLabel={t('common.back')}
      testID="screen-history"
    >
      <ErrorNote text={error} />
      {error ? <Button label={t('common.retry')} variant="secondary" onPress={() => void load()} /> : null}
      {items == null && !error ? <Loading label={t('common.loading')} /> : null}
      {items != null && items.length === 0 ? <Card><Body soft>{t('history.empty')}</Body></Card> : null}

      {items?.map((item) => {
        const out = item.direction === 'out';
        const done = item.status === 'confirmed';
        const unfinished = out && ['allowed', 'warned', 'cooldown'].includes(item.status);
        const tone = item.risk_level ? levelColor[item.risk_level] : null;
        return (
          <Pressable
            key={item.transfer_id} disabled={!unfinished || opening != null} onPress={() => void open(item)}
            testID="history-item" style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <View style={styles.head}>
              <Text style={styles.name} numberOfLines={2}>{item.counterparty.name}</Text>
              {/* Знак и цвет — только у состоявшихся переводов: отменённые деньги со счёта не уходили. */}
              <Text style={[styles.amount, done && !out && styles.amountIn, !done && styles.amountIdle]}>
                {done ? (out ? '−' : '+') : ''}{formatMoney(item.amount)}
              </Text>
            </View>
            <Text style={styles.meta}>
              {t(out ? 'history.out' : 'history.in')} · {formatDateTime(item.created_at)}
            </Text>
            <View style={styles.tags}>
              <View style={[styles.tag, item.status === 'confirmed' ? styles.tagOk : styles.tagNeutral]}>
                <Text style={[styles.tagText, item.status === 'confirmed' && styles.tagTextOk]}>
                  {t(`status.${item.status}`)}
                </Text>
              </View>
              {out && item.risk_score != null && tone ? (
                <View style={[styles.tag, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.tagText, { color: tone.fg }]}>{t('history.risk', { score: item.risk_score })}</Text>
                </View>
              ) : null}
              {unfinished ? <Text style={styles.open}>{t('history.open')} ›</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    backgroundColor: colors.surface, borderRadius: radius.card, padding: space.md, gap: 6,
    borderWidth: 1, borderColor: colors.line,
  },
  pressed: { opacity: 0.8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  name: { flex: 1, fontSize: font.body, lineHeight: 26, fontWeight: '700', color: colors.ink },
  amount: { fontSize: font.body + 1, lineHeight: 26, fontWeight: '800', color: colors.ink },
  amountIn: { color: colors.accent },
  amountIdle: { color: colors.inkSoft, fontWeight: '600' },
  meta: { fontSize: font.small, lineHeight: 22, color: colors.inkSoft },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: 2 },
  tag: { borderRadius: radius.chip, paddingHorizontal: 12, paddingVertical: 5 },
  tagOk: { backgroundColor: colors.accentSoft },
  tagNeutral: { backgroundColor: colors.disabledBg },
  tagText: { fontSize: font.small - 1, fontWeight: '700', color: colors.inkSoft },
  tagTextOk: { color: colors.accent },
  open: { fontSize: font.small + 1, fontWeight: '700', color: colors.primary, marginLeft: 'auto' },
});
