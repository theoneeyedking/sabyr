/* Движок страницы «Демо» Sabyr. Сцена 1920×1080 масштабируется под окно. Три режима:
     демо (по умолчанию)  — фильм: шаги идут сами под голос диктора, есть пауза, перемотка и субтитры;
     ?slides              — те же слайды, но листаются вручную (для выступления), P открывает окно ведущего;
     ?presenter           — окно ведущего: таймер, текст выступления, ответы на вопросы жюри.
   Без зависимостей. Разметка слайдов — в index.html:
     data-film         слайд входит в фильм (остальные показываются только в режиме ?slides)
     data-in="n"       элемент виден начиная с шага n
     data-out="n"      элемент скрыт начиная с шага n
     data-only="a,b"   элемент виден только на перечисленных шагах
     data-count="N"    число «досчитывается» при появлении
     <video data-clip="имя">  запись экрана: играет с начала, когда её шаг становится активным
     <aside class="notes"><p data-s="n" data-say="…">…</p></aside> — реплика диктора для шага n (она же субтитры);
                       data-say — как прочитать вслух, если написание отличается (Sabyr → Сабыр).
   Голос: если есть записанные дорожки (voice/voice.json), играют они; иначе — голос браузера; иначе — только субтитры. */
(() => {
  const W = 1920;
  const H = 1080;
  const BUDGET = 5 * 60; // секунд на выступление (окно ведущего)
  const GAP = 0.3;       // пауза между репликами в фильме, с
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const params = new URLSearchParams(location.search);
  const presenter = params.has('presenter');
  const filmMode = !presenter && !params.has('slides');
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('sabyr-deck') : null;

  const slides = $$('.slide');
  const stepped = (sl) => $$('[data-in],[data-out],[data-only]', sl);
  const nums = (v) => (v == null ? [] : String(v).split(',').map(Number));
  const stepsOf = (sl) => {
    if (sl._steps == null) {
      sl._steps = Math.max(0, ...stepped(sl).flatMap((el) => [...nums(el.dataset.in), ...nums(el.dataset.out), ...nums(el.dataset.only)]));
    }
    return sl._steps;
  };
  const lineOf = (sl, step) => {
    const lines = $$('.notes p', sl).filter((p) => Number(p.dataset.s || 0) <= step);
    return lines.length ? lines[lines.length - 1] : null;
  };
  const noteOf = (sl, step) => lineOf(sl, step)?.textContent.trim() ?? '';
  const visibleAt = (el, step) => (el.dataset.only != null
    ? nums(el.dataset.only).includes(step)
    : step >= (el.dataset.in != null ? Number(el.dataset.in) : 0) && step < (el.dataset.out != null ? Number(el.dataset.out) : Infinity));

  let i = 0;
  let s = 0;
  let startedAt = null;
  let slideAt = Date.now();
  let captions = true;

  const money = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function count(el) {
    const target = Number(el.dataset.count);
    const key = `${i}.${s}`;
    if (el._key === key) return;
    el._key = key;
    const from = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - from) / 1100);
      el.textContent = money(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && el._key === key) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function nextLabel() {
    const sl = slides[i];
    if (s < stepsOf(sl)) return noteOf(sl, s + 1) || sl.dataset.title;
    return slides[i + 1] ? `Слайд: ${slides[i + 1].dataset.title}` : 'Конец';
  }

  function state() {
    return {
      type: 'state', i, s, total: slides.length, steps: stepsOf(slides[i]), title: slides[i].dataset.title,
      note: noteOf(slides[i], s), next: nextLabel(), startedAt, slideAt,
    };
  }

  function apply(snap) {
    slides.forEach((sl, idx) => {
      sl.classList.toggle('on', idx === i);
      sl.classList.toggle('snap', !!snap);
      if (idx !== i) {
        $$('video', sl).forEach((v) => { v.pause(); v._on = false; });
        return;
      }
      sl.dataset.step = String(s);
      stepped(sl).forEach((el) => {
        const show = visibleAt(el, s);
        el.classList.toggle('in', show);
        if (show && el.dataset.count != null) count(el);
        if (!show) el._key = null;
        if (el.tagName === 'VIDEO') {
          if (show && !el._on) { el._on = true; el.currentTime = 0; el.play().catch(() => {}); }
          if (!show && el._on) { el._on = false; el.pause(); }
        }
      });
      $$('[data-count]:not([data-in]):not([data-only]):not([data-out])', sl).forEach(count);
    });
    document.body.dataset.slide = slides[i].id || String(i);
    window.SabyrScene?.setBeat(slides[i].id, s, !!snap); // трёхмерная сцена (scene.js) показывает тот же шаг
    const total = slides.reduce((acc, sl) => acc + stepsOf(sl) + 1, 0);
    const done = slides.slice(0, i).reduce((acc, sl) => acc + stepsOf(sl) + 1, 0) + s + 1;
    $('#progress i').style.width = `${(done / total) * 100}%`;
    $('#pos').textContent = `${i + 1} / ${slides.length}`;
    const note = noteOf(slides[i], s);
    $('#cap').hidden = !captions || !note;
    // субтитры — по словам, чтобы фильм мог подсвечивать произносимое
    $('#cap p').replaceChildren(...note.split(' ').filter(Boolean).flatMap((word, n) => {
      const span = document.createElement('span');
      span.className = filmMode ? 'w' : 'w on';
      span.textContent = word;
      return n ? [' ', span] : [span];
    }));
    history.replaceState(null, '', `${location.pathname}${location.search}#${i + 1}.${s}`);
    channel?.postMessage(state());
  }

  function go(ni, ns, snap) {
    const before = i;
    i = Math.max(0, Math.min(slides.length - 1, ni));
    s = Math.max(0, Math.min(stepsOf(slides[i]), ns));
    if (i !== before) slideAt = Date.now();
    apply(snap);
  }
  function next() {
    if (startedAt == null) startedAt = Date.now();
    $('#hint').hidden = true;
    if (s < stepsOf(slides[i])) go(i, s + 1);
    else if (i < slides.length - 1) go(i + 1, 0);
  }
  function prev() {
    if (s > 0) go(i, s - 1);
    else if (i > 0) go(i - 1, stepsOf(slides[i - 1]));
  }
  function home() {
    startedAt = null;
    go(0, 0);
  }

  function fit() {
    const k = Math.min(innerWidth / W, innerHeight / H);
    const stage = $('#stage');
    stage.style.width = `${W * k}px`;
    stage.style.height = `${H * k}px`;
    $('#comp').style.transform = `scale(${k})`;
    document.body.classList.toggle('portrait', innerHeight > innerWidth * 1.15);
  }

  let idle;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idle);
    idle = setTimeout(() => document.body.classList.add('idle'), 2600);
  }

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
  const toggleCaptions = () => { captions = !captions; apply(); };
  const clock = (sec) => `${sec < 0 ? '−' : ''}${Math.floor(Math.abs(sec) / 60)}:${String(Math.floor(Math.abs(sec) % 60)).padStart(2, '0')}`;

  // ---------- фильм ----------
  const film = {
    seq: [], k: 0, playing: false, token: 0, stepStart: 0, muted: false, clips: {}, voice: {}, audio: new Audio(), timers: [], players: {},
  };

  /** Сколько длится шаг: записанная дорожка или оценка по длине реплики, но не короче видео на экране. */
  function measure(entry) {
    const voiced = film.voice[entry.key]?.dur ?? Math.max(2.4, entry.say.length * 0.07 + 0.6);
    return Math.max(voiced, entry.hold) + GAP;
  }

  function buildFilm() {
    film.seq = [];
    slides.forEach((sl, idx) => {
      if (!sl.hasAttribute('data-film')) return;
      for (let step = 0; step <= stepsOf(sl); step += 1) {
        const line = lineOf(sl, step);
        if (!line || Number(line.dataset.s || 0) !== step) continue; // шаг без своей реплики в фильм не входит
        const video = $$('video', sl).find((v) => visibleAt(v, step));
        film.seq.push({
          i: idx, s: step, key: `${sl.id}-${step}`, text: line.textContent.trim(), say: (line.dataset.say || line.textContent.trim()).replace(/\u0301/g, ''), // знаки ударения — только для синтезатора
          hold: video ? (film.clips[video.dataset.clip] ?? 0) : 0,
        });
      }
    });
    let at = 0;
    film.seq.forEach((e) => { e.dur = measure(e); e.at = at; at += e.dur; });
    film.total = at;
  }

  /** Подсвечивает слова субтитров до n-го включительно. */
  const litWords = (n) => $$('#cap .w').forEach((el, idx) => el.classList.toggle('on', idx <= n));
  /** Подсветка по времени, пропорционально длине слов (когда точных отметок от голоса нет). */
  const weight = (word) => word.length + 1 + (/[,;:—–]$/.test(word) || word === '—' ? 3 : 0);
  /** Подсвечивает слова words (с номера first) равномерно по их длине за seconds секунд, начиная через delay. */
  function spread(words, first, seconds, delay = 0) {
    const total = words.reduce((acc, w) => acc + weight(w), 0);
    let before = 0;
    const ids = words.map((w, n) => {
      const id = setTimeout(() => litWords(first + n), (delay + (before / total) * seconds) * 1000);
      before += weight(w);
      return id;
    });
    film.timers.push(...ids);
    return ids;
  }
  /** Подсветка по времени, когда точных отметок от голоса нет. */
  const wordsByClock = (entry, seconds) => spread(entry.text.split(' ').filter(Boolean), 0, seconds);
  /** Подсветка по предложениям: parts — длительность каждого предложения в записанной дорожке. */
  function wordsByParts(entry, clip) {
    const sentences = entry.text.match(/[^.!?…]+[.!?…]+[»")]*\s*|[^.!?…]+$/g) ?? [entry.text];
    if (!clip.parts || clip.parts.length !== sentences.length) return wordsByClock(entry, clip.dur);
    let first = 0;
    let delay = 0;
    sentences.forEach((sentence, n) => {
      const words = sentence.split(' ').filter(Boolean);
      spread(words, first, clip.parts[n] * 0.94, delay);
      first += words.length;
      delay += clip.parts[n];
    });
    return [];
  }

  // Русские голоса браузера сильно различаются по качеству: «нейронные» и сетевые звучат заметно лучше системных.
  const VOICE_RANK = [/natural|neural/i, /online/i, /google/i, /premium|enhanced|siri/i, /milena|yuri|katya/i];
  const ruVoice = () => {
    const voices = (window.speechSynthesis?.getVoices() ?? []).filter((v) => /^ru/i.test(v.lang));
    const score = (v) => { const n = VOICE_RANK.findIndex((re) => re.test(v.name)); return n < 0 ? VOICE_RANK.length : n; };
    return voices.sort((a, b) => score(a) - score(b))[0];
  };

  /** Произносит реплику и вызывает done по окончании. Возвращает название способа (для подсказки). */
  function speak(entry, done) {
    const fallback = () => { wordsByClock(entry, entry.dur - GAP); film.timers.push(setTimeout(done, (entry.dur - GAP) * 1000)); };
    if (film.muted) { fallback(); return 'mute'; }
    const clip = film.voice[entry.key];
    if (clip) {
      const player = film.players[entry.key] ?? new Audio(`voice/${clip.file}`);
      film.audio = player;
      player.currentTime = 0;
      player.onended = done;
      player.onerror = fallback;
      player.onplaying = () => { player.onplaying = null; wordsByParts(entry, clip); }; // подсветка — с первым звуком
      player.play().catch(fallback);
      return 'clip';
    }
    const voice = ruVoice();
    if (!voice) { fallback(); return 'none'; }
    const u = new SpeechSynthesisUtterance(entry.say);
    u.voice = voice; u.lang = voice.lang; u.rate = 1.04; u.pitch = 1;
    let finished = false;
    const end = () => { if (!finished) { finished = true; done(); } };
    u.onend = end; u.onerror = end;
    // браузер сообщает, какое слово сейчас произносит, — подсвечиваем его в субтитрах
    const clocked = wordsByClock(entry, entry.dur - GAP); // на случай, если отметок не будет
    let exact = false;
    u.onboundary = (e) => {
      if (e.name && e.name !== 'word') return;
      if (!exact) { exact = true; clocked.forEach(clearTimeout); }
      litWords(entry.say.slice(0, e.charIndex).split(' ').filter(Boolean).length);
    };
    film.timers.push(setTimeout(end, (entry.dur * 2 + 4) * 1000)); // на случай, если браузер «потерял» окончание
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return 'tts';
  }

  function silence() {
    film.token += 1;
    film.timers.forEach(clearTimeout);
    film.timers = [];
    film.audio.pause();
    window.speechSynthesis?.cancel();
  }

  function playStep(k) {
    silence();
    film.k = Math.max(0, Math.min(film.seq.length - 1, k));
    const entry = film.seq[film.k];
    const my = film.token;
    go(entry.i, entry.s);
    film.stepStart = performance.now();
    $('#end').hidden = true;
    if (!film.playing) { $$('video', slides[i]).forEach((v) => v.pause()); return; }
    let voiced = false;
    let held = entry.hold === 0;
    const advance = () => {
      if (my !== film.token || !voiced || !held) return;
      film.timers.push(setTimeout(() => {
        if (my !== film.token) return;
        if (film.k < film.seq.length - 1) playStep(film.k + 1); else finish();
      }, GAP * 1000));
    };
    const how = speak(entry, () => { voiced = true; advance(); });
    $('#novoice').hidden = how !== 'none';
    if (!held) film.timers.push(setTimeout(() => { held = true; advance(); }, entry.hold * 1000));
  }

  function setPlaying(on) {
    film.playing = on;
    $('#pl-play').dataset.state = on ? 'playing' : 'paused';
    $('#pl-play').setAttribute('aria-label', on ? 'Пауза' : 'Смотреть');
    document.body.classList.toggle('film-paused', !on);
  }
  function play() { setPlaying(true); playStep(film.k); }
  function pause() { setPlaying(false); silence(); $$('video', slides[i]).forEach((v) => v.pause()); }
  function finish() {
    setPlaying(false);
    silence();
    film.k = film.seq.length - 1;
    film.stepStart = -1e9;
    $('#end').hidden = false;
  }
  function seek(seconds) {
    const t = Math.max(0, Math.min(film.total - 0.01, seconds));
    let k = film.seq.findIndex((e) => t < e.at + e.dur);
    if (k < 0) k = film.seq.length - 1;
    playStep(k);
  }

  function drawPlayer() {
    const entry = film.seq[film.k];
    if (entry) {
      const inside = film.playing ? Math.min(entry.dur, (performance.now() - film.stepStart) / 1000) : (film.stepStart < 0 ? entry.dur : 0);
      const t = entry.at + inside;
      $('#pl-fill').style.width = `${(t / film.total) * 100}%`;
      $('#pl-cur').textContent = clock(t);
    }
    requestAnimationFrame(drawPlayer);
  }

  async function loadJson(url) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      return res.ok ? await res.json() : {};
    } catch {
      return {};
    }
  }

  async function filmView() {
    document.body.classList.add('audience', 'film');
    fit();
    addEventListener('resize', fit);
    [film.clips, film.voice] = await Promise.all([loadJson('../video/clips.json'), loadJson('voice/voice.json')]);
    // дорожки грузятся заранее, чтобы голос не запаздывал на загрузку в начале каждой реплики
    for (const [key, clip] of Object.entries(film.voice)) {
      const player = new Audio(`voice/${clip.file}`);
      player.preload = 'auto';
      film.players[key] = player;
    }
    buildFilm();
    $('#pl-dur').textContent = clock(film.total);
    $('#start-len').textContent = `${Math.max(1, Math.round(film.total / 60))} мин`;
    go(film.seq[0].i, film.seq[0].s, true);
    requestAnimationFrame(() => slides.forEach((sl) => sl.classList.remove('snap')));
    setPlaying(false);
    window.speechSynthesis?.getVoices(); // браузер подгружает голоса не сразу
    requestAnimationFrame(drawPlayer);

    const begin = () => { $('#start').hidden = true; film.k = 0; play(); wake(); };
    $('#start').addEventListener('click', begin);
    $('#pl-play').addEventListener('click', () => (film.playing ? pause() : play()));
    $('#catch').addEventListener('click', () => { if ($('#start').hidden && $('#end').hidden) { if (film.playing) pause(); else play(); } });
    $('#pl-mute').addEventListener('click', () => {
      film.muted = !film.muted;
      $('#pl-mute').dataset.state = film.muted ? 'off' : 'on';
      $('#pl-mute').textContent = film.muted ? 'Без звука' : 'Звук';
      if (film.playing) playStep(film.k);
    });
    $('#pl-cap').addEventListener('click', toggleCaptions);
    $('#pl-fs').addEventListener('click', fullscreen);
    $('#end-replay').addEventListener('click', begin);
    const scrub = $('#pl-scrub');
    const at = (e) => { const box = scrub.getBoundingClientRect(); return ((e.clientX - box.left) / box.width) * film.total; };
    scrub.addEventListener('pointerdown', (e) => { scrub.setPointerCapture(e.pointerId); $('#start').hidden = true; seek(at(e)); });
    scrub.addEventListener('pointermove', (e) => { if (e.buttons) seek(at(e)); });

    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === ' ' || k === 'k' || k === 'K' || k === 'Enter') {
        e.preventDefault();
        if (!$('#start').hidden) begin(); else if (film.playing) pause(); else play();
      } else if (k === 'ArrowRight') { $('#start').hidden = true; playStep(film.k + 1); }
      else if (k === 'ArrowLeft') playStep(film.k - 1);
      else if (k === 'Home') playStep(0);
      else if (k === 'f' || k === 'F' || k === 'а' || k === 'А') fullscreen();
      else if (k === 't' || k === 'T' || k === 'е' || k === 'Е') toggleCaptions();
      else if (k === 'm' || k === 'M' || k === 'ь' || k === 'Ь') $('#pl-mute').click();
      wake();
    });
    ['mousemove', 'touchstart', 'click'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
    addEventListener('pagehide', silence);
    wake();
  }

  // ---------- слайды вручную ----------
  function slidesView() {
    document.body.classList.add('audience', 'manual');
    fit();
    addEventListener('resize', fit);
    const [hi, hs] = location.hash.slice(1).split('.').map(Number);
    go(Number.isFinite(hi) && hi > 0 ? hi - 1 : 0, Number.isFinite(hs) ? hs : 0, true);
    requestAnimationFrame(() => slides.forEach((sl) => sl.classList.remove('snap')));

    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === ' ' || k === 'PageDown' || k === 'Enter') { e.preventDefault(); next(); }
      else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); prev(); }
      else if (k === 'Home') home();
      else if (k === 'End') go(slides.length - 1, 0);
      else if (k === 'f' || k === 'F' || k === 'а' || k === 'А') fullscreen();
      else if (k === 't' || k === 'T' || k === 'е' || k === 'Е') toggleCaptions();
      else if (k === 'p' || k === 'P' || k === 'з' || k === 'З') {
        window.open(`${location.pathname}?presenter=1`, 'sabyr-presenter', 'width=980,height=760');
      }
      wake();
    });
    $('#nav-next').addEventListener('click', next);
    $('#nav-prev').addEventListener('click', prev);
    $('#cap-toggle').addEventListener('click', toggleCaptions);
    $('#fs-toggle').addEventListener('click', fullscreen);
    // касание: правая часть сцены — вперёд, левая треть — назад
    $('#catch').addEventListener('click', (e) => {
      const box = e.currentTarget.getBoundingClientRect();
      if ((e.clientX - box.left) / box.width < 0.3) prev(); else next();
    });
    ['mousemove', 'touchstart', 'click'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
    wake();

    channel?.addEventListener('message', ({ data }) => {
      if (data?.type === 'hello') channel.postMessage(state());
      if (data?.type !== 'cmd') return;
      if (data.cmd === 'next') next();
      if (data.cmd === 'prev') prev();
      if (data.cmd === 'home') home();
    });
  }

  // ---------- окно ведущего ----------
  function presenterView() {
    document.body.classList.add('presenter');
    document.title = 'Sabyr — окно ведущего';
    let last = null;
    const render = () => {
      if (!last) return;
      const elapsed = last.startedAt ? (Date.now() - last.startedAt) / 1000 : 0;
      $('#elapsed').textContent = clock(elapsed);
      $('#remain').textContent = clock(BUDGET - elapsed);
      $('#remain').classList.toggle('over', elapsed > BUDGET);
      $('#onslide').textContent = clock((Date.now() - last.slideAt) / 1000);
    };
    const send = (cmd) => channel?.postMessage({ type: 'cmd', cmd });
    channel?.addEventListener('message', ({ data }) => {
      if (data?.type !== 'state') return;
      last = data;
      $('#status').hidden = true;
      $('#step').textContent = `${data.i + 1}/${data.total} · шаг ${data.s}/${data.steps}`;
      $('#sayhead').textContent = data.title;
      $('#say').textContent = data.note || '—';
      $('#nexttext').textContent = data.next;
      render();
    });
    channel?.postMessage({ type: 'hello' });
    setInterval(render, 250);
    $('#bnext').addEventListener('click', () => send('next'));
    $('#bprev').addEventListener('click', () => send('prev'));
    $('#bhome').addEventListener('click', () => send('home'));
    $('#bqa').addEventListener('click', () => { $('#qa').hidden = !$('#qa').hidden; });
    addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') { e.preventDefault(); send('next'); }
      else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); send('prev'); }
      else if (k === 'Home') send('home');
      else if (k === 'q' || k === 'Q' || k === 'й' || k === 'Й') $('#qa').hidden = !$('#qa').hidden;
    });
    if (!channel) $('#status').textContent = 'Этот браузер не умеет связывать окна. Листайте в окне зрителей.';
  }

  window.SabyrDeck = { current: () => ({ id: slides[i].id, step: s }) };
  if (presenter) presenterView();
  else if (filmMode) filmView();
  else slidesView();
})();
