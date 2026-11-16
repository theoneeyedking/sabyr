import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import * as SabyrSignals from '../../modules/sabyr-signals';
import type { DeviceSignals } from '../../modules/sabyr-signals';
import { ApiError, createApi, type Api } from '../api/client';
import type { Client, Lang } from '../api/types';
import { errorText, translate, type Translate } from '../i18n';
import { defaultApiUrl } from '../lib/config';
import { mergeSignals, sessionSeconds, type DemoToggles, type TransferSignals } from '../lib/signals';

const KEYS = { apiUrl: 'sabyr.apiUrl', token: 'sabyr.token', lang: 'sabyr.lang' };

export const DEFAULT_API_URL = defaultApiUrl(Platform.OS, process.env.EXPO_PUBLIC_API_URL);

type AppContextValue = {
  ready: boolean;
  api: Api;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  token: string | null;
  client: Client | null;
  setClient: (c: Client) => void;
  login: (clientId: number) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
  /** Текст ошибки для показа; при 401 заодно завершает сессию. */
  describeError: (e: unknown) => string;
  demo: DemoToggles;
  setDemo: (d: DemoToggles) => void;
  device: DeviceSignals;
  refreshDevice: () => void;
  /** Сигналы, которые уйдут в /api/transfers/check прямо сейчас. */
  currentSignals: () => TransferSignals;
  /** Счёт, выбранный в демо-меню для подстановки в форму перевода. */
  prefillAccount: string | null;
  setPrefillAccount: (a: string | null) => void;
};

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp вне AppProvider');
  return v;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [apiUrl, setApiUrlState] = useState(DEFAULT_API_URL);
  const [token, setToken] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [lang, setLangState] = useState<Lang>('kz');
  const [demo, setDemo] = useState<DemoToggles>({ onCall: false, screenShare: false });
  const [device, setDevice] = useState<DeviceSignals>(() => SabyrSignals.getSignals());
  const [prefillAccount, setPrefillAccount] = useState<string | null>(null);
  const sessionStart = useRef(Date.now());

  const api = useMemo(() => createApi({ baseUrl: apiUrl, token, lang }), [apiUrl, token, lang]);

  // Восстановление сохранённых настроек и сессии.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [[, url], [, tok], [, lng]] = await AsyncStorage.multiGet([KEYS.apiUrl, KEYS.token, KEYS.lang]);
        if (!alive) return;
        const base = url || DEFAULT_API_URL;
        if (url) setApiUrlState(url);
        const savedLang: Lang | null = lng === 'kz' || lng === 'ru' ? lng : null;
        if (savedLang) setLangState(savedLang);
        if (tok) {
          try {
            const me = await createApi({ baseUrl: base, token: tok, lang: savedLang ?? 'kz' }).me();
            if (!alive) return;
            setToken(tok);
            setClient(me);
            if (!savedLang) setLangState(me.lang);
          } catch {
            await AsyncStorage.removeItem(KEYS.token); // токен устарел или сервер другой
          }
        }
      } catch {
        // хранилище недоступно — работаем с настройками по умолчанию
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Сигналы устройства: подписка на нативный модуль (на web/iOS — ничего не делает).
  const refreshDevice = useCallback(() => setDevice(SabyrSignals.getSignals()), []);
  useEffect(() => SabyrSignals.addSignalsListener(setDevice), []);

  // Сессия отсчитывается от входа или от возврата в приложение.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sessionStart.current = Date.now();
        refreshDevice();
      }
    });
    return () => sub.remove();
  }, [refreshDevice]);

  const setApiUrl = useCallback((url: string) => {
    const clean = url.trim().replace(/\/+$/, '') || DEFAULT_API_URL;
    setApiUrlState(clean);
    void AsyncStorage.setItem(KEYS.apiUrl, clean).catch(() => {});
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setClient(null);
    setDemo({ onCall: false, screenShare: false });
    setPrefillAccount(null);
    void AsyncStorage.removeItem(KEYS.token).catch(() => {});
  }, []);

  const login = useCallback(async (clientId: number) => {
    const res = await createApi({ baseUrl: apiUrl, token: null, lang }).login(clientId);
    sessionStart.current = Date.now();
    setToken(res.token);
    setClient(res.client);
    setLangState(res.client.lang); // язык интерфейса по умолчанию — язык клиента
    void AsyncStorage.multiSet([[KEYS.token, res.token], [KEYS.lang, res.client.lang]]).catch(() => {});
  }, [apiUrl, lang]);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    setClient(await api.me());
  }, [api, token]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    void AsyncStorage.setItem(KEYS.lang, next).catch(() => {});
    if (token) {
      createApi({ baseUrl: apiUrl, token, lang: next }).setLang(next).then(setClient).catch(() => {});
    }
  }, [apiUrl, token]);

  const t = useCallback<Translate>((key, params) => translate(lang, key, params), [lang]);

  const describeError = useCallback((e: unknown) => {
    if (e instanceof ApiError) {
      if (e.status === 401) logout();
      if (e.status === 400 && e.code === 'http_400') return translate(lang, 'error.invalid');
      return errorText(lang, e.code);
    }
    return translate(lang, 'error.unknown');
  }, [lang, logout]);

  const currentSignals = useCallback(() => {
    const live = SabyrSignals.getSignals();
    return mergeSignals(
      { callActive: live.callActive, screenShared: live.screenShared },
      demo,
      sessionSeconds(sessionStart.current, Date.now()),
    );
  }, [demo]);

  const value: AppContextValue = {
    ready, api, apiUrl, setApiUrl, token, client, setClient, login, logout, refreshMe,
    lang, setLang, t, describeError, demo, setDemo, device, refreshDevice, currentSignals,
    prefillAccount, setPrefillAccount,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
