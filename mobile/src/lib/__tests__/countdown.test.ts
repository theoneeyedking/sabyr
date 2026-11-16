import { cooldownDeadline, formatCountdown, secondsUntil } from '../countdown';

describe('formatCountdown', () => {
  it('минуты и секунды с ведущими нулями', () => {
    expect(formatCountdown(900)).toBe('15:00');
    expect(formatCountdown(899)).toBe('14:59');
    expect(formatCountdown(61)).toBe('01:01');
    expect(formatCountdown(5)).toBe('00:05');
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('округляет вверх и не уходит в минус', () => {
    expect(formatCountdown(0.2)).toBe('00:01');
    expect(formatCountdown(-10)).toBe('00:00');
    expect(formatCountdown(NaN)).toBe('00:00');
  });

  it('показывает часы, если пауза дольше часа', () => {
    expect(formatCountdown(3909)).toBe('1:05:09');
  });
});

describe('cooldownDeadline', () => {
  const now = 1_000_000;

  it('считает от cooldown_seconds_left по часам устройства', () => {
    expect(cooldownDeadline(900, '2099-01-01T00:00:00Z', now)).toBe(now + 900_000);
  });

  it('пауза закончилась или её не было', () => {
    expect(cooldownDeadline(0, '2000-01-01T00:00:00Z', now)).toBeNull();
    expect(cooldownDeadline(0, null, now)).toBeNull();
    expect(cooldownDeadline(undefined, null, now)).toBeNull();
  });

  it('без seconds_left берёт cooldown_until', () => {
    const until = new Date(now + 60_000).toISOString();
    expect(cooldownDeadline(undefined, until, now)).toBe(now + 60_000);
    expect(cooldownDeadline(null, new Date(now - 1).toISOString(), now)).toBeNull();
  });
});

describe('secondsUntil', () => {
  it('секунды до дедлайна, не меньше нуля', () => {
    expect(secondsUntil(10_500, 10_000)).toBe(1);
    expect(secondsUntil(70_000, 10_000)).toBe(60);
    expect(secondsUntil(5_000, 10_000)).toBe(0);
    expect(secondsUntil(null, 10_000)).toBe(0);
  });
});
