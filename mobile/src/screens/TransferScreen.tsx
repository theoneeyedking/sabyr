import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '../components/Icon';
import { Reveal } from '../components/Motion';
import { Button, Caption, ErrorNote, Screen } from '../components/ui';
import { formatAmountInput, formatMoney, normalizeAccount, parseAmountInput } from '../lib/money';
import type { ScreenProps } from '../navigation';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, radius, shadow, space, noOutline } from '../theme';

/** Перевод: счёт получателя и сумма. «Продолжить» отправляет перевод на проверку Sabyr. */
export function TransferScreen({ navigation }: ScreenProps<'Transfer'>) {
  const { api, client, t, describeError, currentSignals, prefillAccount, setPrefillAccount, demo } = useApp();
  const [account, setAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<'account' | 'amount' | null>(null);

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
          disabled={!ready || busy} testID="transfer-continue" icon={busy ? undefined : 'arrowRight'}
        />
      }
    >
      <Reveal style={[styles.field, styles.amountField, focus === 'amount' && styles.fieldFocus]}>
        <Caption>{t('transfer.amount')}</Caption>
        <View style={styles.amountRow}>
          <TextInput
            value={amount} onChangeText={(v) => setAmount(formatAmountInput(v))} testID="input-amount"
            placeholder={t('transfer.amountPlaceholder')} placeholderTextColor={colors.disabled}
            keyboardType="number-pad" inputMode="numeric" style={[styles.input, styles.amount]}
            accessibilityLabel={t('transfer.amount')}
            onFocus={() => setFocus('amount')} onBlur={() => setFocus(null)}
          />
          <Text style={styles.currency}>₸</Text>
        </View>
        <Text style={styles.hint}>
          {t('transfer.available', { amount: formatMoney(client?.account?.balance) })}
        </Text>
      </Reveal>

      <Reveal index={1} style={[styles.field, focus === 'account' && styles.fieldFocus]}>
        <Caption>{t('transfer.recipient')}</Caption>
        <TextInput
          value={account} onChangeText={(v) => setAccount(v.toUpperCase())} testID="input-account"
          placeholder={t('transfer.recipientPlaceholder')} placeholderTextColor={colors.disabled}
          autoCapitalize="characters" autoCorrect={false} style={styles.input}
          accessibilityLabel={t('transfer.recipient')}
          onFocus={() => setFocus('account')} onBlur={() => setFocus(null)}
        />
      </Reveal>

      {demo.onCall || demo.screenShare ? (
        <Reveal index={2} style={styles.signals}>
          <View testID="signals-note" style={styles.signalsInner}>
            {demo.onCall ? (
              <View style={styles.signal}>
                <Icon name="phone" size={20} color={colors.primary} />
                <Text style={styles.signalText}>{t('transfer.signalCall')}</Text>
              </View>
            ) : null}
            {demo.screenShare ? (
              <View style={styles.signal}>
                <Icon name="screen" size={20} color={colors.primary} />
                <Text style={styles.signalText}>{t('transfer.signalScreen')}</Text>
              </View>
            ) : null}
          </View>
        </Reveal>
      ) : null}

      <ErrorNote text={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 4, backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: space.md + 4,
    paddingTop: space.md, paddingBottom: space.sm + 2, borderWidth: 2, borderColor: 'transparent', ...shadow.card,
  },
  fieldFocus: { borderColor: colors.primary },
  amountField: { paddingBottom: space.md },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    flex: 1, minHeight: 52, minWidth: 0, ...noOutline, padding: 0,
    fontFamily: fonts.semibold, fontSize: font.lead, letterSpacing: 0.2, color: colors.ink,
  },
  amount: {
    fontFamily: fonts.extra, fontSize: font.huge, minHeight: 64, letterSpacing: -1.4, fontVariant: ['tabular-nums'],
  },
  currency: { fontFamily: fonts.bold, fontSize: font.title + 4, color: colors.inkFaint },
  hint: { fontFamily: fonts.regular, fontSize: font.small, lineHeight: 22, color: colors.inkSoft },
  signals: { backgroundColor: colors.primarySoft, borderRadius: radius.button, padding: space.md },
  signalsInner: { gap: space.sm },
  signal: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  signalText: { flex: 1, fontFamily: fonts.medium, fontSize: font.small, lineHeight: 23, color: colors.primary },
});
