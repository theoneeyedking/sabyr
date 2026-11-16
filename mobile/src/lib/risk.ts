import type { RiskLevel } from '../api/types';

/** Уровень риска по баллу — те же пороги, что на сервере (< 40, 40–70, > 70). */
export function levelOfScore(score: number): RiskLevel {
  if (score > 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/** Имя без фамилии: «Данияр Сейткали» → «Данияр». */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}
