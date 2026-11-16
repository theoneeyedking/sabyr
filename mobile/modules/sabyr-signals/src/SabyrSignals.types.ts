/** Значение сигнала: true/false — известно от устройства, 'unknown' — платформа не умеет (web, iOS). */
export type SignalValue = boolean | 'unknown';

/** Снимок состояния, который отдаёт нативный модуль (Android). */
export type NativeSignalsSnapshot = {
  callActive: boolean;
  screenShared: boolean;
  /** AudioManager.getMode(): 0 — обычный, 1 — рингтон, 2 — звонок, 3 — VoIP-связь. */
  audioMode: number;
  /** Состояние TelephonyManager; null — нет разрешения READ_PHONE_STATE. */
  telephonyBusy: boolean | null;
  phonePermission: boolean;
  extraDisplays: string[];
};

export type DeviceSignals = {
  /** Доступен ли нативный модуль на этой платформе. */
  available: boolean;
  callActive: SignalValue;
  screenShared: SignalValue;
  /** Сырые данные для демо-меню. */
  raw: NativeSignalsSnapshot | null;
};

export type SabyrSignalsEvents = {
  onSignalsChange: (snapshot: NativeSignalsSnapshot) => void;
};
