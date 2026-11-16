import { dictionaries, errorText, translate } from '../../i18n';
import { kz } from '../../i18n/kz';
import { ru } from '../../i18n/ru';

const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('i18n', () => {
  it('в kz и ru одинаковый набор ключей', () => {
    expect(Object.keys(kz).sort()).toEqual(Object.keys(ru).sort());
  });

  it('нет пустых текстов', () => {
    for (const lang of ['ru', 'kz'] as const) {
      for (const [key, value] of Object.entries(dictionaries[lang])) {
        expect(`${lang}:${key}:${value.trim().length > 0}`).toBe(`${lang}:${key}:true`);
      }
    }
  });

  it('параметры {…} совпадают в обоих языках', () => {
    for (const key of Object.keys(ru) as (keyof typeof ru)[]) {
      expect(`${key}:${params(kz[key]).join()}`).toBe(`${key}:${params(ru[key]).join()}`);
    }
  });

  it('казахские тексты действительно переведены', () => {
    // слова, которые в обоих языках пишутся одинаково
    const sameInBoth = ['confirm.bank', 'demo.nativeTelephony'];
    const same = (Object.keys(ru) as (keyof typeof ru)[])
      .filter((k) => !sameInBoth.includes(k) && ru[k] === kz[k] && /[а-яё]{4,}/i.test(ru[k]));
    expect(same).toEqual([]);
  });

  it('подставляет параметры', () => {
    expect(translate('ru', 'home.greeting', { name: 'Гульнара' })).toBe('Здравствуйте, Гульнара!');
    expect(translate('kz', 'final.declinedText', { name: 'Данияр' }))
      .toBe('Данияр аударымды қабылдамады, ақша шотыңызда қалды.');
  });

  it('ошибки: известный код и запасной текст', () => {
    expect(errorText('ru', 'insufficient_funds')).toBe(ru['error.insufficient_funds']);
    expect(errorText('kz', 'cooldown_active')).toBe(kz['error.cooldown_active']);
    expect(errorText('ru', 'что-то-новое')).toBe(ru['error.unknown']);
  });
});
