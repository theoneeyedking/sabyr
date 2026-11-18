import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TransferState } from '../api/types';
import { formatMoney } from '../lib/money';
import { firstName } from '../lib/risk';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, radius, space } from '../theme';
import { Icon } from './Icon';
import { Breathing, Reveal } from './Motion';
import { Body, Button, Caption, Card, ErrorNote, Heading, Title } from './ui';

/** Итог перевода: выполнен, отменён клиентом или отклонён доверенным лицом. */
export function FinalState({ transfer, onReport }: {
  transfer: TransferState;
  /** Сообщить о мошенничестве по отменённому переводу; если не задано, блок не показывается. */
  onReport?: () => Promise<void>;
}) {
  const { t } = useApp();
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
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
  const tint = good ? colors.accent : colors.primary;
  const reported = !!transfer.fraud_reported;
  // отклонённый доверенным лицом перевод уже отмечен; для отменённого клиент решает сам
  const canReport = status === 'cancelled' && transfer.risk.level !== 'low' && !reported && !!onReport;

  const report = async () => {
    if (!onReport) return;
    setReporting(true);
    setReportError(null);
    try {
      await onReport();
    } catch {
      setReportError(t('error.network'));
    } finally {
      setReporting(false);
    }
  };

  return (
    <View style={styles.wrap} testID={`final-${status}`}>
      <Reveal>
        <View style={styles.halo}>
          <Breathing color={good ? colors.accentGlow : '#9DB6D2'} size={104} />
          <View style={[styles.icon, { backgroundColor: tint }]}>
            <Icon name={good ? 'check' : 'shieldCheck'} size={50} color={colors.onPrimary} stroke={2.4} />
          </View>
        </View>
      </Reveal>
      <Reveal index={1} style={styles.texts}>
        <Title style={styles.center}>{title}</Title>
        <Body soft style={styles.center} testID="final-text">{text}</Body>
      </Reveal>
      {protectedMoney ? (
        <Reveal index={2} style={styles.amountBox}>
          <Icon name="lock" size={22} color={colors.accent} stroke={2.2} />
          <Text style={styles.amount}>{formatMoney(transfer.amount)}</Text>
        </Reveal>
      ) : null}
      {canReport ? (
        <Reveal index={3} style={styles.advice}>
          <Card>
            <Heading style={styles.adviceText}>{t('final.reportTitle')}</Heading>
            <Body soft>{t('final.reportText')}</Body>
            <ErrorNote text={reportError} />
            <Button
              label={t('final.reportButton')} variant="secondary" onPress={() => void report()}
              loading={reporting} testID="final-report"
            />
          </Card>
        </Reveal>
      ) : null}
      {reported && status === 'cancelled' ? (
        <Reveal index={3} style={styles.advice}>
          <Card>
            <View style={styles.reportedRow} testID="final-reported">
              <Icon name="shieldCheck" size={26} color={colors.accent} stroke={2.2} />
              <Heading style={[styles.adviceText, styles.flex]}>{t('final.reportedTitle')}</Heading>
            </View>
            <Body soft>{t('final.reportedText')}</Body>
          </Card>
        </Reveal>
      ) : null}
      {showAdvice ? (
        <Reveal index={3} style={styles.advice}>
          <Card>
            <Caption>{t('final.adviceTitle')}</Caption>
            <Heading style={styles.adviceText}>{t('final.advice')}</Heading>
          </Card>
        </Reveal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.lg, paddingTop: space.xl + 8 },
  halo: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center' },
  icon: {
    width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 14px 34px rgba(15,39,66,0.28)',
  },
  texts: { gap: space.sm, alignItems: 'center', paddingHorizontal: space.sm },
  center: { textAlign: 'center' },
  amountBox: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.accentSoft, borderRadius: radius.chip, paddingHorizontal: space.lg, paddingVertical: 12,
  },
  amount: {
    fontFamily: fonts.extra, fontSize: font.title - 2, letterSpacing: -0.6, color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  advice: { alignSelf: 'stretch', width: '100%' },
  reportedRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  adviceText: { fontFamily: fonts.semibold, fontSize: font.body, lineHeight: 27, letterSpacing: 0 },
});
