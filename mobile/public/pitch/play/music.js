/* Фоновая музыка демо: спокойный эмбиент, который синтезируется в браузере (Web Audio), без звуковых файлов.
   Медленные аккорды-«подушки» и редкие тихие «колокольчики». Громкость заметно ниже голоса диктора.
   SabyrMusic.start() — плавно включить, .pause() — плавно приглушить, .setEnabled(false) — выключить совсем. */
window.SabyrMusic = (() => {
  const LEVEL = 0.2;            // общая громкость: музыка примерно на 10–12 дБ тише голоса диктора
  const CHORD = 9;              // секунд на аккорд
  // ре мажор: Dmaj7 – Bm7 – Gmaj7 – A6. Частоты в герцах.
  const CHORDS = [
    [73.42, 146.83, 220.0, 277.18, 369.99],
    [61.74, 123.47, 185.0, 220.0, 293.66],
    [49.0, 98.0, 196.0, 246.94, 369.99],
    [55.0, 110.0, 220.0, 277.18, 369.99],
  ];
  const BELLS = [587.33, 739.99, 880.0, 987.77, 1174.66, 739.99, 659.25, 880.0]; // пентатоника ре мажор

  /** Собирает цепочку: мягкий фильтр, простая реверберация, общий регулятор. Возвращает вход и регулятор. */
  function build(ctx) {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    tone.connect(master);
    // реверберация: затухающий шум вместо записанного зала
    const seconds = 3.2;
    const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    let seed = 12345;
    const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let n = 0; n < data.length; n += 1) data[n] = noise() * Math.pow(1 - n / data.length, 2.6);
    }
    const hall = ctx.createConvolver();
    hall.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    hall.connect(wet);
    wet.connect(tone);
    const input = ctx.createGain();
    input.connect(tone);
    input.connect(hall);
    return { input, master };
  }

  /** Один аккорд: каждая нота — два слегка расстроенных тона с медленным нарастанием и затуханием. */
  function chord(ctx, out, index, at) {
    CHORDS[index % CHORDS.length].forEach((freq, n) => {
      const env = ctx.createGain();
      const peak = n === 0 ? 0.11 : 0.075 / (1 + n * 0.25);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(peak, at + 3.2);
      env.gain.setValueAtTime(peak, at + CHORD - 1);
      env.gain.linearRampToValueAtTime(0, at + CHORD + 3.4);
      env.connect(out);
      // третий тон — на октаву выше: маленькие динамики ноутбука и телефона низ почти не воспроизводят
      [['sine', 0, 1], ['triangle', 5, 1], ['sine', -4, 2]].forEach(([type, cents, octave]) => {
        if (octave === 2 && n === 0) return;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq * octave;
        osc.detune.value = cents + (n % 2 ? 3 : -3);
        const part = ctx.createGain();
        part.gain.value = octave === 2 ? 0.55 : type === 'sine' ? 1 : 0.35;
        osc.connect(part);
        part.connect(env);
        osc.start(at);
        osc.stop(at + CHORD + 3.6);
      });
    });
    // два тихих «колокольчика» на аккорд, в разных местах такта
    [[1.8, index * 2], [5.6, index * 2 + 1]].forEach(([offset, pick]) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = BELLS[pick % BELLS.length];
      const env = ctx.createGain();
      const t = at + offset + (pick % 3) * 0.35;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.075, t + 0.03);
      env.gain.exponentialRampToValueAtTime(0.0004, t + 3.6);
      osc.connect(env);
      env.connect(out);
      osc.start(t);
      osc.stop(t + 3.8);
    });
  }

  let ctx = null;
  let rig = null;
  let next = 0;       // время начала следующего аккорда
  let index = 0;
  let timer = null;
  let enabled = true;

  function tick() {
    while (next < ctx.currentTime + 4) { chord(ctx, rig.input, index, next); next += CHORD; index += 1; }
  }
  function fade(to, seconds) {
    const g = rig.master.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(to, ctx.currentTime + seconds);
  }
  function start() {
    if (!enabled) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!ctx) {
      ctx = new Ctx();
      rig = build(ctx);
      next = ctx.currentTime + 0.1;
    }
    ctx.resume();
    if (!timer) { tick(); timer = setInterval(tick, 1000); }
    fade(LEVEL, 3);
  }
  function pause(seconds = 1.2) {
    if (ctx) fade(0, seconds);
  }
  function setEnabled(on) {
    enabled = on;
    if (!on) pause(0.6);
  }
  /** Для проверки: сводит seconds секунд музыки вне реального времени и возвращает буфер. */
  async function render(seconds) {
    const off = new OfflineAudioContext(2, 48000 * seconds, 48000);
    const r = build(off);
    r.master.gain.value = LEVEL;
    for (let n = 0, at = 0.1; at < seconds; n += 1, at += CHORD) chord(off, r.input, n, at);
    return off.startRendering();
  }
  return { start, pause, setEnabled, render, isEnabled: () => enabled };
})();
