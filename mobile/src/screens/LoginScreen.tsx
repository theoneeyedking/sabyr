import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DemoUser } from '../api/types';
import { LangSwitch } from '../components/LangSwitch';
import { Logo } from '../components/Logo';
import { Icon } from '../components/Icon';
import { PressableScale, Reveal } from '../components/Motion';
import { Body, Button, Caption, Divider, ErrorNote, Loading, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, shadow, space } from '../theme';

// Мягкие оттенки для аватаров — по кругу.
const AVATARS = [
  { bg: colors.primarySoft, fg: colors.primary },
  { bg: colors.accentSoft, fg: colors.accent },
  { bg: colors.mediumSoft, fg: colors.medium },
  { bg: colors.highSoft, fg: colors.high },
];

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

      <Reveal>
        <Text style={styles.hero}>{t('app.tagline')}</Text>
      </Reveal>

      <ErrorNote text={error} />
      {error ? <Button label={t('common.retry')} variant="secondary" onPress={() => void load()} /> : null}
      {!users && !error ? <Loading label={t('common.loading')} /> : null}
      {users && users.length === 0 ? <Body soft>{t('login.empty')}</Body> : null}

      {users && users.length > 0 ? (
        <Reveal index={1} style={styles.block}>
          <Caption style={styles.subtitle}>{t('login.subtitle')}</Caption>
          <View style={styles.list}>
            {users.map((u, i) => {
              const tint = AVATARS[i % AVATARS.length];
              return (
                <React.Fragment key={u.id}>
                  {i > 0 ? <Divider /> : null}
                  <PressableScale
                    onPress={() => void enter(u.id)} disabled={busyId != null} testID={`user-${u.id}`}
                    accessibilityRole="button" scaleTo={0.98}
                    style={[styles.user, busyId === u.id && styles.userBusy]}
                  >
                    <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
                      <Text style={[styles.avatarText, { color: tint.fg }]}>{u.full_name.slice(0, 1)}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.name}>{u.full_name}</Text>
                      <Text style={styles.meta}>{t('login.age', { age: u.age })} · {u.bank}</Text>
                    </View>
                    <Icon name="chevronRight" size={24} color={colors.inkFaint} />
                  </PressableScale>
                </React.Fragment>
              );
            })}
          </View>
        </Reveal>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
  hero: {
    fontFamily: fonts.extra, fontSize: 38, lineHeight: 43, letterSpacing: -1.5, color: colors.ink,
    marginTop: space.xl, marginBottom: space.md, maxWidth: 380,
  },
  block: { gap: space.sm },
  subtitle: { fontSize: font.small, marginLeft: 4 },
  list: { backgroundColor: colors.surface, borderRadius: 28, paddingHorizontal: space.md + 2, ...shadow.card },
  user: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 88, paddingVertical: space.md },
  userBusy: { opacity: 0.55 },
  avatar: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bold, fontSize: font.lead + 1 },
  name: { fontFamily: fonts.semibold, fontSize: font.body + 1, lineHeight: 26, letterSpacing: -0.2, color: colors.ink },
  meta: { fontFamily: fonts.regular, fontSize: font.small, lineHeight: 23, color: colors.inkSoft },
});
