import React, { useState } from 'react';

import type { TransferState } from '../api/types';
import { FinalState } from '../components/FinalState';
import { Body, Button, Card, ErrorNote, Row, Screen } from '../components/ui';
import { formatAccount, formatMoney } from '../lib/money';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';

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
      <Card>
        <Row label={t('confirm.amount')} value={formatMoney(transfer.amount)} strong />
        <Row label={t('confirm.recipient')} value={transfer.recipient.name} />
        <Row label={t('confirm.account')} value={formatAccount(transfer.recipient.account)} />
        <Row label={t('confirm.bank')} value={transfer.recipient.bank} />
      </Card>
      <Body soft testID="confirm-safe">{t('confirm.safe')}</Body>
      <ErrorNote text={error} />
    </Screen>
  );
}
