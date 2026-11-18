import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../api/client';
import type { AssistantResponse, ChatMessage } from '../api/types';
import { useApp } from '../state/AppContext';
import { colors, font, fonts, radius, space, noOutline } from '../theme';
import { Icon } from './Icon';
import { Mark } from './Logo';
import { PressableScale, TypingDots } from './Motion';
import { Button } from './ui';

/**
 * Диалог с помощником Sabyr. Стартует сам при открытии экрана (POST без текста — идемпотентно),
 * дальше отправляет ответы клиента. О каждом ответе сервера сообщает наверх через onUpdate,
 * чтобы экран обновил can_confirm.
 */
export function AssistantChat({
  transferId, active, onUpdate,
}: {
  transferId: string;
  /** false — перевод завершён: поле ввода скрыто, новые сообщения не отправляются. */
  active: boolean;
  onUpdate: (res: AssistantResponse) => void;
}) {
  const { api, t, describeError } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [done, setDone] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const started = useRef(false);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const apply = useCallback((res: AssistantResponse) => {
    setMessages(res.messages ?? []);
    setDone(!!res.done);
    setDegraded(!!res.degraded);
    setUnavailable(false);
    setError(null);
    onUpdateRef.current(res);
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      apply(await api.assistant(transferId));
    } catch {
      setUnavailable(true); // сервис помощника не отвечает — остальной экран работает без него
    } finally {
      setBusy(false);
    }
  }, [api, apply, transferId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  const send = async (value: string) => {
    const clean = value.trim();
    if (!clean || busy || done || !active) return;
    setBusy(true);
    setError(null);
    setText('');
    setMessages((prev) => [...prev, { role: 'user', text: clean }]);
    try {
      apply(await api.assistant(transferId, clean));
    } catch (e) {
      setMessages((prev) => prev.slice(0, -1));
      setText(clean);
      if (e instanceof ApiError && e.code === 'dialog_finished') setDone(true);
      else setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const quick = [t('chat.quickYes'), t('chat.quickNo'), t('chat.quickUnsure')];
  const canType = active && !done && !unavailable && messages.length > 0;

  return (
    <View style={styles.wrap} testID="assistant-chat">
      <View style={styles.head}>
        <Mark size={34} />
        <Text style={styles.title}>{t('chat.title')}</Text>
      </View>

      {messages.map((m, i) => (
        <View
          key={i} testID={`chat-${m.role}`}
          style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}
        >
          {m.role === 'user' ? <Text style={styles.author}>{t('chat.you')}</Text> : null}
          <Text style={[styles.msg, m.role === 'user' && styles.msgUser]}>{m.text}</Text>
        </View>
      ))}

      {busy ? (
        <View style={styles.typing} testID="chat-typing" accessibilityLabel={t('chat.typing')}>
          <TypingDots color={colors.inkSoft} />
        </View>
      ) : null}

      {unavailable && !busy ? (
        <View style={styles.unavailable} testID="chat-unavailable">
          <Text style={styles.note}>{t('chat.unavailable')}</Text>
          <Button label={t('common.retry')} variant="secondary" onPress={() => void start()} />
        </View>
      ) : null}

      {degraded ? <Text style={styles.note} testID="chat-degraded">{t('chat.degraded')}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {done ? <Text style={styles.note} testID="chat-done">{t('chat.done')}</Text> : null}

      {canType ? (
        <>
          <View style={styles.chips}>
            {quick.map((q, i) => (
              <PressableScale
                key={q} disabled={busy} onPress={() => void send(q)} testID={`chat-quick-${i}`}
                accessibilityRole="button" style={styles.chip} scaleTo={0.94}
              >
                <Text style={styles.chipText}>{q}</Text>
              </PressableScale>
            ))}
          </View>
          <View style={styles.inputRow}>
            <TextInput
              value={text} onChangeText={setText} placeholder={t('chat.placeholder')}
              placeholderTextColor={colors.inkFaint} style={styles.input} multiline testID="chat-input"
              accessibilityLabel={t('chat.placeholder')}
            />
            <Pressable
              onPress={() => void send(text)} disabled={busy || !text.trim()} testID="chat-send"
              accessibilityRole="button" accessibilityLabel={t('chat.send')}
              style={[styles.send, (busy || !text.trim()) && styles.sendOff]}
            >
              <Icon name="arrowUp" size={24} color={colors.onPrimary} stroke={2.4} />
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm + 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  title: { flex: 1, fontFamily: fonts.bold, fontSize: font.lead, letterSpacing: -0.3, color: colors.ink },
  bubble: { maxWidth: '90%', borderRadius: 22, paddingHorizontal: space.md + 2, paddingVertical: 13 },
  bubbleAssistant: { alignSelf: 'flex-start', backgroundColor: colors.surfaceSoft, borderTopLeftRadius: 8,
    borderWidth: 1, borderColor: colors.line },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 8 },
  author: { fontFamily: fonts.medium, fontSize: font.caption, color: colors.onPrimarySoft, marginBottom: 2 },
  msg: { fontFamily: fonts.regular, fontSize: font.body, lineHeight: 27, color: colors.ink },
  msgUser: { color: colors.onPrimary },
  typing: {
    alignSelf: 'flex-start', backgroundColor: colors.surfaceSoft, borderRadius: 22, borderTopLeftRadius: 8,
    borderWidth: 1, borderColor: colors.line, paddingHorizontal: space.md + 2, paddingVertical: 14,
  },
  note: { fontFamily: fonts.regular, fontSize: font.small - 1, lineHeight: 21, color: colors.inkSoft },
  unavailable: { gap: space.sm },
  error: { fontFamily: fonts.medium, fontSize: font.small, lineHeight: 23, color: '#4A3100' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  chip: {
    minHeight: 52, paddingHorizontal: 22, borderRadius: radius.chip, justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  chipText: { fontFamily: fonts.semibold, fontSize: font.body, color: colors.primary },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: 6, paddingLeft: space.md,
    borderRadius: 32, backgroundColor: colors.surfaceSoft, borderWidth: 1.5, borderColor: colors.line,
  },
  input: {
    flex: 1, minHeight: 50, maxHeight: 140, paddingVertical: 12, ...noOutline,
    fontFamily: fonts.regular, fontSize: font.body, color: colors.ink,
  },
  send: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendOff: { backgroundColor: colors.disabled },
});
