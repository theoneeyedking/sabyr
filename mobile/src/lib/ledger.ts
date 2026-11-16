import type { LedgerInfo } from '../api/types';

/** Организации Fabric test-network: Org1MSP — Банк А, Org2MSP — Банк Б. */
const MSP_BANKS: Record<string, string> = { org1msp: 'Банк А', org2msp: 'Банк Б' };

/** Название банка по идентификатору из реестра: «Org1MSP», «A», «bank_b» → «Банк А» / «Банк Б». */
export function bankLabel(bankId: string | undefined | null): string {
  const id = (bankId ?? '').trim();
  if (MSP_BANKS[id.toLowerCase()]) return MSP_BANKS[id.toLowerCase()];
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
