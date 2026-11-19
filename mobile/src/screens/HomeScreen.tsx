import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { LangSwitch } from '../components/LangSwitch';
import { Logo } from '../components/Logo';
import { Icon, type IconName } from '../components/Icon';
import { Breathing, PressableScale, Reveal, useSvgId } from '../components/Motion';
import { Divider, IconBadge, Screen } from '../components/ui';
import { formatAccount, formatMoney } from '../lib/money';
import { protectionStats, type ProtectionStats } from '../lib/protection';
import { firstName } from '../lib/risk';
import { usePolling } from '../lib/usePolling';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, shadow, space } from '../theme';

/** Главная: приветствие, карта с балансом и переводом, история и доверенное лицо. */
export function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const { api, client, refreshMe, logout, t, describeError } = useApp();
  const focused = useIsFocused();
  const [pending, setPending] = useState(0);
  const [stats, setStats] = useState<ProtectionStats | null>(null);

  // Баланс обновляется при каждом возврате на главную.
  useFocusEffect(useCallback(() => {
    refreshMe().catch((e) => describeError(e));
    // Что Sabyr уже сделал для клиента — из его же истории; при ошибке карточка просто не показывает цифры.
    api.history(100).then((items) => setStats(protectionStats(items))).catch(() => setStats(null));
  }, [refreshMe, describeError, api]));

  // Входящие просьбы доверенному лицу — опрос раз в 3 секунды, пока экран открыт.
  usePolling(async () => {
    try {
      const items = await api.incoming();
      setPending(items.filter((r) => r.status === 'pending').length);
    } catch (e) {
      describeError(e); // 401 → выход; остальное молча, повторим через 3 секунды
    }
  }, 3000, focused);

  if (!client) return null;
  const money = formatMoney(client.account?.balance);
  const cut = money.lastIndexOf(' ');

  return (
    <Screen testID="screen-home">
      <View style={styles.top}>
        <Logo compact onSecret={() => navigation.navigate('DemoMenu')} />
        <LangSwitch />
      </View>

      <Reveal>
        <Text style={styles.greeting} testID="greeting">{t('home.greeting', { name: firstName(client.full_name) })}</Text>
      </Reveal>

      <Reveal index={1}>
        <View style={styles.balanceCard}>
          <CardArt />
          <View style={styles.balanceHead}>
            <Text style={styles.balanceLabel}>{t('home.balance')}</Text>
            <View style={styles.guard}>
              <View style={styles.guardDot} />
              <Text style={styles.guardText}>{t('home.protected')}</Text>
            </View>
          </View>
          <Text style={styles.balance} testID="balance" adjustsFontSizeToFit numberOfLines={1}>
            {money.slice(0, cut)}<Text style={styles.currency}>{money.slice(cut)}</Text>
          </Text>
          {client.account ? (
            <Text style={styles.account}>{client.bank.name} · {formatAccount(client.account.number)}</Text>
          ) : null}
          <PressableScale
            onPress={() => navigation.navigate('Transfer')} testID="tile-transfer" accessibilityRole="button"
            style={styles.transfer}
          >
            <View style={styles.flex}>
              <Text style={styles.transferTitle}>{t('home.transfer')}</Text>
              <Text style={styles.transferHint}>{t('home.transferHint')}</Text>
            </View>
            <View style={styles.transferArrow}>
              <Icon name="arrowRight" size={24} color={colors.onPrimary} stroke={2.3} />
            </View>
          </PressableScale>
        </View>
      </Reveal>

      <Reveal index={2}>
        <View style={styles.guardCard} testID="protection-card">
          <View style={styles.guardHead}>
            <View style={styles.guardHalo}>
              <Breathing color={colors.accentGlow} size={44} />
              <View style={styles.guardIcon}>
                <Icon name="shieldCheck" size={26} color={colors.onPrimary} stroke={2.2} />
              </View>
            </View>
            {stats && stats.saved > 0 ? (
              <View style={styles.flex}>
                <Text style={styles.guardLabel}>{t('home.savedLabel')}</Text>
                <Text style={styles.guardSaved} testID="protection-saved" adjustsFontSizeToFit numberOfLines={1}>
                  {formatMoney(stats.saved)}
                </Text>
              </View>
            ) : (
              <View style={styles.flex}>
                <Text style={styles.guardTitle}>{t('home.guardTitle')}</Text>
                <Text style={styles.guardHint}>{t('home.guardHint')}</Text>
              </View>
            )}
          </View>
          {stats && stats.checked > 0 ? (
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue} testID="protection-checked">{stats.checked}</Text>
                <Text style={styles.statLabel}>{t('home.statChecked')}</Text>
              </View>
              <View style={styles.statLine} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, stats.stopped > 0 && styles.statValueAccent]} testID="protection-stopped">
                  {stats.stopped}
                </Text>
                <Text style={styles.statLabel}>{t('home.statStopped')}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </Reveal>

      <Reveal index={3}>
        <View style={styles.list}>
          <Tile
            icon="clock" title={t('home.history')} hint={t('home.historyHint')} testID="tile-history"
            onPress={() => navigation.navigate('History')}
          />
          <Divider />
          <Tile
            icon="users" title={t('home.trusted')} hint={pending > 0 ? t('home.trustedPending') : client.trusted_contact ? t('home.trustedHint') : t('home.trustedNone')}
            badge={pending} testID="tile-trusted" onPress={() => navigation.navigate('Trusted')}
          />
        </View>
      </Reveal>

      <PressableScale onPress={logout} testID="logout" accessibilityRole="button" style={styles.logout}>
        <Icon name="logout" size={20} color={colors.inkSoft} />
        <Text style={styles.logoutText}>{t('home.logout')}</Text>
      </PressableScale>
    </Screen>
  );
}

