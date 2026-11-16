import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AssistantResponse, TransferState } from '../api/types';
import { AssistantChat } from '../components/AssistantChat';
import { FinalState } from '../components/FinalState';
import { RiskGauge } from '../components/RiskGauge';
import { Body, Button, Card, ErrorNote, Heading, Screen, Title } from '../components/ui';
import type { I18nKey } from '../i18n';
import { cooldownDeadline, formatCountdown, secondsUntil } from '../lib/countdown';
import { flaggingBanks } from '../lib/ledger';
import { formatAccount, formatMoney } from '../lib/money';
import { firstName } from '../lib/risk';
import { usePolling } from '../lib/usePolling';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, levelColor, radius, space } from '../theme';

const FINAL = ['confirmed', 'cancelled', 'declined'];

/**
 * Экран Sabyr: спокойная пауза перед рискованным переводом.
 * Показывает риск, причины, схему обмана, диалог с помощником, таймер паузы и статус доверенного лица.
 */
export function SabyrScreen({ navigation, route }: ScreenProps<'Sabyr'>) {
  const { api, client, t, describeError } = useApp();
  const [transfer, setTransfer] = useState<TransferState>(route.params.transfer);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<'confirm' | 'cancel' | 'ask' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ledger = route.params.transfer.ledger; // реестр приходит только в ответе /check
  const final = FINAL.includes(transfer.status);
  const high = transfer.risk.level === 'high';
  const tone = levelColor[transfer.risk.level];

  const accept = useCallback((next: TransferState) => {
    setTransfer(next);
    setReceivedAt(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    try {
      accept(await api.transfer(transfer.transfer_id));
    } catch (e) {
      describeError(e); // 401 → выход; остальное повторим при следующем опросе
    }
  }, [accept, api, describeError, transfer.transfer_id]);

  // Опрос состояния раз в 3 секунды: так приходит решение доверенного лица.
  usePolling(refresh, 3000, !final, false);

  // Таймер паузы тикает локально; когда доходит до нуля — сразу уточняем состояние у сервера.
  const deadline = cooldownDeadline(transfer.cooldown_seconds_left, transfer.cooldown_until, receivedAt);
  const left = secondsUntil(deadline, now);
  useEffect(() => {
    if (final || deadline == null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [final, deadline]);
  const wasCounting = useRef(false);
  useEffect(() => {
    if (left > 0) wasCounting.current = true;
    else if (wasCounting.current) {
      wasCounting.current = false;
      void refresh();
    }
  }, [left, refresh]);

  const onAssistant = useCallback((res: AssistantResponse) => {
    setTransfer((prev) => (FINAL.includes(prev.status) ? prev : { ...prev, can_confirm: res.can_confirm, assistant_turns: res.turn }));
    void refresh();
  }, [refresh]);

  const decide = async (decision: 'confirm' | 'cancel') => {
    setBusy(decision);
    setError(null);
    try {
      accept(await api.confirm(transfer.transfer_id, decision));
    } catch (e) {
      setError(describeError(e));
      void refresh();
    } finally {
      setBusy(null);
    }
  };

  const askTrusted = async () => {
    setBusy('ask');
    setError(null);
    try {
      await api.askTrusted(transfer.transfer_id);
      await refresh();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  if (final) {
    return (
      <Screen
        testID="screen-sabyr"
        footer={<Button label={t('common.home')} onPress={() => navigation.popToTop()} testID="final-home" />}
      >
        <FinalState transfer={transfer} />
      </Screen>
    );
  }

  const req = transfer.trusted_request;
  const trustedName = firstName(req?.trusted_name);
  const blocker = transfer.blockers[0]?.code;
  const blockerKey = blocker ? (`sabyr.blocker.${blocker}` as I18nKey) : null;
  const banks = flaggingBanks(ledger);
  const scheme = transfer.risk.scheme;

  return (
    <Screen
      title={t('sabyr.title')} onBack={() => navigation.popToTop()} backLabel={t('common.home')}
      testID="screen-sabyr"
      footer={
        <>
          <Button
            label={t('sabyr.cancel')} onPress={() => void decide('cancel')} loading={busy === 'cancel'}
            disabled={busy != null} testID="sabyr-cancel"
          />
          <Button
            label={t('sabyr.confirm')} variant="secondary" onPress={() => void decide('confirm')}
            loading={busy === 'confirm'} disabled={!transfer.can_confirm || busy != null} testID="sabyr-confirm"
          />
        </>
      }
    >
      <View style={[styles.hero, { backgroundColor: tone.bg }]}>
        <View style={styles.heroHead}>
          <View style={[styles.pauseIcon, { backgroundColor: tone.fg }]}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </View>
          <Title style={styles.flex}>{t(high ? 'sabyr.headlineHigh' : 'sabyr.headlineMedium')}</Title>
        </View>
        <Body>{t(high ? 'sabyr.introHigh' : 'sabyr.introMedium')}</Body>
      </View>

      <Card>
        <Text style={styles.caption}>{t('sabyr.transferTo')}</Text>
        <Text style={styles.amount} testID="sabyr-amount">{formatMoney(transfer.amount)}</Text>
        <Body style={styles.strong}>{transfer.recipient.name} · {transfer.recipient.bank}</Body>
        <Body soft style={styles.account}>{formatAccount(transfer.recipient.account)}</Body>
      </Card>

      {ledger?.flagged ? (
        <View style={styles.ledger} testID="ledger-banner">
          <Text style={styles.ledgerTitle}>{t('sabyr.ledgerFlagged')}</Text>
          {banks.length ? <Text style={styles.ledgerText}>{t('sabyr.ledgerFlaggedBy', { bank: banks.join(', ') })}</Text> : null}
          {ledger.status === 'unavailable' ? <Text style={styles.ledgerNote}>{t('sabyr.ledgerUnavailable')}</Text> : null}
        </View>
      ) : null}

      <Card>
        <RiskGauge
          score={transfer.risk.score} level={transfer.risk.level}
          senderScore={transfer.risk.sender_score} recipientScore={transfer.risk.recipient_score}
        />
      </Card>

      {transfer.cooldown_until ? (
        <Card style={styles.cooldown} testID="cooldown">
          <Heading>{t('sabyr.cooldown')}</Heading>
          {left > 0 ? (
            <>
              <Text style={styles.timer} testID="cooldown-timer">{formatCountdown(left)}</Text>
              <Body soft>{t('sabyr.cooldownHint')}</Body>
            </>
          ) : (
            <Body style={styles.strong} testID="cooldown-done">{t('sabyr.cooldownDone')}</Body>
          )}
        </Card>
      ) : null}

      {req ? (
        <Card testID="trusted-status">
          <Heading>{t('sabyr.trusted')}</Heading>
          <View style={styles.trustedRow}>
            <View style={[styles.dot, req.status === 'pending' ? styles.dotPending : styles.dotDone]} />
            <Body style={styles.flex} testID={`trusted-${req.status}`}>
              {t(req.status === 'pending' ? 'sabyr.trustedPending'
                : req.status === 'approved' ? 'sabyr.trustedApproved' : 'sabyr.trustedDeclined', { name: trustedName })}
            </Body>
          </View>
        </Card>
      ) : client?.trusted_contact ? (
        <Button
          label={t('sabyr.trustedAsk', { name: firstName(client.trusted_contact.name) })} variant="secondary"
          onPress={() => void askTrusted()} loading={busy === 'ask'} disabled={busy != null} testID="trusted-ask"
        />
      ) : null}

      <Card testID="reasons">
        <Heading>{t('sabyr.reasons')}</Heading>
        {transfer.risk.reasons.map((r, i) => (
          <View key={r.code + i} style={styles.reason}>
            <View style={[styles.reasonNum, { backgroundColor: tone.bg }]}>
              <Text style={[styles.reasonNumText, { color: tone.fg }]}>{i + 1}</Text>
            </View>
            <Body style={styles.flex} testID="reason">{r.text}</Body>
          </View>
        ))}
      </Card>

      {scheme ? (
        <Card testID="scheme">
          <Text style={styles.caption}>{t('sabyr.scheme')}</Text>
          <Heading>{scheme.title}</Heading>
          <Text style={styles.caption}>{t('sabyr.schemeHow')}</Text>
          <Body>{scheme.how}</Body>
        </Card>
      ) : null}

      <Card>
        <AssistantChat transferId={transfer.transfer_id} active={!final} onUpdate={onAssistant} />
      </Card>

      <ErrorNote text={error} />
      {!transfer.can_confirm && blockerKey ? (
        <Body soft style={styles.blocker} testID="blocker">{t(blockerKey)}</Body>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { borderRadius: radius.card, padding: space.md, gap: space.sm },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pauseIcon: {
    width: 48, height: 48, borderRadius: 24, flexDirection: 'row', gap: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  pauseBar: { width: 7, height: 22, borderRadius: 3, backgroundColor: colors.onPrimary },
  caption: { fontSize: font.small, lineHeight: 22, color: colors.inkSoft },
  amount: { fontSize: font.huge - 4, lineHeight: 44, fontWeight: '800', color: colors.ink },
  strong: { fontWeight: '700' },
  account: { fontSize: font.small + 1 },
  ledger: {
    backgroundColor: colors.primary, borderRadius: radius.card, padding: space.md, gap: 4,
  },
  ledgerTitle: { fontSize: font.lead - 1, lineHeight: 28, fontWeight: '800', color: colors.onPrimary },
  ledgerText: { fontSize: font.body - 1, lineHeight: 25, color: '#E3ECF5' },
  ledgerNote: { fontSize: font.small, lineHeight: 22, color: '#C9D8E8' },
  cooldown: { alignItems: 'center' },
  timer: {
    fontSize: 60, lineHeight: 68, fontWeight: '800', color: colors.primary,
    fontVariant: ['tabular-nums'], letterSpacing: 1,
  },
  trustedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  dot: { width: 14, height: 14, borderRadius: 7, marginTop: 7 },
  dotPending: { backgroundColor: colors.medium },
  dotDone: { backgroundColor: colors.accent },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  reasonNum: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  reasonNumText: { fontSize: font.body - 1, fontWeight: '800' },
  blocker: { textAlign: 'center', fontSize: font.small + 1 },
});
