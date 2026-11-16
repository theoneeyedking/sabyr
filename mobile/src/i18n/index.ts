import type { Lang } from '../api/types';
import { kz } from './kz';
import { ru, type I18nKey } from './ru';

export type { I18nKey } from './ru';

export const dictionaries: Record<Lang, Record<I18nKey, string>> = { ru, kz };

export type Translate = (key: I18nKey, params?: Record<string, string | number>) => string;

/** Перевод ключа с подстановкой параметров вида {name}. Нет ключа в kz — берётся русский текст. */
export function translate(lang: Lang, key: I18nKey, params?: Record<string, string | number>): string {
  const template = dictionaries[lang]?.[key] ?? ru[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match);
}

/** Текст ошибки API по её коду; для незнакомых кодов — общий текст. */
export function errorText(lang: Lang, code: string): string {
  const key = `error.${code}` as I18nKey;
  return key in ru ? translate(lang, key) : translate(lang, 'error.unknown');
}

/** Дата и время в коротком виде: «16.11.2026, 15:04». */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
