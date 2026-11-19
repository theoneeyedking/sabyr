import { clockTime, looksLikePhone, telUrl } from '../call';

describe('call', () => {
  it('собирает ссылку tel: из номера в любом написании', () => {
    expect(telUrl('+7 (700) 000-00-35')).toBe('tel:+77000000035');
    expect(telUrl('8 700 000 00 35')).toBe('tel:87000000035');
  });

  it('отличает телефон от номера счёта', () => {
    expect(looksLikePhone('+7 700 000 00 59')).toBe(true);
    expect(looksLikePhone('87000000059')).toBe(true);
    expect(looksLikePhone('7000000059')).toBe(true);
    expect(looksLikePhone('KZ22SBA0000000001111')).toBe(false);
    expect(looksLikePhone('12345')).toBe(false);
  });

  it('показывает время из ISO-даты', () => {
    const d = new Date(2026, 10, 19, 9, 5);
    expect(clockTime(d.toISOString())).toBe('09:05');
    expect(clockTime('мусор')).toBe('');
    expect(clockTime(null)).toBe('');
  });
});
