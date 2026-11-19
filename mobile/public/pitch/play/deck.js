/* Движок презентации Sabyr: сцена 1920×1080, слайды с шагами, субтитры, окно ведущего с таймером.
   Без зависимостей. Разметка слайдов — в index.html:
     data-in="n"    элемент виден начиная с шага n
     data-out="n"   элемент скрыт начиная с шага n
     data-only="a,b" элемент виден только на перечисленных шагах
     data-count="N" число «досчитывается» при появлении
     <aside class="notes"><p data-s="n">…</p></aside> — текст ведущего для шага n (он же субтитры). */
(() => {
  const W = 1920;
  const H = 1080;
  const BUDGET = 5 * 60; // секунд на выступление
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const presenter = new URLSearchParams(location.search).has('presenter');
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
  const noteOf = (sl, step) => {
    const lines = $$('.notes p', sl).filter((p) => Number(p.dataset.s || 0) <= step);
    return lines.length ? lines[lines.length - 1].textContent.trim() : '';
  };

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
      if (idx !== i) return;
      sl.dataset.step = String(s);
      stepped(sl).forEach((el) => {
        const only = el.dataset.only;
        const show = only != null
          ? nums(only).includes(s)
          : s >= (el.dataset.in != null ? Number(el.dataset.in) : 0) && s < (el.dataset.out != null ? Number(el.dataset.out) : Infinity);
        el.classList.toggle('in', show);
        if (show && el.dataset.count != null) count(el);
        if (!show) el._key = null;
      });
      $$('[data-count]:not([data-in]):not([data-only]):not([data-out])', sl).forEach(count);
    });
    document.body.dataset.slide = slides[i].id || String(i);
    const total = slides.reduce((acc, sl) => acc + stepsOf(sl) + 1, 0);
    const done = slides.slice(0, i).reduce((acc, sl) => acc + stepsOf(sl) + 1, 0) + s + 1;
    $('#progress i').style.width = `${(done / total) * 100}%`;
    $('#pos').textContent = `${i + 1} / ${slides.length}`;
    const note = noteOf(slides[i], s);
    $('#cap').hidden = !captions || !note;
    $('#cap p').textContent = note;
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

  // ---------- окно зрителей ----------
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

  function audience() {
    document.body.classList.add('audience');
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
      else if (k === 't' || k === 'T' || k === 'е' || k === 'Е') { captions = !captions; apply(); }
      else if (k === 'p' || k === 'P' || k === 'з' || k === 'З') {
        window.open(`${location.pathname}?presenter=1`, 'sabyr-presenter', 'width=980,height=760');
      }
      wake();
    });
    $('#nav-next').addEventListener('click', next);
    $('#nav-prev').addEventListener('click', prev);
    $('#cap-toggle').addEventListener('click', () => { captions = !captions; apply(); });
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
    const clock = (sec) => `${sec < 0 ? '−' : ''}${Math.floor(Math.abs(sec) / 60)}:${String(Math.floor(Math.abs(sec) % 60)).padStart(2, '0')}`;
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

  if (presenter) presenterView(); else audience();
})();