/** Фон карты баланса: глубокий градиент, изумрудное свечение и расходящиеся круги — мотив паузы. */
function CardArt() {
  const base = useSvgId('card');
  const glow = useSvgId('cardGlow');
  return (
    <View style={styles.art}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={base} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.primaryLift} />
            <Stop offset="0.55" stopColor={colors.primary} />
            <Stop offset="1" stopColor={colors.primaryDeep} />
          </LinearGradient>
          <RadialGradient id={glow} cx="92%" cy="0%" r="75%">
            <Stop offset="0" stopColor={colors.accentGlow} stopOpacity="0.42" />
            <Stop offset="1" stopColor={colors.accentGlow} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${base})`} />
        <Rect width="100%" height="100%" fill={`url(#${glow})`} />
        {[70, 120, 170, 220].map((r) => (
          <Circle key={r} cx="100%" cy="0" r={r} stroke="#FFFFFF" strokeOpacity={0.07} strokeWidth={1.5} fill="none" />
        ))}
      </Svg>
    </View>
  );
}

function Tile({
  icon, title, hint, onPress, badge, testID,
}: {
  icon: IconName; title: string; hint: string; onPress: () => void; badge?: number; testID: string;
}) {
  return (
    <PressableScale onPress={onPress} testID={testID} accessibilityRole="button" style={styles.tile} scaleTo={0.98}>
      <IconBadge name={icon} bg={badge ? colors.mediumSoft : colors.primarySoft} color={badge ? colors.medium : colors.primary} />
      <View style={styles.flex}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={[styles.tileHint, !!badge && styles.tileHintAlert]}>{hint}</Text>
      </View>
      {badge ? (
        <View style={styles.badge} testID="trusted-badge">
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : (
        <Icon name="chevronRight" size={24} color={colors.inkFaint} />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  greeting: {
    fontFamily: fonts.extra, fontSize: font.title + 2, lineHeight: 36, letterSpacing: -0.9, color: colors.ink,
    marginTop: space.md,
  },
  balanceCard: {
    borderRadius: 32, padding: space.lg, paddingBottom: space.md, overflow: 'hidden',
    backgroundColor: colors.primary, ...shadow.raised,
  },
  art: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
  balanceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  balanceLabel: { fontFamily: fonts.medium, fontSize: font.small, color: colors.onPrimarySoft },
  guard: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)',
  },
  guardDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentGlow },
  guardText: { fontFamily: fonts.medium, fontSize: font.caption, color: colors.onPrimary },
  balance: {
    fontFamily: fonts.extra, fontSize: font.huge + 2, lineHeight: 52, letterSpacing: -1.6, color: colors.onPrimary,
    fontVariant: ['tabular-nums'], marginTop: space.sm,
  },
  currency: { fontFamily: fonts.semibold, color: colors.onPrimarySoft },
  account: {
    fontFamily: fonts.regular, fontSize: font.small - 1, letterSpacing: 0.4, color: colors.onPrimarySoft, marginTop: 4,
  },
  transfer: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg, minHeight: 84,
    paddingVertical: space.sm + 2, paddingLeft: space.md + 4, paddingRight: space.sm + 2,
    borderRadius: 24, backgroundColor: colors.surface,
  },
  transferTitle: { fontFamily: fonts.bold, fontSize: font.lead + 1, lineHeight: 28, letterSpacing: -0.4, color: colors.ink },
  transferHint: { fontFamily: fonts.regular, fontSize: font.small, lineHeight: 22, color: colors.inkSoft },
  transferArrow: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  guardCard: {
    backgroundColor: colors.surface, borderRadius: 28, padding: space.md + 4, gap: space.md, ...shadow.card,
  },
  guardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  guardHalo: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  guardIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  guardLabel: { fontFamily: fonts.medium, fontSize: font.small, lineHeight: 22, color: colors.inkSoft },
  guardSaved: {
    fontFamily: fonts.extra, fontSize: font.title + 4, lineHeight: 38, letterSpacing: -1, color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  guardTitle: { fontFamily: fonts.bold, fontSize: font.body + 1, lineHeight: 25, letterSpacing: -0.3, color: colors.ink },
  guardHint: { fontFamily: fonts.regular, fontSize: font.small, lineHeight: 22, color: colors.inkSoft },
  stats: {
    flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.surfaceSoft, borderRadius: 20,
    paddingVertical: space.sm + 4,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: space.sm },
  statLine: { width: 1, backgroundColor: colors.lineStrong },
  statValue: { fontFamily: fonts.extra, fontSize: font.title - 2, lineHeight: 32, color: colors.ink, fontVariant: ['tabular-nums'] },
  statValueAccent: { color: colors.accent },
  statLabel: { fontFamily: fonts.medium, fontSize: font.caption, lineHeight: 19, color: colors.inkSoft, textAlign: 'center' },
  list: { backgroundColor: colors.surface, borderRadius: 28, paddingHorizontal: space.md + 2, ...shadow.card },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 92, paddingVertical: space.md },
  tileTitle: { fontFamily: fonts.bold, fontSize: font.lead - 1, lineHeight: 26, letterSpacing: -0.3, color: colors.ink },
  tileHint: { fontFamily: fonts.regular, fontSize: font.small, lineHeight: 22, color: colors.inkSoft },
  tileHintAlert: { fontFamily: fonts.semibold, color: colors.medium },
  badge: {
    minWidth: 36, height: 36, borderRadius: 18, paddingHorizontal: 10, backgroundColor: colors.medium,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: font.body - 1, color: colors.onPrimary },
  logout: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 56,
    alignSelf: 'center', paddingHorizontal: space.lg,
  },
  logoutText: { fontFamily: fonts.semibold, fontSize: font.body - 1, color: colors.inkSoft },
});
