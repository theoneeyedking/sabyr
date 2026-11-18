import type { HistoryItem } from '../../api/types';
import { formatDay, formatTime } from '../../i18n';
import { groupByDay, protectionStats, recentRecipients } from '../protection';

const item = (over: Partial<HistoryItem>): HistoryItem => ({
  transfer_id: Math.random().toString(36), direction: 'out', amount: '1000.00', status: 'confirmed',
  created_at: '2026-11-18T10:00:00', counterparty: { account: 'KZ1', name: 'Сауле А.' },
  risk_score: null, risk_level: '', ...over,
});

test('считает проверенные и остановленные переводы и сохранённую сумму', () => {
  const stats = protectionStats([
    item({ risk_score: 0, risk_level: 'low' }),                                             // проверен, прошёл
    item({ risk_score: 100, risk_level: 'high', status: 'declined', amount: '1500000.00' }), // остановлен
    item({ risk_score: 55, risk_level: 'medium', status: 'cancelled', amount: '800000' }),   // остановлен
    item({ risk_score: 60, risk_level: 'medium', status: 'confirmed', amount: '5000' }),     // подтверждён после предупреждения
    item({ risk_score: 5, risk_level: 'low', status: 'cancelled', amount: '700' }),          // отменён без предупреждения
    item({ risk_score: 90, risk_level: 'high', status: 'cooldown', amount: '900' }),         // ещё на паузе
    item({}),                                                                                // исторический, без оценки
    item({ direction: 'in', risk_score: null }),
  ]);
  expect(stats).toEqual({ checked: 6, stopped: 2, saved: 2_300_000 });
  expect(protectionStats([])).toEqual({ checked: 0, stopped: 0, saved: 0 });
});

test('недавние получатели: только дошедшие переводы, без повторов, не больше лимита', () => {
  const list = recentRecipients([
    item({ counterparty: { account: 'A', name: 'Сауле А.' } }),
    item({ counterparty: { account: 'DROP', name: 'Ерлан А.' }, status: 'declined' }),
    item({ counterparty: { account: 'B', name: 'Данияр С.' } }),
    item({ counterparty: { account: 'A', name: 'Сауле А.' } }),
    item({ counterparty: { account: 'X', name: 'Работодатель' }, direction: 'in' }),
    item({ counterparty: { account: 'C', name: 'Жанар И.' } }),
    item({ counterparty: { account: 'D', name: 'Асхат К.' } }),
  ]);
  expect(list.map((r) => r.account)).toEqual(['A', 'B', 'C']);
});

test('история группируется по дням: сегодня, вчера, дата', () => {
  const now = new Date(2026, 10, 18, 20, 0);
  const groups = groupByDay([
    item({ created_at: new Date(2026, 10, 18, 19, 25).toISOString() }),
    item({ created_at: new Date(2026, 10, 18, 9, 5).toISOString() }),
    item({ created_at: new Date(2026, 10, 17, 23, 59).toISOString() }),
    item({ created_at: new Date(2026, 10, 13, 12, 36).toISOString() }),
    item({ created_at: 'мусор' }),
  ], now);
  expect(groups.map((g) => [g.kind, g.items.length])).toEqual([['today', 2], ['yesterday', 1], ['date', 1]]);
  expect(formatDay('ru', groups[2].date)).toBe('13 ноября');
  expect(formatDay('kz', groups[2].date)).toBe('13 қараша');
  expect(formatTime(new Date(2026, 10, 18, 9, 5).toISOString())).toBe('09:05');
});
