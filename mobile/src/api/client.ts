import type {
  AssistantResponse, Client, DemoUser, HistoryItem, IncomingRequest, Lang, TransferState,
} from './types';
import type { TransferSignals } from '../lib/signals';

/** Ошибка API: код из `{"error": {"code", "message"}}` либо network / http_<статус>. */
export class ApiError extends Error {
  code: string;
  status: number;
  extra: Record<string, unknown>;

  constructor(code: string, message: string, status: number, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export type ApiConfig = { baseUrl: string; token: string | null; lang: Lang };

/** Заголовок Accept-Language: сервер понимает kk и ru. */
export function acceptLanguage(lang: Lang): string {
  return lang === 'kz' ? 'kk' : 'ru';
}

export function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.trim().replace(/\/+$/, '') + path;
}

const TIMEOUT_MS = 20000;

async function request<T>(cfg: ApiConfig, method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': acceptLanguage(cfg.lang),
  };
  if (cfg.token) headers.Authorization = `Token ${cfg.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(joinUrl(cfg.baseUrl, path), {
      method, headers, signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network', 'Нет связи с сервером', 0);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null; // не JSON (например, HTML-страница 404/500)
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    if (err && typeof err === 'object') {
      const { code, message, ...extra } = err as Record<string, unknown>;
      throw new ApiError(String(code ?? `http_${res.status}`), String(message ?? ''), res.status, extra);
    }
    const detail = (data as { detail?: string } | null)?.detail;
    throw new ApiError(res.status === 401 ? 'unauthorized' : `http_${res.status}`, String(detail ?? ''), res.status);
  }
  return data as T;
}

/** Все вызовы API Sabyr, привязанные к текущим адресу, токену и языку. */
export function createApi(cfg: ApiConfig) {
  return {
    demoUsers: () => request<{ users: DemoUser[] }>(cfg, 'GET', '/api/auth/demo-users').then((r) => r.users),
    login: (clientId: number) =>
      request<{ token: string; client: Client }>(cfg, 'POST', '/api/auth/login', { client_id: clientId }),
    me: () => request<Client>(cfg, 'GET', '/api/me'),
    setLang: (lang: Lang) => request<Client>(cfg, 'PATCH', '/api/me', { lang }),
    history: (limit = 30) =>
      request<{ items: HistoryItem[] }>(cfg, 'GET', `/api/transfers/history?limit=${limit}`).then((r) => r.items),
    check: (recipientAccount: string, amount: number, signals: TransferSignals) =>
      request<TransferState>(cfg, 'POST', '/api/transfers/check', {
        recipient_account: recipientAccount, amount: String(amount), signals,
      }),
    transfer: (id: string) => request<TransferState>(cfg, 'GET', `/api/transfers/${id}`),
    confirm: (id: string, decision: 'confirm' | 'cancel') =>
      request<TransferState>(cfg, 'POST', '/api/transfers/confirm', { transfer_id: id, decision }),
    reportFraud: (id: string) =>
      request<TransferState>(cfg, 'POST', '/api/transfers/report', { transfer_id: id }),
    incoming: () => request<{ items: IncomingRequest[] }>(cfg, 'GET', '/api/trusted/incoming').then((r) => r.items),
    respond: (requestId: number, decision: 'approve' | 'decline') =>
      request<IncomingRequest>(cfg, 'POST', '/api/trusted/respond', { request_id: requestId, decision }),
    askTrusted: (transferId: string) =>
      request<IncomingRequest>(cfg, 'POST', '/api/trusted/request', { transfer_id: transferId }),
    assistant: (transferId: string, text?: string) =>
      request<AssistantResponse>(cfg, 'POST', '/api/assistant/message',
        text ? { transfer_id: transferId, text } : { transfer_id: transferId }),
  };
}

export type Api = ReturnType<typeof createApi>;
