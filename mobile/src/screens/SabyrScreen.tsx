import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { AssistantResponse, TransferState } from '../api/types';
import { AssistantChat } from '../components/AssistantChat';
import { FinalState } from '../components/FinalState';
import { Icon } from '../components/Icon';
import { Breathing, Reveal } from '../components/Motion';
import { RiskGauge } from '../components/RiskGauge';
import { Body, Button, Caption, Card, ErrorNote, Heading, Screen, Title } from '../components/ui';
import type { I18nKey } from '../i18n';
import { cooldownDeadline, formatCountdown, secondsUntil } from '../lib/countdown';
import { flaggingBanks } from '../lib/ledger';
import { formatAccount, formatMoney } from '../lib/money';
import { firstName } from '../lib/risk';
import { usePolling } from '../lib/usePolling';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, levelColor, radius, shadow, space } from '../theme';

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
      testID="screen-sabyr" glow={tone.vivid} glowStrength={0.3}
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
      <Reveal style={styles.hero}>
        <View style={styles.pauseWrap}>
          <Breathing color={tone.vivid} size={64} />
          <View style={[styles.pauseIcon, { backgroundColor: tone.fg }]}>
            <Icon name="pause" size={30} color={colors.onPrimary} stroke={2.6} />
          </View>
        </View>
        <Title style={styles.headline}>{t(high ? 'sabyr.headlineHigh' : 'sabyr.headlineMedium')}</Title>
        <Body soft style={styles.intro}>{t(high ? 'sabyr.introHigh' : 'sabyr.introMedium')}</Body>
      </Reveal>

      <Card index={1}>
        <Caption>{t('sabyr.transferTo')}</Caption>
        <Text style={styles.amount} testID="sabyr-amount" adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(transfer.amount)}
        </Text>
        <View style={styles.recipient}>
          <View style={styles.recipientAvatar}>
            <Text style={styles.recipientLetter}>{transfer.recipient.name.slice(0, 1)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.recipientName}>{transfer.recipient.name} · {transfer.recipient.bank}</Text>
            <Text style={styles.account}>{formatAccount(transfer.recipient.account)}</Text>
          </View>
        </View>
      </Card>

      {ledger?.flagged ? (
        <Reveal index={2}>
          <View style={styles.ledger} testID="ledger-banner">
            <View style={styles.ledgerIcon}>
              <Icon name="link" size={24} color={colors.onPrimary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.ledgerTitle}>{t('sabyr.ledgerFlagged')}</Text>
              {banks.length ? <Text style={styles.ledgerText}>{t('sabyr.ledgerFlaggedBy', { bank: banks.join(', ') })}</Text> : null}
              {ledger.status === 'unavailable' ? <Text style={styles.ledgerNote}>{t('sabyr.ledgerUnavailable')}</Text> : null}
            </View>
          </View>
        </Reveal>
      ) : null}

      <Card index={3}>
        <RiskGauge
          score={transfer.risk.score} level={transfer.risk.level}
          senderScore={transfer.risk.sender_score} recipientScore={transfer.risk.recipient_score}
        />
      </Card>

      {transfer.cooldown_until ? (
        <Card style={styles.cooldown} testID="cooldown" index={4}>
          <Heading style={styles.center}>{t('sabyr.cooldown')}</Heading>
          {left > 0 ? (
            <>
              <CooldownRing left={left}>
                <Text style={styles.timer} testID="cooldown-timer">{formatCountdown(left)}</Text>
              </CooldownRing>
              <Body soft style={styles.center}>{t('sabyr.cooldownHint')}</Body>
            </>
          ) : (
            <View style={styles.cooldownDone}>
              <Icon name="check" size={22} color={colors.accent} stroke={2.4} />
              <Text style={styles.cooldownDoneText} testID="cooldown-done">{t('sabyr.cooldownDone')}</Text>
            </View>
          )}
        </Card>
      ) : null}

      {req ? (
        <Card testID="trusted-status" index={5}>
          <Caption>{t('sabyr.trusted')}</Caption>
          <View style={styles.trustedRow}>
            <View style={[styles.trustedIcon, req.status === 'pending' ? styles.trustedPending : styles.trustedDone]}>
              <Icon
                name={req.status === 'pending' ? 'clock' : req.status === 'approved' ? 'check' : 'shieldCheck'}
                size={24} color={req.status === 'pending' ? colors.medium : colors.accent}
              />
            </View>
            <Text style={styles.trustedText} testID={`trusted-${req.status}`}>
              {t(req.status === 'pending' ? 'sabyr.trustedPending'
                : req.status === 'approved' ? 'sabyr.trustedApproved' : 'sabyr.trustedDeclined', { name: trustedName })}
            </Text>
          </View>
        </Card>
      ) : client?.trusted_contact ? (
        <Button
          label={t('sabyr.trustedAsk', { name: firstName(client.trusted_contact.name) })} variant="secondary"
          onPress={() => void askTrusted()} loading={busy === 'ask'} disabled={busy != null} testID="trusted-ask"
        />
      ) : null}

      <Card testID="reasons" index={6}>
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
        <Card testID="scheme" index={7} style={styles.scheme}>
          <Caption>{t('sabyr.scheme')}</Caption>
          <Heading>{scheme.title}</Heading>
          <View style={[styles.schemeHow, { borderLeftColor: tone.vivid }]}>
            <Caption>{t('sabyr.schemeHow')}</Caption>
            <Body>{scheme.how}</Body>
          </View>
        </Card>
      ) : null}

      <Card index={7}>
        <AssistantChat transferId={transfer.transfer_id} active={!final} onUpdate={onAssistant} />
      </Card>

      <ErrorNote text={error} />
      {!transfer.can_confirm && blockerKey ? (
        <View style={styles.blocker}>
          <Icon name="lock" size={18} color={colors.inkSoft} />
          <Text style={styles.blockerText} testID="blocker">{t(blockerKey)}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const RING = 184;
const RING_R = 82;
const RING_LEN = 2 * Math.PI * RING_R;

/** Кольцо паузы: убывает вместе с таймером. За полную длину берётся первое увиденное значение. */
function CooldownRing({ left, children }: { left: number; children: React.ReactNode }) {
  const total = useRef(left);
  if (left > total.current) total.current = left;
  const part = total.current > 0 ? Math.min(1, left / total.current) : 0;
  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
        <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="rgba(15,27,42,0.07)" strokeWidth={10} fill="none" />
        <Circle
          cx={RING / 2} cy={RING / 2} r={RING_R} stroke={colors.primary} strokeWidth={10} fill="none"
          strokeLinecap="round" strokeDasharray={`${RING_LEN * part} ${RING_LEN}`}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  hero: { gap: space.sm, paddingTop: space.xs, paddingBottom: space.sm },
  pauseWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm, marginLeft: 6 },
  pauseIcon: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 10px 24px rgba(15,39,66,0.22)',
  },
  headline: { fontSize: 34, lineHeight: 39, letterSpacing: -1.3 },
  intro: { fontSize: font.body + 1, lineHeight: 28 },
  amount: {
    fontFamily: fonts.extra, fontSize: font.huge, lineHeight: 50, letterSpacing: -1.4, color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  recipient: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, marginTop: space.xs,
    padding: space.sm + 2, borderRadius: radius.inner + 2, backgroundColor: colors.surfaceSoft,
  },
  recipientAvatar: {
    width: 46, height: 46, borderRadius: 16, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  recipientLetter: { fontFamily: fonts.bold, fontSize: font.lead, color: colors.primary },
  recipientName: { fontFamily: fonts.semibold, fontSize: font.body, lineHeight: 25, color: colors.ink },
  account: { fontFamily: fonts.regular, fontSize: font.small - 1, lineHeight: 21, letterSpacing: 0.3, color: colors.inkSoft },
  ledger: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.md,
    backgroundColor: colors.primary, borderRadius: radius.card, padding: space.md + 4, ...shadow.raised,
  },
  ledgerIcon: {
    width: 48, height: 48, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  ledgerTitle: { fontFamily: fonts.bold, fontSize: font.body + 1, lineHeight: 26, letterSpacing: -0.2, color: colors.onPrimary },
  ledgerText: { fontFamily: fonts.regular, fontSize: font.small + 1, lineHeight: 24, color: colors.onPrimarySoft, marginTop: 2 },
  ledgerNote: { fontFamily: fonts.regular, fontSize: font.small - 1, lineHeight: 21, color: colors.onPrimarySoft, marginTop: 4 },
  cooldown: { alignItems: 'center', gap: space.md },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  timer: {
    fontFamily: fonts.extra, fontSize: 44, lineHeight: 52, letterSpacing: -0.5, color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  cooldownDone: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.accentSoft,
    borderRadius: radius.chip, paddingHorizontal: space.md + 2, paddingVertical: 10,
  },
  cooldownDoneText: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.accent },
  trustedRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  trustedIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  trustedPending: { backgroundColor: colors.mediumSoft },
  trustedDone: { backgroundColor: colors.accentSoft },
  trustedText: { flex: 1, fontFamily: fonts.medium, fontSize: font.body, lineHeight: 26, color: colors.ink },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm + 2 },
  reasonNum: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  reasonNumText: { fontFamily: fonts.bold, fontSize: font.small },
  scheme: { gap: space.sm },
  schemeHow: { borderLeftWidth: 3, paddingLeft: space.md, gap: 2, marginTop: space.xs },
  blocker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.md },
  blockerText: { flexShrink: 1, fontFamily: fonts.regular, fontSize: font.small, lineHeight: 23, color: colors.inkSoft, textAlign: 'center' },
});
