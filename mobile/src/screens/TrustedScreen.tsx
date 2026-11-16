import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { IncomingRequest } from '../api/types';
import { Body, Button, Card, ErrorNote, Heading, Loading, Row, Screen } from '../components/ui';
import { formatDateTime, type I18nKey } from '../i18n';
import { ru } from '../i18n/ru';
import { formatAccount, formatMoney } from '../lib/money';
import { firstName } from '../lib/risk';
import { usePolling } from '../lib/usePolling';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, levelColor, radius, space } from '../theme';

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
          <Card key={r.id} testID="trusted-request" style={styles.request}>
            <Heading>{t('trusted.requestTitle', { name: tr.sender_name })}</Heading>
            <Row label={t('trusted.amount')} value={formatMoney(tr.amount)} strong />
            <Row
              label={t('trusted.to')}
              value={`${tr.recipient.name} · ${tr.recipient.bank}\n${formatAccount(tr.recipient.account)}`}
            />
            <View style={[styles.risk, { backgroundColor: tone.bg }]}>
              <Text style={[styles.riskText, { color: tone.fg }]} testID="trusted-risk">
                {t('trusted.risk')}: {tr.risk_score} / 100 · {t(`level.${tr.risk_level}`)}
              </Text>
            </View>

            {tr.signals.on_call ? <Body style={styles.signal}>● {t('trusted.onCall')}</Body> : null}
            {tr.signals.screen_share ? <Body style={styles.signal}>● {t('trusted.screenShare')}</Body> : null}

            <Text style={styles.caption}>{t('trusted.reasons')}</Text>
            {tr.reasons.map((reason, i) => (
              <Body key={reason.code + i} testID="trusted-reason">• {reason.text}</Body>
            ))}

            {tr.scheme ? (
              <>
                <Text style={styles.caption}>{t('trusted.scheme')}</Text>
                <Body style={styles.schemeTitle}>{tr.scheme.title}</Body>
                <Body>{tr.scheme.how}</Body>
              </>
            ) : null}

            <View style={styles.advice}>
              <Body>{t('trusted.advice', { name: sender })}</Body>
            </View>

          </Card>
        );
      })}

      <Heading style={styles.section}>{t('trusted.mine')}</Heading>
      <Card testID="my-trusted">
        {contact ? (
          <>
            <Body style={styles.schemeTitle}>{contact.name}{relation ? ` · ${relation}` : ''}</Body>
            <Body soft>{contact.phone}</Body>
            <Body soft style={styles.small}>{t('trusted.mineHint')}</Body>
          </>
        ) : (
          <Body soft>{t('trusted.mineNone')}</Body>
        )}
      </Card>

      {client && client.trusted_for.length > 0 ? (
        <Card testID="trusted-for">
          <Text style={styles.caption}>{t('trusted.iAmFor')}</Text>
          {client.trusted_for.map((name) => <Body key={name} style={styles.schemeTitle}>{name}</Body>)}
        </Card>
      ) : null}

      {earlier.length > 0 ? (
        <>
          <Heading style={styles.section}>{t('trusted.earlier')}</Heading>
          {earlier.map((r) => (
            <Card key={r.id} testID="trusted-earlier">
              <Body style={styles.schemeTitle}>{r.transfer.sender_name} · {formatMoney(r.transfer.amount)}</Body>
              <Body soft style={styles.small}>
                {t(r.status === 'approved' ? 'trusted.youApproved' : 'trusted.youDeclined')}
                {r.responded_at ? ` · ${formatDateTime(r.responded_at)}` : ''}
              </Body>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  request: { borderWidth: 2, borderColor: colors.primary },
  risk: { borderRadius: radius.button, paddingHorizontal: space.md, paddingVertical: space.sm },
  riskText: { fontSize: font.body, lineHeight: 26, fontWeight: '800' },
  signal: { color: colors.primary, fontWeight: '600' },
  caption: { fontSize: font.small, lineHeight: 22, color: colors.inkSoft, marginTop: space.xs },
  schemeTitle: { fontWeight: '700' },
  advice: { backgroundColor: colors.primarySoft, borderRadius: radius.button, padding: space.md, marginVertical: space.xs },
  section: { marginTop: space.sm },
  small: { fontSize: font.small + 1, lineHeight: 23 },
});
