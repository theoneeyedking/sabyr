import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { HistoryItem } from '../api/types';
import { Icon } from '../components/Icon';
import { PressableScale, Reveal } from '../components/Motion';
import { Body, Button, Card, ErrorNote, IconBadge, Loading, Pill, Screen } from '../components/ui';
import { formatDateTime } from '../i18n';
import { formatMoney } from '../lib/money';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, levelColor, radius, shadow, space } from '../theme';

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

      {items?.map((item, index) => {
        const out = item.direction === 'out';
        const done = item.status === 'confirmed';
        const unfinished = out && ['allowed', 'warned', 'cooldown'].includes(item.status);
        const tone = item.risk_level ? levelColor[item.risk_level] : null;
        return (
          <Reveal key={item.transfer_id} index={index}>
            <PressableScale
              disabled={!unfinished || opening != null} onPress={() => void open(item)}
              testID="history-item" style={styles.item} scaleTo={0.98}
            >
              <View style={styles.head}>
                {done ? (
                  <IconBadge
                    name={out ? 'arrowUpRight' : 'arrowDownLeft'} size={48}
                    bg={out ? colors.primarySoft : colors.accentSoft} color={out ? colors.primary : colors.accent}
                  />
                ) : (
                  <IconBadge name={unfinished ? 'pause' : 'close'} size={48} bg={colors.disabledBg} color={colors.inkSoft} />
                )}
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={2}>{item.counterparty.name}</Text>
                  <Text style={styles.meta}>
                    {t(out ? 'history.out' : 'history.in')} · {formatDateTime(item.created_at)}
                  </Text>
                </View>
                {/* Знак и цвет — только у состоявшихся переводов: отменённые деньги со счёта не уходили. */}
                <Text style={[styles.amount, done && !out && styles.amountIn, !done && styles.amountIdle]}>
                  {done ? (out ? '−' : '+') : ''}{formatMoney(item.amount)}
                </Text>
              </View>
              <View style={styles.tags}>
                <Pill
                  label={t(`status.${item.status}`)}
                  fg={done ? colors.accent : colors.inkSoft} bg={done ? colors.accentSoft : colors.disabledBg}
                />
                {out && item.risk_score != null && tone ? (
                  <Pill label={t('history.risk', { score: item.risk_score })} fg={tone.fg} bg={tone.bg} dot />
                ) : null}
                {unfinished ? (
                  <View style={styles.open}>
                    <Text style={styles.openText}>{t('history.open')}</Text>
                    <Icon name="chevronRight" size={18} color={colors.primary} stroke={2.4} />
                  </View>
                ) : null}
              </View>
            </PressableScale>
          </Reveal>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: {
    backgroundColor: colors.surface, borderRadius: radius.card, padding: space.md + 2, gap: space.sm + 2, ...shadow.card,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  name: { fontFamily: fonts.semibold, fontSize: font.body, lineHeight: 24, letterSpacing: -0.2, color: colors.ink },
  amount: { fontFamily: fonts.bold, fontSize: font.body, lineHeight: 26, color: colors.ink },
  amountIn: { color: colors.accent },
  amountIdle: { fontFamily: fonts.medium, color: colors.inkFaint },
  meta: { fontFamily: fonts.regular, fontSize: font.caption + 1, lineHeight: 21, color: colors.inkSoft },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  open: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  openText: { fontFamily: fonts.semibold, fontSize: font.small, color: colors.primary },
});
