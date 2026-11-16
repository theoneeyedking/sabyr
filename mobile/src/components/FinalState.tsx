import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TransferState } from '../api/types';
import { formatMoney } from '../lib/money';
import { firstName } from '../lib/risk';
import { useApp } from '../state/AppContext';
import { colors, font, radius, space } from '../theme';
import { Body, Card, Heading, Title } from './ui';

/** Итог перевода: выполнен, отменён клиентом или отклонён доверенным лицом. */
export function FinalState({ transfer }: { transfer: TransferState }) {
  const { t } = useApp();
  const status = transfer.status;
  const trustedName = firstName(transfer.trusted_request?.trusted_name);

  let title: string;
  let text: string;
  if (status === 'confirmed') {
    title = t('final.confirmedTitle');
    text = t('final.confirmedText', { amount: formatMoney(transfer.amount), name: transfer.recipient.name });
  } else if (status === 'declined') {
    title = t('final.declinedTitle');
    text = trustedName ? t('final.declinedText', { name: trustedName }) : t('final.declinedTextNoName');
  } else {
    title = t('final.cancelledTitle');
    text = t('final.cancelledText');
  }
  const good = status === 'confirmed';
  const protectedMoney = status === 'declined' || status === 'cancelled';
  const showAdvice = protectedMoney && transfer.risk.level !== 'low';

  return (
    <View style={styles.wrap} testID={`final-${status}`}>
      <View style={[styles.icon, { backgroundColor: good ? colors.accentSoft : colors.primarySoft }]}>
        {good ? (
          <Text style={[styles.iconText, { color: colors.accent }]}>✓</Text>
        ) : (
          <View style={styles.pause}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </View>
        )}
      </View>
      <Title style={styles.center}>{title}</Title>
      <Body style={styles.center} testID="final-text">{text}</Body>
      {protectedMoney ? (
        <View style={styles.amountBox}>
          <Text style={styles.amount}>{formatMoney(transfer.amount)}</Text>
        </View>
      ) : null}
      {showAdvice ? (
        <Card style={styles.advice}>
          <Heading>{t('final.adviceTitle')}</Heading>
          <Body>{t('final.advice')}</Body>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.md, paddingTop: space.lg },
  icon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 44, fontWeight: '800' },
  pause: { flexDirection: 'row', gap: 10 },
  pauseBar: { width: 11, height: 36, borderRadius: 5, backgroundColor: colors.primary },
  center: { textAlign: 'center' },
  amountBox: {
    backgroundColor: colors.accentSoft, borderRadius: radius.button, paddingHorizontal: space.lg, paddingVertical: space.sm,
  },
  amount: { fontSize: font.title, fontWeight: '800', color: colors.accent },
  advice: { alignSelf: 'stretch', marginTop: space.sm },
});
