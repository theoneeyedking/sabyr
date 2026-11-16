import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DemoUser } from '../api/types';
import { LangSwitch } from '../components/LangSwitch';
import { Logo } from '../components/Logo';
import { Body, Button, ErrorNote, Loading, Screen, Title } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, radius, space } from '../theme';

/** Вход: список демо-пользователей, нажатие — вход без пароля (демо-упрощение). */
export function LoginScreen({ navigation }: ScreenProps<'Login'>) {
  const { api, login, t, describeError } = useApp();
  const [users, setUsers] = useState<DemoUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await api.demoUsers());
    } catch (e) {
      setUsers(null);
      setError(describeError(e));
    }
  }, [api, describeError]);

  useEffect(() => {
    void load();
  }, [load]);

  const enter = async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      await login(id);
    } catch (e) {
      setError(describeError(e));
      setBusyId(null);
    }
  };

  return (
    <Screen testID="screen-login">
      <View style={styles.top}>
        <Logo onSecret={() => navigation.navigate('DemoMenu')} />
        <LangSwitch />
      </View>
      <Body soft>{t('app.tagline')}</Body>
      <Title style={styles.title}>{t('login.subtitle')}</Title>

      <ErrorNote text={error} />
      {error ? <Button label={t('common.retry')} variant="secondary" onPress={() => void load()} /> : null}
      {!users && !error ? <Loading label={t('common.loading')} /> : null}
      {users && users.length === 0 ? <Body soft>{t('login.empty')}</Body> : null}

      {users?.map((u) => (
        <Pressable
          key={u.id} onPress={() => void enter(u.id)} disabled={busyId != null} testID={`user-${u.id}`}
          accessibilityRole="button"
          style={({ pressed }) => [styles.user, pressed && styles.pressed, busyId === u.id && styles.userBusy]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{u.full_name.slice(0, 1)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>{u.full_name}</Text>
            <Text style={styles.meta}>{t('login.age', { age: u.age })} · {u.bank}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg },
  title: { marginTop: space.md },
  user: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 92, padding: space.md,
    backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line,
  },
  userBusy: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: font.title - 2, fontWeight: '800', color: colors.primary },
  name: { fontSize: font.lead, lineHeight: 28, fontWeight: '700', color: colors.ink },
  meta: { fontSize: font.small + 1, lineHeight: 24, color: colors.inkSoft },
  chevron: { fontSize: 34, color: colors.inkSoft },
});
