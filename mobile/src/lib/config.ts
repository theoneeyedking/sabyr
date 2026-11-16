/** Адрес API по умолчанию: EXPO_PUBLIC_API_URL, иначе эмулятор Android (10.0.2.2) или localhost. */
export function defaultApiUrl(platform: string, envUrl: string | undefined): string {
  const fromEnv = (envUrl ?? '').trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return platform === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

/** Демо-счета для быстрой подстановки в форму перевода. */
export const DEMO_ACCOUNTS = {
  drop: 'KZ11SBA0000000007777',
  friend: 'KZ22SBA0000000001111',
} as const;
