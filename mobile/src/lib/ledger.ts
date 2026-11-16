import type { LedgerInfo } from '../api/types';

/** Название банка по идентификатору из реестра: «A», «BankAMSP», «bank_b» → «Банк А» / «Банк Б». */
export function bankLabel(bankId: string | undefined | null): string {
  const id = (bankId ?? '').trim();
  const m = /^(?:bank[_-]?)?([ab])(?:msp)?$/i.exec(id);
  if (!m) return id;
  return m[1].toUpperCase() === 'A' ? 'Банк А' : 'Банк Б';
}

/** Банки, отметившие счёт (без повторов). */
export function flaggingBanks(ledger: LedgerInfo | undefined): string[] {
  if (!ledger?.flagged) return [];
  const names = (ledger.flags ?? [])
    .map((f) => bankLabel(String(f.bank_name ?? f.bankId ?? f.bank ?? f.bank_code ?? f.flagged_by ?? '')))
    .filter(Boolean);
  return [...new Set(names)];
}
