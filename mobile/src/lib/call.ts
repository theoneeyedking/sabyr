import { Linking } from 'react-native';

/** Номер банка для кнопки «Позвонить в банк»: EXPO_PUBLIC_BANK_PHONE, в демо — условный номер. */
export const BANK_PHONE = (process.env.EXPO_PUBLIC_BANK_PHONE ?? '').trim() || '+7 700 000 00 00';

/** Ссылка tel: для набора номера — только цифры и ведущий плюс. */
export function telUrl(phone: string): string {
  const clean = phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return `tel:${clean}`;
}

/** Открывает набор номера. Звонок начинает сам человек; если набор недоступен — молча ничего не делает. */
export function callNumber(phone: string): void {
  Linking.openURL(telUrl(phone)).catch(() => {});
}

/** Время «21:40» из ISO-даты; пустая строка, если дата не разобралась. */
export function clockTime(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Похоже ли введённое на номер телефона (а не на номер счёта). */
export function looksLikePhone(text: string): boolean {
  const digits = text.replace(/\D/g, '');
  return /^\+?[\d\s()\-]+$/.test(text.trim()) && (digits.length === 10 || (digits.length === 11 && /^[78]/.test(digits)));
}
