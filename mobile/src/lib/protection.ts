import type { HistoryItem } from '../api/types';

/** Что Sabyr сделал для клиента: считается из его истории переводов, без отдельного запроса. */
export type ProtectionStats = {
  /** Сколько исходящих переводов прошло оценку Sabyr. */
  checked: number;
  /** Сколько переводов остановлено после предупреждения (отменены клиентом или отклонены доверенным лицом). */
  stopped: number;
  /** Сумма остановленных переводов — деньги, которые остались на счёте. */
  saved: number;
};

export function protectionStats(items: HistoryItem[]): ProtectionStats {
  const stats: ProtectionStats = { checked: 0, stopped: 0, saved: 0 };
  for (const item of items) {
    if (item.direction !== 'out' || item.risk_score == null) continue;
    stats.checked += 1;
    const warned = item.risk_level === 'medium' || item.risk_level === 'high';
    if (warned && (item.status === 'cancelled' || item.status === 'declined')) {
      stats.stopped += 1;
      stats.saved += Number(item.amount) || 0;
    }
  }
  return stats;
}

export type Recipient = { account: string; name: string };

/** Последние получатели, которым перевод действительно дошёл: без повторов, свежие первыми. */
export function recentRecipients(items: HistoryItem[], limit = 3): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const item of items) {
    if (item.direction !== 'out' || item.status !== 'confirmed') continue;
    const account = item.counterparty.account;
    if (seen.has(account)) continue;
    seen.add(account);
    out.push({ account, name: item.counterparty.name });
    if (out.length >= limit) break;
  }
  return out;
}

export type DayGroup<T> = { key: string; kind: 'today' | 'yesterday' | 'date'; date: Date; items: T[] };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Группирует записи по календарным дням, сохраняя порядок: «сегодня», «вчера», затем даты. */
export function groupByDay<T extends { created_at: string }>(items: T[], now: Date = new Date()): DayGroup<T>[] {
  const today = startOfDay(now);
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const date = new Date(item.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const day = startOfDay(date);
    const key = String(day);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const diff = Math.round((today - day) / 86_400_000);
      group = { key, kind: diff === 0 ? 'today' : diff === 1 ? 'yesterday' : 'date', date, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
