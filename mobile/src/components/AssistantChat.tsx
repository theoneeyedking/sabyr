import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../api/client';
import type { AssistantResponse, ChatMessage } from '../api/types';
import { useApp } from '../state/AppContext';
import { colors, font, radius, space } from '../theme';
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
      <Text style={styles.title}>{t('chat.title')}</Text>

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
        <View style={styles.typing} testID="chat-typing">
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.note}>{t('chat.typing')}</Text>
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
              <Pressable
                key={q} disabled={busy} onPress={() => void send(q)} testID={`chat-quick-${i}`}
                accessibilityRole="button" style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
              >
                <Text style={styles.chipText}>{q}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.inputRow}>
            <TextInput
              value={text} onChangeText={setText} placeholder={t('chat.placeholder')}
              placeholderTextColor={colors.inkSoft} style={styles.input} multiline testID="chat-input"
              accessibilityLabel={t('chat.placeholder')}
            />
            <Pressable
              onPress={() => void send(text)} disabled={busy || !text.trim()} testID="chat-send"
              accessibilityRole="button" accessibilityLabel={t('chat.send')}
              style={[styles.send, (busy || !text.trim()) && styles.sendOff]}
            >
              <Text style={styles.sendArrow}>➤</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  title: { fontSize: font.lead, fontWeight: '700', color: colors.ink },
  bubble: { maxWidth: '92%', borderRadius: 18, paddingHorizontal: space.md, paddingVertical: 12 },
  bubbleAssistant: { alignSelf: 'flex-start', backgroundColor: colors.primarySoft, borderTopLeftRadius: 6 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderTopRightRadius: 6 },
  author: { fontSize: 14, color: '#C9D8E8', marginBottom: 2 },
  msg: { fontSize: font.body, lineHeight: 27, color: colors.ink },
  msgUser: { color: colors.onPrimary },
  typing: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  note: { fontSize: font.small, lineHeight: 22, color: colors.inkSoft },
  unavailable: { gap: space.sm },
  error: { fontSize: font.small + 1, lineHeight: 23, color: '#4A3100', fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  chip: {
    minHeight: 54, paddingHorizontal: 22, borderRadius: radius.chip, justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary,
  },
  chipText: { fontSize: font.body, fontWeight: '700', color: colors.primary },
  pressed: { opacity: 0.75 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: {
    flex: 1, minHeight: 58, maxHeight: 140, borderRadius: radius.button, borderWidth: 2, borderColor: colors.line,
    backgroundColor: colors.surface, paddingHorizontal: space.md, paddingVertical: 14,
    fontSize: font.body, color: colors.ink,
  },
  send: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendOff: { backgroundColor: colors.disabled },
  sendArrow: { fontSize: 24, color: colors.onPrimary },
});
