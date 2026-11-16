// Форматирование сумм: «1 500 000 ₸». Пробелы неразрывные, чтобы сумма не переносилась по строкам.
const NBSP = ' ';

/** Разбивает целую часть на тройки: 1500000 → «1 500 000». */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** «1 500 000 ₸»; тиын показываются только если они есть: «1 250,50 ₸». */
export function formatMoney(value: string | number | null | undefined): string {
  const num = typeof value === 'number' ? value : Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(num)) return `0${NBSP}₸`;
  const negative = num < 0;
  const cents = Math.round(Math.abs(num) * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  const body = groupDigits(String(whole)) + (frac ? ',' + String(frac).padStart(2, '0') : '');
  return `${negative ? '−' : ''}${body}${NBSP}₸`;
}

/** Ввод суммы: оставляет только цифры и группирует их («1500000» → «1 500 000»). */
export function formatAmountInput(text: string): string {
  const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12);
  return groupDigits(digits);
}

/** Число из поля ввода суммы; 0 — если пусто. */
export function parseAmountInput(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

/** Номер счёта группами по 4 символа: «KZ11 SBA0 0000 0000 7777». */
export function formatAccount(account: string): string {
  return account.replace(/\s/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');
}

/** Нормализация введённого номера счёта перед отправкой. */
export function normalizeAccount(text: string): string {
  return text.replace(/\s/g, '').toUpperCase();
}
