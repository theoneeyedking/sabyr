/* Фоновая музыка демо: спокойная нейтральная тема, которая синтезируется в браузере (Web Audio), без звуковых файлов.
   Слои: мягкие аккорды без явного мажора или минора, редкий перебор («ту… ру… ду…»), короткий мотив раз в четыре
   такта и тихий бас. Ударных нет. Громкость ниже голоса диктора.
   SabyrMusic.start() — плавно включить, .pause() — плавно приглушить, .setEnabled(false) — выключить совсем. */
window.SabyrMusic = (() => {
  const LEVEL = 0.2;            // общая громкость (голос диктора остаётся заметно громче)
  const BEAT = 60 / 72;         // 72 удара в минуту — спокойно
  const BAR = BEAT * 4;
  // Аккорды без терции или с задержанием: звучат ровно, не «радостно» и не «грустно». Ноты снизу вверх, в герцах.
  const CHORDS = [
    { bass: 73.42, notes: [146.83, 164.81, 220.0, 293.66, 329.63] },  // D с ноной: ре, ми, ля
    { bass: 61.74, notes: [123.47, 146.83, 220.0, 246.94, 293.66] },  // Bm7 без квинты: си, ре, ля
    { bass: 49.0, notes: [98.0, 146.83, 220.0, 293.66, 329.63] },     // G с ноной: соль, ре, ля
    { bass: 55.0, notes: [110.0, 146.83, 164.81, 220.0, 293.66] },    // A с задержанием: ля, ре, ми
  ];
  const ARP = [0, 2, 3, 2];                              // перебор четвертями: какая нота аккорда звучит
  // мотив в среднем регистре: [доля такта, частота, длительность в долях]; раз в четыре такта, два варианта
  const MOTIFS = [
    [[0, 440.0, 1], [1, 493.88, 1], [2, 440.0, 2.5]],
    [[0, 587.33, 1], [1, 493.88, 1], [2, 440.0, 2.5]],
  ];

  /** Собирает цепочку: мягкий фильтр, простая реверберация, общий регулятор. */
  function build(ctx) {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3600;
    tone.connect(master);
    let seed = 12345;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };
    const seconds = 3;                                 // реверберация: затухающий шум вместо записанного зала
    const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let n = 0; n < data.length; n += 1) data[n] = rnd() * Math.pow(1 - n / data.length, 2.8);
    }
    const hall = ctx.createConvolver();
    hall.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    hall.connect(wet);
    wet.connect(tone);
    const input = ctx.createGain();                    // мелодические слои: с реверберацией
    input.connect(tone);
    input.connect(hall);
    const dry = ctx.createGain();                      // бас: без реверберации, чтобы не гудело
    dry.connect(tone);
    return { input, dry, master };
  }

  /** Нота с огибающей: мягкое начало, плавное затухание. */
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

  /** Один такт: аккорд, перебор, бас; мотив — раз в четыре такта. */
  function bar(ctx, rig, index, at) {
    const chord = CHORDS[index % CHORDS.length];
    // аккорд: мягкий, с медленным началом, перетекает в следующий
    chord.notes.slice(0, 4).forEach((freq, n) => {
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.07, at + 1.2);
      env.gain.setValueAtTime(0.07, at + BAR - 0.4);
      env.gain.linearRampToValueAtTime(0, at + BAR + 1.6);
      env.connect(rig.input);
      [['sine', -4], ['triangle', 5]].forEach(([type, cents]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq * (n === 0 ? 1 : 2);
        osc.detune.value = cents;
        const part = ctx.createGain();
        part.gain.value = type === 'sine' ? 1 : 0.28;
        osc.connect(part);
        part.connect(env);
        osc.start(at);
        osc.stop(at + BAR + 1.7);
      });
    });
    // перебор четвертями — неторопливое «ту… ру… ду…»
    ARP.forEach((pick, n) => {
      const t = at + n * BEAT;
      note(ctx, rig.input, 'triangle', chord.notes[pick] * 2, t, n === 0 ? 0.1 : 0.075, 0.015, 0.9);
      note(ctx, rig.input, 'sine', chord.notes[pick] * 4, t, 0.016, 0.015, 0.4);
    });
    // бас: одна долгая нота на такт
    note(ctx, rig.dry, 'sine', chord.bass * 2, at, 0.16, 0.05, BAR * 0.9);
    // мотив: раз в четыре такта, три ноты, без скачков вверх
    if (index % 4 === 2) {
      MOTIFS[((index - 2) / 4) % MOTIFS.length].forEach(([beat, freq, len]) => {
        const t = at + beat * BEAT;
        note(ctx, rig.input, 'sine', freq, t, 0.085, 0.04, len * BEAT + 0.6);
        note(ctx, rig.input, 'triangle', freq, t, 0.02, 0.04, len * BEAT + 0.3, 5);
      });
    }
  }

  let ctx = null;
  let rig = null;
  let next = 0;       // время начала следующего такта
  let index = 0;
  let timer = null;
  let enabled = true;

  function tick() {
    while (next < ctx.currentTime + 3.5) { bar(ctx, rig, index, next); next += BAR; index += 1; }
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
