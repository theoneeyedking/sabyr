/** Обратный отсчёт «14:59»; для часа и больше — «1:05:09». */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * Момент окончания паузы по часам устройства.
 * Берём `cooldown_seconds_left` (не зависит от расхождения часов телефона и сервера),
 * а `cooldown_until` — только как запасной вариант.
 */
export function cooldownDeadline(
  secondsLeft: number | null | undefined,
  cooldownUntil: string | null | undefined,
  receivedAt: number,
): number | null {
  if (typeof secondsLeft === 'number' && secondsLeft > 0) return receivedAt + secondsLeft * 1000;
  if (!cooldownUntil) return null;
  if (typeof secondsLeft === 'number') return null; // сервер сказал: пауза закончилась
  const until = Date.parse(cooldownUntil);
  return Number.isFinite(until) && until > receivedAt ? until : null;
}

/** Сколько секунд осталось до момента deadline. */
export function secondsUntil(deadline: number | null, now: number): number {
  if (deadline == null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
