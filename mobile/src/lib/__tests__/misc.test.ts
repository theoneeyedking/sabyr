import { defaultApiUrl } from '../config';
import { bankLabel, flaggingBanks } from '../ledger';
import { firstName, levelOfScore } from '../risk';

describe('defaultApiUrl', () => {
  it('берёт EXPO_PUBLIC_API_URL, иначе адрес по платформе', () => {
    expect(defaultApiUrl('android', undefined)).toBe('http://10.0.2.2:8000');
    expect(defaultApiUrl('web', '')).toBe('http://localhost:8000');
    expect(defaultApiUrl('android', 'http://192.168.1.5:8000/')).toBe('http://192.168.1.5:8000');
  });
});

describe('реестр', () => {
  it('название банка по идентификатору', () => {
    expect(bankLabel('B')).toBe('Банк Б');
    expect(bankLabel('BankAMSP')).toBe('Банк А');
    expect(bankLabel('Halyk')).toBe('Halyk');
  });

  it('список банков, отметивших счёт', () => {
    expect(flaggingBanks({ status: 'ok', flagged: true, flags: [{ bankId: 'B', reason: 'safe_account' }, { bankId: 'B' }] }))
      .toEqual(['Банк Б']);
    expect(flaggingBanks({ status: 'disabled', flagged: false, flags: [] })).toEqual([]);
    expect(flaggingBanks(undefined)).toEqual([]);
  });
});

describe('риск', () => {
  it('пороги уровня совпадают с сервером', () => {
    expect(levelOfScore(39)).toBe('low');
    expect(levelOfScore(40)).toBe('medium');
    expect(levelOfScore(70)).toBe('medium');
    expect(levelOfScore(71)).toBe('high');
  });

  it('имя без фамилии', () => {
    expect(firstName('Данияр Сейткали')).toBe('Данияр');
    expect(firstName(undefined)).toBe('');
  });
});
