/* Фоновая музыка демо: спокойная мелодичная тема, которая синтезируется в браузере (Web Audio), без звуковых файлов.
   Слои: мягкие аккорды, перебор («ту-ру-ду»), короткий мотив сверху, бас и тихий бит. Громкость ниже голоса диктора.
   SabyrMusic.start() — плавно включить, .pause() — плавно приглушить, .setEnabled(false) — выключить совсем. */
window.SabyrMusic = (() => {
  const LEVEL = 0.32;           // общая громкость (голос диктора остаётся заметно громче)
  const BEAT = 60 / 84;         // 84 удара в минуту — неторопливо
  const BAR = BEAT * 4;
  // ре мажор, по такту на аккорд: D – Bm – G – A. Ноты аккорда снизу вверх, в герцах.
  const CHORDS = [
    { bass: 73.42, notes: [146.83, 185.0, 220.0, 293.66, 369.99] },   // D
    { bass: 61.74, notes: [123.47, 146.83, 185.0, 246.94, 293.66] },  // Bm
    { bass: 49.0, notes: [98.0, 146.83, 196.0, 246.94, 293.66] },     // G
    { bass: 55.0, notes: [110.0, 164.81, 220.0, 277.18, 329.63] },    // A
  ];
  const ARP = [0, 2, 3, 2, 4, 3, 2, 3];                 // перебор восьмыми: какая нота аккорда звучит
  // мотив «ту-ру-ду» в верхнем регистре: [доля такта, частота, длительность]; раз в два такта, два варианта
  const MOTIFS = [
    [[0, 739.99, 0.5], [0.75, 880.0, 0.5], [1.5, 659.25, 1.4]],
    [[0, 587.33, 0.5], [0.75, 739.99, 0.5], [1.5, 880.0, 1.4]],
    [[0, 880.0, 0.5], [0.75, 739.99, 0.5], [1.5, 587.33, 1.4]],
    [[0, 659.25, 0.5], [0.75, 739.99, 0.5], [1.5, 554.37, 1.4]],
  ];

  /** Собирает цепочку: мягкий фильтр, простая реверберация, общий регулятор; готовит шум для бита. */
  function build(ctx) {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    tone.connect(master);
    let seed = 12345;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };
    const seconds = 2.4;                               // реверберация: затухающий шум вместо записанного зала
    const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let n = 0; n < data.length; n += 1) data[n] = rnd() * Math.pow(1 - n / data.length, 3);
    }
    const hall = ctx.createConvolver();
    hall.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    hall.connect(wet);
    wet.connect(tone);
    const input = ctx.createGain();                    // мелодические слои: с реверберацией
    input.connect(tone);
    input.connect(hall);
    const dry = ctx.createGain();                      // бас и бит: без реверберации, чтобы не гудело
    dry.connect(tone);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let n = 0; n < nd.length; n += 1) nd[n] = rnd();
    return { input, dry, master, noise };
  }

  /** Нота с огибающей: быстрое начало, плавное затухание. */
  function note(ctx, out, type, freq, at, peak, attack, decay, detune = 0) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0004, at + attack + decay);
    osc.connect(env);
    env.connect(out);
    osc.start(at);
    osc.stop(at + attack + decay + 0.05);
  }

  function hit(ctx, rig, at, kind) {
    if (kind === 'kick') {                             // мягкий «бочонок»: тон быстро падает вниз
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(120, at);
      osc.frequency.exponentialRampToValueAtTime(46, at + 0.16);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.5, at + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0005, at + 0.3);
      osc.connect(env);
      env.connect(rig.dry);
      osc.start(at);
      osc.stop(at + 0.34);
      return;
    }
    const src = ctx.createBufferSource();              // щелчок и «шейкер» — короткий отфильтрованный шум
    src.buffer = rig.noise;
    const band = ctx.createBiquadFilter();
    band.type = kind === 'snap' ? 'bandpass' : 'highpass';
    band.frequency.value = kind === 'snap' ? 1900 : 6500;
    const env = ctx.createGain();
    const peak = kind === 'snap' ? 0.11 : 0.035;
    const len = kind === 'snap' ? 0.11 : 0.04;
    env.gain.setValueAtTime(peak, at);
    env.gain.exponentialRampToValueAtTime(0.0005, at + len);
    src.connect(band);
    band.connect(env);
    env.connect(kind === 'snap' ? rig.input : rig.dry);
    src.start(at, (at * 0.37) % 0.8, len + 0.02);
  }

  /** Один такт: аккорд, перебор, бас, бит; мотив — через такт. */
  function bar(ctx, rig, index, at) {
    const chord = CHORDS[index % CHORDS.length];
    // аккорд: мягкий, с медленным началом, длится чуть дольше такта
    chord.notes.slice(0, 4).forEach((freq, n) => {
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.05, at + 0.5);
      env.gain.setValueAtTime(0.05, at + BAR - 0.3);
      env.gain.linearRampToValueAtTime(0, at + BAR + 0.9);
      env.connect(rig.input);
      [['sine', -4], ['triangle', 5]].forEach(([type, cents]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq * (n === 0 ? 1 : 2);
        osc.detune.value = cents;
        const part = ctx.createGain();
        part.gain.value = type === 'sine' ? 1 : 0.3;
        osc.connect(part);
        part.connect(env);
        osc.start(at);
        osc.stop(at + BAR + 1);
      });
    });
    // перебор восьмыми — «ту-ру-ду-ру»
    ARP.forEach((pick, n) => {
      const t = at + n * (BEAT / 2);
      const accent = n % 4 === 0 ? 0.12 : 0.085;
      note(ctx, rig.input, 'triangle', chord.notes[pick] * 2, t, accent, 0.008, 0.42);
      note(ctx, rig.input, 'sine', chord.notes[pick] * 4, t, accent * 0.25, 0.008, 0.2);
    });
    // бас: на первую долю и перед третьей
    note(ctx, rig.dry, 'sine', chord.bass * 2, at, 0.2, 0.02, BEAT * 1.6);
    note(ctx, rig.dry, 'sine', chord.bass * 2, at + BEAT * 2.5, 0.14, 0.02, BEAT * 1.1);
    // мотив сверху: раз в два такта, каждый раз немного другой
    if (index % 2 === 0) {
      MOTIFS[(index / 2) % MOTIFS.length].forEach(([beat, freq, len]) => {
        const t = at + BAR / 2 + beat * BEAT;
        note(ctx, rig.input, 'sine', freq, t, 0.1, 0.02, len * BEAT + 0.5);
        note(ctx, rig.input, 'triangle', freq, t, 0.03, 0.02, len * BEAT + 0.3, 6);
      });
    }
    // тихий бит: бочка на 1 и 3, щелчок на 2 и 4, шейкер между долями
    hit(ctx, rig, at, 'kick');
    hit(ctx, rig, at + BEAT * 2, 'kick');
    hit(ctx, rig, at + BEAT, 'snap');
    hit(ctx, rig, at + BEAT * 3, 'snap');
    for (let n = 0; n < 4; n += 1) hit(ctx, rig, at + BEAT * (n + 0.5), 'shake');
  }

  let ctx = null;
  let rig = null;
  let next = 0;       // время начала следующего такта
  let index = 0;
  let timer = null;
  let enabled = true;

  function tick() {
    while (next < ctx.currentTime + 3) { bar(ctx, rig, index, next); next += BAR; index += 1; }
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
    if (!timer) { tick(); timer = setInterval(tick, 700); }
    fade(LEVEL, 2.5);
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
    for (let n = 0, at = 0.1; at < seconds; n += 1, at += BAR) bar(off, r, n, at);
    return off.startRendering();
  }
  return { start, pause, setEnabled, render, isEnabled: () => enabled };
})();
