import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, ErrorNote, Screen } from '../components/ui';
import { formatAmountInput, formatMoney, normalizeAccount, parseAmountInput } from '../lib/money';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, radius, space } from '../theme';

/** Перевод: счёт получателя и сумма. «Продолжить» отправляет перевод на проверку Sabyr. */
export function TransferScreen({ navigation }: ScreenProps<'Transfer'>) {
  const { api, client, t, describeError, currentSignals, prefillAccount, setPrefillAccount, demo } = useApp();
  const [account, setAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Счёт, выбранный в демо-меню, подставляется в форму один раз.
  useEffect(() => {
    if (prefillAccount) {
      setAccount(prefillAccount);
      setPrefillAccount(null);
    }
  }, [prefillAccount, setPrefillAccount]);

  const value = parseAmountInput(amount);
  const ready = normalizeAccount(account).length >= 8 && value > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Сигналы снимаются в момент нажатия «Продолжить».
      const state = await api.check(normalizeAccount(account), value, currentSignals());
      navigation.replace(state.action === 'allow' ? 'Confirm' : 'Sabyr', { transfer: state });
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <Screen
      title={t('transfer.title')} onBack={() => navigation.goBack()} backLabel={t('common.back')}
      testID="screen-transfer"
      footer={
        <Button
          label={busy ? t('transfer.checking') : t('transfer.continue')} onPress={() => void submit()}
          disabled={!ready || busy} testID="transfer-continue"
        />
      }
    >
      <View style={styles.field}>
        <Text style={styles.label}>{t('transfer.recipient')}</Text>
        <TextInput
          value={account} onChangeText={(v) => setAccount(v.toUpperCase())} testID="input-account"
          placeholder={t('transfer.recipientPlaceholder')} placeholderTextColor={colors.disabled}
          autoCapitalize="characters" autoCorrect={false} style={styles.input}
          accessibilityLabel={t('transfer.recipient')}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('transfer.amount')}</Text>
        <TextInput
          value={amount} onChangeText={(v) => setAmount(formatAmountInput(v))} testID="input-amount"
          placeholder={t('transfer.amountPlaceholder')} placeholderTextColor={colors.disabled}
          keyboardType="number-pad" inputMode="numeric" style={[styles.input, styles.amount]}
          accessibilityLabel={t('transfer.amount')}
        />
        <Body soft style={styles.hint}>
          {t('transfer.available', { amount: formatMoney(client?.account?.balance) })}
        </Body>
      </View>

      {demo.onCall || demo.screenShare ? (
        <View style={styles.signals} testID="signals-note">
          {demo.onCall ? <Text style={styles.signalText}>● {t('transfer.signalCall')}</Text> : null}
          {demo.screenShare ? <Text style={styles.signalText}>● {t('transfer.signalScreen')}</Text> : null}
        </View>
      ) : null}

      <ErrorNote text={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  label: { fontSize: font.body, fontWeight: '700', color: colors.ink },
  input: {
    minHeight: 66, borderRadius: radius.button, borderWidth: 2, borderColor: colors.line,
    backgroundColor: colors.surface, paddingHorizontal: space.md, fontSize: font.lead, color: colors.ink,
    fontWeight: '600',
  },
  amount: { fontSize: font.title + 2, minHeight: 76, fontWeight: '800' },
  hint: { fontSize: font.small + 1 },
  signals: { backgroundColor: colors.primarySoft, borderRadius: radius.button, padding: space.md, gap: 4 },
  signalText: { fontSize: font.small + 1, lineHeight: 24, color: colors.primary, fontWeight: '600' },
});
