import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { IncomingRequest } from '../api/types';
import { Icon } from '../components/Icon';
import { Body, Button, Caption, Card, Divider, ErrorNote, Heading, IconBadge, Loading, Pill, Screen } from '../components/ui';
import { formatDateTime, type I18nKey } from '../i18n';
import { ru } from '../i18n/ru';
import { formatAccount, formatMoney } from '../lib/money';
import { firstName } from '../lib/risk';
import { usePolling } from '../lib/usePolling';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, levelColor, radius, shadow, space } from '../theme';

/** Доверенное лицо: входящие просьбы проверить перевод и сведения о моём доверенном лице. */
export function TrustedScreen({ navigation }: ScreenProps<'Trusted'>) {
  const { api, client, t, describeError } = useApp();
  const focused = useIsFocused();
  const [items, setItems] = useState<IncomingRequest[] | null>(null);
  const [busy, setBusy] = useState<{ id: number; decision: 'approve' | 'decline' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.incoming());
    } catch (e) {
      const text = describeError(e);
      setItems((prev) => {
        if (prev == null) setError(text);
        return prev;
      });
    }
  }, [api, describeError]);

  usePolling(load, 3000, focused);

  const respond = async (id: number, decision: 'approve' | 'decline') => {
    setBusy({ id, decision });
    setError(null);
    try {
      await api.respond(id, decision);
    } catch (e) {
      setError(describeError(e));
    } finally {
      await load();
      setBusy(null);
    }
  };

  const pending = items?.filter((r) => r.status === 'pending') ?? [];
  const current = pending[0]; // запросы разбираются по одному: кнопки решения закреплены внизу экрана
  const earlier = items?.filter((r) => r.status !== 'pending') ?? [];
  const contact = client?.trusted_contact;
  const relationKey = contact ? (`relation.${contact.relation}` as I18nKey) : null;
  const relation = relationKey && relationKey in ru ? t(relationKey) : contact?.relation;

  return (
    <Screen
      title={t('trusted.title')} onBack={() => navigation.goBack()} backLabel={t('common.back')}
      testID="screen-trusted"
      footer={current ? (
        <>
          <Button
            label={t('trusted.decline')} onPress={() => void respond(current.id, 'decline')}
            loading={busy?.id === current.id && busy.decision === 'decline'} disabled={busy != null}
            testID="trusted-decline"
          />
          <Button
            label={t('trusted.approve')} variant="secondary" onPress={() => void respond(current.id, 'approve')}
            loading={busy?.id === current.id && busy.decision === 'approve'} disabled={busy != null}
            testID="trusted-approve"
          />
        </>
      ) : undefined}
    >
      <Heading>
        {t('trusted.incoming')}{pending.length > 1 ? ` (${pending.length})` : ''}
      </Heading>
      <ErrorNote text={error} />
      {items == null && !error ? <Loading label={t('common.loading')} /> : null}
      {items != null && pending.length === 0 ? (
        <Card><Body soft testID="trusted-empty">{t('trusted.empty')}</Body></Card>
      ) : null}

      {pending.slice(0, 1).map((r) => {
        const tr = r.transfer;
        const tone = levelColor[tr.risk_level] ?? levelColor.high;
        const sender = firstName(tr.sender_name);
        return (
          <Card key={r.id} testID="trusted-request" style={styles.request} index={0}>
            <Heading>{t('trusted.requestTitle', { name: tr.sender_name })}</Heading>
            <View style={styles.amountBox}>
              <Caption>{t('trusted.amount')}</Caption>
              <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>{formatMoney(tr.amount)}</Text>
            </View>
            <View style={styles.to}>
              <Caption>{t('trusted.to')}</Caption>
              <Text style={styles.strong}>{tr.recipient.name} · {tr.recipient.bank}</Text>
              <Text style={styles.account}>{formatAccount(tr.recipient.account)}</Text>
            </View>
            <View style={[styles.risk, { backgroundColor: tone.bg }]}>
              <View style={[styles.riskDot, { backgroundColor: tone.vivid }]} />
              <Text style={[styles.riskText, { color: tone.fg }]} testID="trusted-risk">
                {t('trusted.risk')}: {tr.risk_score} / 100 · {t(`level.${tr.risk_level}`)}
              </Text>
            </View>

            {tr.signals.on_call || tr.signals.screen_share ? (
              <View style={styles.signals}>
                {tr.signals.on_call ? (
                  <View style={styles.signal}>
                    <Icon name="phone" size={20} color={colors.primary} />
                    <Text style={styles.signalText}>{t('trusted.onCall')}</Text>
                  </View>
                ) : null}
                {tr.signals.screen_share ? (
                  <View style={styles.signal}>
                    <Icon name="screen" size={20} color={colors.primary} />
                    <Text style={styles.signalText}>{t('trusted.screenShare')}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <Divider />
            <Caption>{t('trusted.reasons')}</Caption>
            {tr.reasons.map((reason, i) => (
              <View key={reason.code + i} style={styles.reason}>
                <View style={[styles.reasonNum, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.reasonNumText, { color: tone.fg }]}>{i + 1}</Text>
                </View>
                <Body style={styles.flex} testID="trusted-reason">{reason.text}</Body>
              </View>
            ))}

            {tr.scheme ? (
              <View style={[styles.scheme, { borderLeftColor: tone.vivid }]}>
                <Caption>{t('trusted.scheme')}</Caption>
                <Text style={styles.strong}>{tr.scheme.title}</Text>
                <Body>{tr.scheme.how}</Body>
              </View>
            ) : null}

            <View style={styles.advice}>
              <Icon name="info" size={22} color={colors.primary} />
              <Text style={styles.adviceText}>{t('trusted.advice', { name: sender })}</Text>
            </View>
          </Card>
        );
      })}

      <Heading style={styles.section}>{t('trusted.mine')}</Heading>
      <Card testID="my-trusted">
        {contact ? (
          <>
            <View style={styles.person}>
              <IconBadge name="users" bg={colors.accentSoft} color={colors.accent} />
              <View style={styles.flex}>
                <Text style={styles.strong}>{contact.name}{relation ? ` · ${relation}` : ''}</Text>
                <Text style={styles.account}>{contact.phone}</Text>
              </View>
            </View>
            <Body soft style={styles.small}>{t('trusted.mineHint')}</Body>
          </>
        ) : (
          <Body soft>{t('trusted.mineNone')}</Body>
        )}
      </Card>

      {client && client.trusted_for.length > 0 ? (
        <Card testID="trusted-for">
          <Caption>{t('trusted.iAmFor')}</Caption>
          {client.trusted_for.map((name) => <Text key={name} style={styles.strong}>{name}</Text>)}
        </Card>
      ) : null}

      {earlier.length > 0 ? (
        <>
          <Heading style={styles.section}>{t('trusted.earlier')}</Heading>
          {earlier.map((r) => (
            <Card key={r.id} testID="trusted-earlier">
              <Text style={styles.strong}>{r.transfer.sender_name} · {formatMoney(r.transfer.amount)}</Text>
              <Pill
                label={t(r.status === 'approved' ? 'trusted.youApproved' : 'trusted.youDeclined')}
                fg={r.status === 'approved' ? colors.inkSoft : colors.accent}
                bg={r.status === 'approved' ? colors.disabledBg : colors.accentSoft}
                icon={r.status === 'approved' ? undefined : 'shieldCheck'}
              />
              {r.responded_at ? <Text style={styles.account}>{formatDateTime(r.responded_at)}</Text> : null}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  request: { gap: space.md, ...shadow.raised },
  amountBox: { gap: 2 },
  amount: {
    fontFamily: fonts.extra, fontSize: font.huge - 4, lineHeight: 46, letterSpacing: -1.2, color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  to: { gap: 2 },
  strong: { fontFamily: fonts.semibold, fontSize: font.body, lineHeight: 26, color: colors.ink },
  account: { fontFamily: fonts.regular, fontSize: font.small - 1, lineHeight: 22, letterSpacing: 0.3, color: colors.inkSoft },
  risk: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    borderRadius: radius.inner, paddingHorizontal: space.md, paddingVertical: space.sm + 2,
  },
  riskDot: { width: 10, height: 10, borderRadius: 5 },
  riskText: { flex: 1, fontFamily: fonts.bold, fontSize: font.body - 1, lineHeight: 25 },
  signals: { gap: space.sm },
  signal: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  signalText: { flex: 1, fontFamily: fonts.medium, fontSize: font.small + 1, lineHeight: 24, color: colors.primary },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm + 2 },
  reasonNum: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  reasonNumText: { fontFamily: fonts.bold, fontSize: font.small },
  scheme: { borderLeftWidth: 3, paddingLeft: space.md, gap: 2 },
  advice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.sm,
    backgroundColor: colors.primarySoft, borderRadius: radius.inner + 2, padding: space.md,
  },
  adviceText: { flex: 1, fontFamily: fonts.medium, fontSize: font.small + 1, lineHeight: 25, color: colors.primary },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  section: { marginTop: space.md },
  small: { fontSize: font.small, lineHeight: 23 },
});
