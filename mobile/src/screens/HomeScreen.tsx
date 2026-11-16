import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LangSwitch } from '../components/LangSwitch';
import { Logo } from '../components/Logo';
import { Button, Screen } from '../components/ui';
import { formatAccount, formatMoney } from '../lib/money';
import { firstName } from '../lib/risk';
import { usePolling } from '../lib/usePolling';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, radius, space } from '../theme';

/** Главная: приветствие, баланс и три больших действия. */
export function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const { api, client, refreshMe, logout, t, describeError } = useApp();
  const focused = useIsFocused();
  const [pending, setPending] = useState(0);

  // Баланс обновляется при каждом возврате на главную.
  useFocusEffect(useCallback(() => {
    refreshMe().catch((e) => describeError(e));
  }, [refreshMe, describeError]));

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

  return (
    <Screen testID="screen-home">
      <View style={styles.top}>
        <Logo compact onSecret={() => navigation.navigate('DemoMenu')} />
        <LangSwitch />
      </View>

      <Text style={styles.greeting} testID="greeting">{t('home.greeting', { name: firstName(client.full_name) })}</Text>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{t('home.balance')}</Text>
        <Text style={styles.balance} testID="balance" adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(client.account?.balance)}
        </Text>
        {client.account ? (
          <Text style={styles.account}>{client.bank.name} · {formatAccount(client.account.number)}</Text>
        ) : null}
      </View>

      <Tile
        icon="→" title={t('home.transfer')} hint={t('home.transferHint')} primary testID="tile-transfer"
        onPress={() => navigation.navigate('Transfer')}
      />
      <Tile
        icon="≡" title={t('home.history')} hint={t('home.historyHint')} testID="tile-history"
        onPress={() => navigation.navigate('History')}
      />
      <Tile
        icon="♥" title={t('home.trusted')} hint={pending > 0 ? t('home.trustedPending') : t('home.trustedHint')}
        badge={pending} testID="tile-trusted" onPress={() => navigation.navigate('Trusted')}
      />

      <Button label={t('home.logout')} variant="ghost" onPress={logout} testID="logout" />
    </Screen>
  );
}

function Tile({
  icon, title, hint, onPress, primary, badge, testID,
}: {
  icon: string; title: string; hint: string; onPress: () => void; primary?: boolean; badge?: number; testID: string;
}) {
  return (
    <Pressable
      onPress={onPress} testID={testID} accessibilityRole="button"
      style={({ pressed }) => [styles.tile, primary && styles.tilePrimary, pressed && styles.pressed]}
    >
      <View style={[styles.tileIcon, primary && styles.tileIconPrimary]}>
        <Text style={[styles.tileIconText, primary && styles.onPrimary]}>{icon}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.tileTitle, primary && styles.onPrimary]}>{title}</Text>
        <Text style={[styles.tileHint, primary && styles.onPrimarySoft, !!badge && styles.tileHintAlert]}>{hint}</Text>
      </View>
      {badge ? (
        <View style={styles.badge} testID="trusted-badge">
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : (
        <Text style={[styles.chevron, primary && styles.onPrimary]}>›</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  greeting: { fontSize: font.title - 2, lineHeight: 34, fontWeight: '800', color: colors.ink, marginTop: space.sm },
  balanceCard: {
    backgroundColor: colors.surface, borderRadius: radius.card, padding: space.lg, gap: 4,
    borderWidth: 1, borderColor: colors.line,
  },
  balanceLabel: { fontSize: font.small + 1, color: colors.inkSoft },
  balance: { fontSize: font.huge, lineHeight: 48, fontWeight: '800', color: colors.ink },
  account: { fontSize: font.small, color: colors.inkSoft, marginTop: 4 },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 96, padding: space.md,
    backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line,
  },
  tilePrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.85 },
  tileIcon: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  tileIconPrimary: { backgroundColor: 'rgba(255,255,255,0.18)' },
  tileIconText: { fontSize: 28, fontWeight: '800', color: colors.primary },
  tileTitle: { fontSize: font.lead + 1, lineHeight: 30, fontWeight: '800', color: colors.ink },
  tileHint: { fontSize: font.small + 1, lineHeight: 23, color: colors.inkSoft },
  tileHintAlert: { color: colors.medium, fontWeight: '700' },
  onPrimary: { color: colors.onPrimary },
  onPrimarySoft: { color: '#D5E1EE' },
  chevron: { fontSize: 34, color: colors.inkSoft },
  badge: {
    minWidth: 40, height: 40, borderRadius: 20, paddingHorizontal: 10, backgroundColor: colors.medium,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: font.body, fontWeight: '800', color: colors.onPrimary },
});
