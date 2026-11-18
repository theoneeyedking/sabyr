import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TransferState } from '../api/types';
import { FinalState } from '../components/FinalState';
import { Icon } from '../components/Icon';
import { Reveal } from '../components/Motion';
import { Button, Caption, Card, Divider, ErrorNote, Row, Screen } from '../components/ui';
import { formatAccount, formatMoney } from '../lib/money';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, radius, space } from '../theme';

/** Обычное подтверждение перевода с низким риском (action = allow). */
export function ConfirmScreen({ navigation, route }: ScreenProps<'Confirm'>) {
  const { api, t, describeError } = useApp();
  const [transfer, setTransfer] = useState<TransferState>(route.params.transfer);
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const final = ['confirmed', 'cancelled', 'declined'].includes(transfer.status);

  const decide = async (decision: 'confirm' | 'cancel') => {
    setBusy(decision);
    setError(null);
    try {
      setTransfer(await api.confirm(transfer.transfer_id, decision));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const goHome = () => navigation.popToTop();

  if (final) {
    return (
      <Screen testID="screen-confirm" footer={<Button label={t('common.home')} onPress={goHome} testID="final-home" />}>
        <FinalState transfer={transfer} />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('confirm.title')} testID="screen-confirm"
      footer={
        <>
          <Button
            label={t('confirm.submit')} onPress={() => void decide('confirm')} loading={busy === 'confirm'}
            disabled={busy != null} testID="confirm-submit"
          />
          <Button
            label={t('confirm.cancel')} variant="secondary" onPress={() => void decide('cancel')}
            loading={busy === 'cancel'} disabled={busy != null} testID="confirm-cancel"
          />
        </>
      }
    >
      <Card index={0} style={styles.card}>
        <View style={styles.amountBox}>
          <Caption>{t('confirm.amount')}</Caption>
          <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>{formatMoney(transfer.amount)}</Text>
        </View>
        <Divider />
        <Row label={t('confirm.recipient')} value={transfer.recipient.name} />
        <Divider />
        <Row label={t('confirm.account')} value={formatAccount(transfer.recipient.account)} />
        <Divider />
        <Row label={t('confirm.bank')} value={transfer.recipient.bank} />
      </Card>
      <Reveal index={1} style={styles.safe}>
        <Icon name="shieldCheck" size={24} color={colors.accent} />
        <Text style={styles.safeText} testID="confirm-safe">{t('confirm.safe')}</Text>
      </Reveal>
      <ErrorNote text={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  amountBox: { gap: 2, paddingBottom: space.xs },
  amount: {
    fontFamily: fonts.extra, fontSize: font.huge, lineHeight: 50, letterSpacing: -1.4, color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  safe: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, backgroundColor: colors.accentSoft,
    borderRadius: radius.button, padding: space.md,
  },
  safeText: { flex: 1, fontFamily: fonts.medium, fontSize: font.small + 1, lineHeight: 24, color: '#0A5A4D' },
});
