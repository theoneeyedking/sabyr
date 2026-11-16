import { formatAccount, formatAmountInput, formatMoney, normalizeAccount, parseAmountInput } from '../money';

const NBSP = ' ';
const plain = (s: string) => s.split(NBSP).join(' ');

describe('formatMoney', () => {
  it('группирует разряды и добавляет знак тенге', () => {
    expect(plain(formatMoney('1500000.00'))).toBe('1 500 000 ₸');
    expect(plain(formatMoney(20000))).toBe('20 000 ₸');
    expect(plain(formatMoney('999'))).toBe('999 ₸');
    expect(plain(formatMoney(0))).toBe('0 ₸');
  });

  it('показывает тиын только когда они есть', () => {
    expect(plain(formatMoney('1250.50'))).toBe('1 250,50 ₸');
    expect(plain(formatMoney('1250.05'))).toBe('1 250,05 ₸');
    expect(plain(formatMoney('2300000.00'))).toBe('2 300 000 ₸');
  });

  it('использует неразрывные пробелы, чтобы сумма не переносилась', () => {
    expect(formatMoney(1500000)).toBe(`1${NBSP}500${NBSP}000${NBSP}₸`);
    expect(formatMoney(1500000)).not.toContain(' ');
  });

  it('не падает на мусоре и отрицательных значениях', () => {
    expect(plain(formatMoney(undefined))).toBe('0 ₸');
    expect(plain(formatMoney('abc'))).toBe('0 ₸');
    expect(plain(formatMoney(-1500))).toBe('−1 500 ₸');
  });
});

describe('ввод суммы', () => {
  it('форматирует по мере набора и разбирает обратно', () => {
    expect(plain(formatAmountInput('1500000'))).toBe('1 500 000');
    expect(plain(formatAmountInput('1 500 0000'))).toBe('15 000 000');
    expect(formatAmountInput('00200')).toBe('200');
    expect(formatAmountInput('абв')).toBe('');
    expect(parseAmountInput(formatAmountInput('1500000'))).toBe(1500000);
    expect(parseAmountInput('')).toBe(0);
  });
});

describe('номер счёта', () => {
  it('нормализуется и группируется по четыре символа', () => {
    expect(normalizeAccount(' kz11 sba0 0000 0000 7777 ')).toBe('KZ11SBA0000000007777');
    expect(formatAccount('KZ11SBA0000000007777')).toBe('KZ11 SBA0 0000 0000 7777');
  });
});
