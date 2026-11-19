import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { IncomingRequest } from '../api/types';
import { Icon } from '../components/Icon';
import { PressableScale } from '../components/Motion';
import { Body, Button, Caption, Card, Divider, ErrorNote, Heading, IconBadge, Loading, Pill, Screen } from '../components/ui';
import { formatDateTime, type I18nKey } from '../i18n';
import { ru } from '../i18n/ru';
import { callNumber, clockTime, looksLikePhone } from '../lib/call';
import { formatAccount, formatMoney } from '../lib/money';
import { firstName } from '../lib/risk';
import { usePolling } from '../lib/usePolling';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, levelColor, noOutline, radius, shadow, space } from '../theme';

const RELATIONS = ['son', 'daughter', 'spouse', 'relative', 'friend'] as const;

/** Доверенное лицо: входящие просьбы проверить перевод и сведения о моём доверенном лице. */
export function TrustedScreen({ navigation }: ScreenProps<'Trusted'>) {
  const { api, client, t, describeError, refreshMe } = useApp();
  const focused = useIsFocused();
  const [items, setItems] = useState<IncomingRequest[] | null>(null);
  const [busy, setBusy] = useState<{ id: number; decision: 'approve' | 'decline' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // привязка доверенного лица
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [relationCode, setRelationCode] = useState<string>('son');
  const [saving, setSaving] = useState<'save' | 'remove' | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const saveContact = async () => {
    setSaving('save');
    setContactError(null);
    try {
      await api.setContact(phone.trim(), relationCode);
      await refreshMe();
      setEditing(false);
      setPhone('');
    } catch (e) {
      setContactError(describeError(e));
    } finally {
      setSaving(null);
    }
  };

  const removeContact = async () => {
    setSaving('remove');
    setContactError(null);
    try {
      await api.removeContact();
      await refreshMe();
    } catch (e) {
      setContactError(describeError(e));
    } finally {
      setSaving(null);
    }
  };

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
            {clockTime(r.expires_at) ? (
              <Pill label={t('trusted.answerUntil', { time: clockTime(r.expires_at) })} fg={colors.medium} bg={colors.mediumSoft} icon="clock" />
            ) : null}
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
        {contact && !editing ? (
          <>
            <View style={styles.person}>
              <IconBadge name="users" bg={colors.accentSoft} color={colors.accent} />
              <View style={styles.flex}>
                <Text style={styles.strong}>{contact.name}{relation ? ` · ${relation}` : ''}</Text>
                <Text style={styles.account}>{contact.phone}</Text>
              </View>
            </View>
            <Body soft style={styles.small}>{t('trusted.mineHint')}</Body>
            <Button
              label={t('trusted.call')} variant="secondary" icon="phone" onPress={() => callNumber(contact.phone)}
              testID="my-trusted-call"
            />
            <View style={styles.links}>
              <PressableScale
                onPress={() => { setEditing(true); setContactError(null); }} style={styles.link}
                accessibilityRole="button" testID="my-trusted-change"
              >
                <Text style={styles.linkText}>{t('trusted.change')}</Text>
              </PressableScale>
              <PressableScale
                onPress={() => void removeContact()} disabled={saving != null} style={styles.link}
                accessibilityRole="button" testID="my-trusted-remove"
              >
                <Text style={[styles.linkText, styles.linkSoft]}>{t('trusted.remove')}</Text>
              </PressableScale>
            </View>
            <ErrorNote text={contactError} />
          </>
        ) : (
          <>
            {!contact ? <Body soft testID="my-trusted-none">{t('trusted.mineNone')}</Body> : null}
            <Text style={styles.strong}>{t('trusted.addTitle')}</Text>
            <Body soft style={styles.small}>{t('trusted.mineHint')}</Body>
            <Caption>{t('trusted.phoneLabel')}</Caption>
            <TextInput
              value={phone} onChangeText={setPhone} placeholder={t('trusted.phonePlaceholder')}
              placeholderTextColor={colors.disabled} keyboardType="phone-pad" inputMode="tel" style={styles.input}
              accessibilityLabel={t('trusted.phoneLabel')} testID="trusted-phone"
            />
            <Caption>{t('trusted.relationLabel')}</Caption>
            <View style={styles.chips}>
              {RELATIONS.map((code) => {
                const on = code === relationCode;
                return (
                  <PressableScale
                    key={code} onPress={() => setRelationCode(code)} scaleTo={0.94} accessibilityRole="button"
                    accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}
                    testID={`relation-${code}`}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(`relation.${code}` as I18nKey)}</Text>
                  </PressableScale>
                );
              })}
            </View>
            <ErrorNote text={contactError} />
            <Button
              label={t('trusted.add')} onPress={() => void saveContact()} loading={saving === 'save'}
              disabled={!looksLikePhone(phone) || saving != null} testID="trusted-save"
            />
            {contact ? (
              <Button label={t('common.back')} variant="ghost" onPress={() => setEditing(false)} testID="trusted-edit-cancel" />
            ) : null}
          </>
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
                label={t(r.status === 'approved' ? 'trusted.youApproved'
                  : r.status === 'expired' ? 'trusted.youMissed' : 'trusted.youDeclined')}
                fg={r.status === 'declined' ? colors.accent : colors.inkSoft}
                bg={r.status === 'declined' ? colors.accentSoft : colors.disabledBg}
                icon={r.status === 'declined' ? 'shieldCheck' : undefined}
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
  input: {
    minHeight: 60, borderRadius: radius.inner, borderWidth: 1.5, borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceSoft, paddingHorizontal: space.md, ...noOutline,
    fontFamily: fonts.semibold, fontSize: font.lead, color: colors.ink,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 48, paddingHorizontal: 18, borderRadius: radius.chip, justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: font.small + 1, color: colors.primary },
  chipTextOn: { color: colors.onPrimary },
  links: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  link: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.sm },
  linkText: { fontFamily: fonts.semibold, fontSize: font.small + 1, color: colors.primary },
  linkSoft: { color: colors.inkSoft },
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
