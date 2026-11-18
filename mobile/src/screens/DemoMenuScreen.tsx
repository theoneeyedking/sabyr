import React, { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Body, Button, Card, Heading, Screen } from '../components/ui';
import { DEMO_ACCOUNTS } from '../lib/config';
import { formatAccount } from '../lib/money';
import type { ScreenProps } from '../navigation';
import { DEFAULT_API_URL, useApp } from '../state/AppContext';
import { colors, font, fonts, radius, space, noOutline } from '../theme';

/** Скрытое демо-меню: ручные сигналы, адрес API, быстрые счета и показания нативного модуля. */
export function DemoMenuScreen({ navigation }: ScreenProps<'DemoMenu'>) {
  const {
    t, demo, setDemo, apiUrl, setApiUrl, device, refreshDevice, currentSignals, token,
    prefillAccount, setPrefillAccount,
  } = useApp();
  const [url, setUrl] = useState(apiUrl);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(currentSignals);

  // Показания устройства и то, что уйдёт в проверку, обновляются раз в секунду.
  useEffect(() => {
    const tick = () => {
      refreshDevice();
      setPreview(currentSignals());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [refreshDevice, currentSignals]);

  const show = (v: boolean | 'unknown' | null | undefined) =>
    v === true ? t('common.yes') : v === false ? t('common.no') : t('demo.unknown');

  const requestPermission = async () => {
    if (Platform.OS !== 'android') return;
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
    } finally {
      refreshDevice();
    }
  };

  const saveUrl = () => {
    setApiUrl(url);
    setSaved(true);
  };

  const fill = (account: string) => {
    setPrefillAccount(account);
    if (token) {
      navigation.goBack();
      navigation.navigate('Transfer');
    }
  };

  return (
    <Screen
      title={t('demo.title')} onBack={() => navigation.goBack()} backLabel={t('common.close')}
      testID="screen-demo"
    >
      <Card>
        <Heading>{t('demo.signals')}</Heading>
        <Toggle
          label={t('demo.onCall')} value={demo.onCall} testID="toggle-call"
          onChange={(v) => setDemo({ ...demo, onCall: v })}
        />
        <Toggle
          label={t('demo.screenShare')} value={demo.screenShare} testID="toggle-screen"
          onChange={(v) => setDemo({ ...demo, screenShare: v })}
        />
      </Card>

      <Card>
        <Heading>{t('demo.quickFill')}</Heading>
        <Button
          label={`${t('demo.fillDrop')}\n${formatAccount(DEMO_ACCOUNTS.drop)}`} variant="secondary"
          onPress={() => fill(DEMO_ACCOUNTS.drop)} testID="fill-drop"
        />
        <Button
          label={`${t('demo.fillFriend')}\n${formatAccount(DEMO_ACCOUNTS.friend)}`} variant="secondary"
          onPress={() => fill(DEMO_ACCOUNTS.friend)} testID="fill-friend"
        />
        {prefillAccount ? <Body soft style={styles.small}>{t('demo.filled', { account: prefillAccount })}</Body> : null}
      </Card>

      <Card>
        <Heading>{t('demo.apiUrl')}</Heading>
        <TextInput
          value={url} onChangeText={(v) => { setUrl(v); setSaved(false); }} testID="input-api-url"
          autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input}
          accessibilityLabel={t('demo.apiUrl')}
        />
        <Button label={t('demo.apiSave')} onPress={saveUrl} testID="api-save" />
        <Button
          label={t('demo.apiReset')} variant="ghost" testID="api-reset"
          onPress={() => { setUrl(DEFAULT_API_URL); setApiUrl(DEFAULT_API_URL); setSaved(true); }}
        />
        {saved ? <Body soft style={styles.small} testID="api-saved">{t('demo.apiSaved')}: {apiUrl}</Body> : null}
      </Card>

      <Card testID="native-readout">
        <Heading>{t('demo.native')}</Heading>
        {!device.available ? <Body soft style={styles.small}>{t('demo.nativeUnavailable')}</Body> : null}
        <Line label={t('demo.nativeCall')} value={show(device.callActive)} testID="native-call" />
        <Line label={t('demo.nativeScreen')} value={show(device.screenShared)} testID="native-screen" />
        {device.raw ? (
          <>
            <Line label={t('demo.nativeAudioMode')} value={String(device.raw.audioMode)} />
            <Line label={t('demo.nativeTelephony')} value={show(device.raw.telephonyBusy)} />
            <Line label={t('demo.nativePermission')} value={show(device.raw.phonePermission)} />
            <Line label={t('demo.nativeDisplays')} value={device.raw.extraDisplays.join(', ') || '—'} />
          </>
        ) : null}
        {Platform.OS === 'android' && device.available && !device.raw?.phonePermission ? (
          <Button label={t('demo.requestPermission')} variant="secondary" onPress={() => void requestPermission()} />
        ) : null}
      </Card>

      <Card testID="signals-preview">
        <Heading>{t('demo.willSend')}</Heading>
        <Line label="on_call" value={String(preview.on_call)} testID="preview-on-call" />
        <Line label="screen_share" value={String(preview.screen_share)} testID="preview-screen-share" />
        <Line label="session_seconds" value={String(preview.session_seconds)} />
        <Line label="source" value={preview.source} testID="preview-source" />
      </Card>
    </Screen>
  );
}

function Toggle({ label, value, onChange, testID }: {
  label: string; value: boolean; onChange: (v: boolean) => void; testID: string;
}) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value} onValueChange={onChange} testID={testID} accessibilityLabel={label}
        trackColor={{ false: colors.disabled, true: colors.accent }} thumbColor={colors.surface}
        style={styles.switch}
      />
    </View>
  );
}

function Line({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue} testID={testID}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 60, gap: space.md },
  toggleLabel: { flex: 1, fontFamily: fonts.medium, fontSize: font.body, color: colors.ink },
  switch: Platform.OS === 'web' ? { transform: [{ scale: 1.5 }], marginRight: 12 } : {},
  input: {
    minHeight: 60, borderRadius: radius.inner, borderWidth: 1.5, borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceSoft, paddingHorizontal: space.md, ...noOutline,
    fontFamily: fonts.medium, fontSize: font.body, color: colors.ink,
  },
  small: { fontSize: font.small, lineHeight: 22 },
  line: {
    flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  lineLabel: { flex: 1, fontFamily: fonts.regular, fontSize: font.small, color: colors.inkSoft },
  lineValue: {
    fontFamily: fonts.semibold, fontSize: font.small, color: colors.ink, textAlign: 'right', flexShrink: 1,
  },
});
