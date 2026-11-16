// Сведение сигналов устройства и переключателей демо-меню в то, что уходит в /api/transfers/check.
export type SignalValue = boolean | 'unknown';

export type NativeSignals = { callActive: SignalValue; screenShared: SignalValue };
export type DemoToggles = { onCall: boolean; screenShare: boolean };

export type TransferSignals = {
  on_call: boolean;
  screen_share: boolean;
  session_seconds: number;
  source: 'native' | 'demo';
};

/**
 * on_call / screen_share = значение от устройства ИЛИ переключатель демо-меню.
 * source = 'demo', если включён хотя бы один переключатель или устройство ничего не сообщает
 * (web, iOS); иначе 'native'.
 */
export function mergeSignals(native: NativeSignals, demo: DemoToggles, sessionSeconds: number): TransferSignals {
  const nativeKnown = native.callActive !== 'unknown' || native.screenShared !== 'unknown';
  const demoUsed = demo.onCall || demo.screenShare;
  return {
    on_call: native.callActive === true || demo.onCall,
    screen_share: native.screenShared === true || demo.screenShare,
    session_seconds: Math.max(0, Math.round(sessionSeconds)),
    source: demoUsed || !nativeKnown ? 'demo' : 'native',
  };
}

/** Секунды от начала сессии (вход или возврат в приложение) до нажатия «Продолжить». */
export function sessionSeconds(sessionStartedAt: number, now: number): number {
  return Math.max(0, Math.round((now - sessionStartedAt) / 1000));
}
