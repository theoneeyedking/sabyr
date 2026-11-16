import type { DeviceSignals, NativeSignalsSnapshot, SignalValue } from './src/SabyrSignals.types';
import SabyrSignalsModule from './src/SabyrSignalsModule';

export type { DeviceSignals, NativeSignalsSnapshot, SignalValue } from './src/SabyrSignals.types';

const UNKNOWN: DeviceSignals = { available: false, callActive: 'unknown', screenShared: 'unknown', raw: null };

/** Есть ли нативный модуль (только Android dev build / release). */
export function isAvailable(): boolean {
  return SabyrSignalsModule != null;
}

/** Идёт ли звонок (обычный или VoIP). На web/iOS — 'unknown'. */
export function isCallActive(): SignalValue {
  try {
    return SabyrSignalsModule ? SabyrSignalsModule.isCallActive() : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Включена ли демонстрация / трансляция экрана. На web/iOS — 'unknown'. */
export function isScreenShared(): SignalValue {
  try {
    return SabyrSignalsModule ? SabyrSignalsModule.isScreenShared() : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Полный снимок сигналов; никогда не бросает исключений. */
export function getSignals(): DeviceSignals {
  if (!SabyrSignalsModule) return UNKNOWN;
  try {
    const raw = SabyrSignalsModule.getSignals();
    return { available: true, callActive: raw.callActive, screenShared: raw.screenShared, raw };
  } catch {
    return UNKNOWN;
  }
}

/** Подписка на изменение сигналов. Возвращает функцию отписки (на web/iOS — пустую). */
export function addSignalsListener(listener: (signals: DeviceSignals) => void): () => void {
  if (!SabyrSignalsModule) return () => {};
  const sub = SabyrSignalsModule.addListener('onSignalsChange', (raw: NativeSignalsSnapshot) => {
    listener({ available: true, callActive: raw.callActive, screenShared: raw.screenShared, raw });
  });
  return () => sub.remove();
}
