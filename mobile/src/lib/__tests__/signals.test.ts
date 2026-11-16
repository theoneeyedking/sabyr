import { mergeSignals, sessionSeconds } from '../signals';

const off = { onCall: false, screenShare: false };

describe('mergeSignals', () => {
  it('нативный звонок без демо-переключателей → source native', () => {
    expect(mergeSignals({ callActive: true, screenShared: false }, off, 42)).toEqual({
      on_call: true, screen_share: false, session_seconds: 42, source: 'native',
    });
  });

  it('устройство молчит, переключатель включён → значение из демо-меню', () => {
    expect(mergeSignals({ callActive: false, screenShared: false }, { onCall: true, screenShare: false }, 10)).toEqual({
      on_call: true, screen_share: false, session_seconds: 10, source: 'demo',
    });
  });

  it('значения объединяются по ИЛИ', () => {
    const s = mergeSignals({ callActive: true, screenShared: false }, { onCall: false, screenShare: true }, 3);
    expect(s.on_call).toBe(true);
    expect(s.screen_share).toBe(true);
    expect(s.source).toBe('demo');
  });

  it('на web/iOS (unknown) сигналы ложные, source demo', () => {
    expect(mergeSignals({ callActive: 'unknown', screenShared: 'unknown' }, off, 7.6)).toEqual({
      on_call: false, screen_share: false, session_seconds: 8, source: 'demo',
    });
  });

  it('спокойное устройство без переключателей → native, всё false', () => {
    expect(mergeSignals({ callActive: false, screenShared: false }, off, 0)).toEqual({
      on_call: false, screen_share: false, session_seconds: 0, source: 'native',
    });
  });

  it('session_seconds не бывает отрицательным', () => {
    expect(mergeSignals({ callActive: false, screenShared: false }, off, -5).session_seconds).toBe(0);
  });
});

describe('sessionSeconds', () => {
  it('секунды от начала сессии', () => {
    expect(sessionSeconds(1000, 13_400)).toBe(12);
    expect(sessionSeconds(5000, 1000)).toBe(0);
  });
});
