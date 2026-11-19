/* eslint-disable no-console */
// Запись живого прохода по приложению для страницы проекта (public/pitch/video/*.mp4).
// Нужны: чистый стенд (make demo-reset), собранный dist/ (npx expo export --platform web), ffmpeg и playwright.
//
//   E2E_API_URL=http://localhost:8000 node e2e/record_demo.js
//
// Сценарий тот же, что в демо: Гульнара переводит 1 500 000 ₸ на счёт дропа во время звонка,
// Sabyr ставит паузу, Данияр отклоняет перевод. Делает настоящие запросы к серверу и к LLM (около 5 вызовов).
const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const API = (process.env.E2E_API_URL || 'http://localhost:8001').replace(/\/+$/, '');
const DIST = path.join(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '..', 'public', 'pitch', 'video');
const DROP = 'KZ11SBA0000000007777';
const VIEWPORT = { width: 412, height: 916 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.css': 'text/css', '.ttf': 'font/ttf' };

function serveDist() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.normalize(path.join(DIST, urlPath));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

const tid = (page, id) => page.getByTestId(id);
const top = (page, id) => page.getByTestId(id).last();
const wait = (page, ms) => page.waitForTimeout(ms);
const glide = (page, id) => top(page, id).evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));

/** Клиент со своей записью экрана. marks — границы фрагментов в секундах от начала записи. */
async function actor(browser, appUrl, dir) {
  const context = await browser.newContext({
    viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU',
    recordVideo: { dir, size: VIEWPORT }, // запись идёт в размере окна; больший размер оставил бы страницу в углу кадра
  });
  await context.addInitScript((api) => window.localStorage.setItem('sabyr.apiUrl', api), API);
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(appUrl);
  const marks = {};
  return { context, page, marks, now: () => (Date.now() - t0) / 1000 };
}

async function login(page, name) {
  await tid(page, 'screen-login').waitFor();
  await page.getByText(name, { exact: true }).click();
  await tid(page, 'screen-home').waitFor();
}

function cut(src, name, from, to) {
  const out = path.join(OUT, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', from.toFixed(2), '-to', to.toFixed(2), '-i', src, '-an',
    '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', out]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-frames:v', '1', '-q:v', '80', path.join(OUT, `${name}.webp`)]);
  console.log(`  ${name}.mp4  ${(to - from).toFixed(1)} с  ${(fs.statSync(out).size / 1024).toFixed(0)} КБ`);
  return to - from;
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Нет dist/ — сначала: npx expo export --platform web');
  if (!(await fetch(`${API}/health`).then((r) => r.ok).catch(() => false))) throw new Error(`API недоступен: ${API}`);
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sabyr-rec-'));
  const { server, url } = await serveDist();
  const browser = await chromium.launch();
  try {
    // ---------- Гульнара: подготовка за кадром ----------
    const g = await actor(browser, url, path.join(tmp, 'g'));
    await login(g.page, 'Гульнара Сейткали');
    const logo = top(g.page, 'logo');
    for (let i = 0; i < 5; i += 1) await logo.click({ delay: 20 });
    await tid(g.page, 'screen-demo').waitFor();
    await tid(g.page, 'toggle-call').click(); // сигнал «идёт звонок»
    await top(g.page, 'back').click();
    await tid(g.page, 'screen-home').waitFor();
    await wait(g.page, 1500);

    // ---------- 1. Перевод ----------
    g.marks.transfer = [g.now()];
    await wait(g.page, 1200);
    await top(g.page, 'tile-transfer').click();
    await tid(g.page, 'screen-transfer').waitFor();
    await wait(g.page, 900);
    await top(g.page, 'input-amount').pressSequentially('1500000', { delay: 130 });
    await wait(g.page, 500);
    await top(g.page, 'input-account').pressSequentially(DROP, { delay: 45 });
    await wait(g.page, 900);
    await top(g.page, 'transfer-continue').click();
    await wait(g.page, 1300);
    g.marks.transfer.push(g.now());

    // ---------- 2. Пауза и причины ----------
    await tid(g.page, 'screen-sabyr').waitFor({ timeout: 60000 });
    g.marks.pause = [g.now()];
    await wait(g.page, 5200);
    await glide(g.page, 'risk-gauge');
    await wait(g.page, 3000);
    g.marks.pause.push(g.now());

    // ---------- 3. Таймер и доверенное лицо ----------
    g.marks.cooldown = [g.now()];
    await glide(g.page, 'cooldown');
    await wait(g.page, 3200);
    await glide(g.page, 'trusted-status');
    await wait(g.page, 3400);
    g.marks.cooldown.push(g.now());

    // ---------- 4. Помощник ----------
    await tid(g.page, 'chat-assistant').first().waitFor({ timeout: 60000 });
    g.marks.chat = [g.now()];
    await glide(g.page, 'assistant-chat');
    await wait(g.page, 4200);
    await tid(g.page, 'chat-quick-0').click();
    await g.page.waitForFunction(() => document.querySelectorAll('[data-testid="chat-assistant"]').length >= 2, null, { timeout: 60000 });
    await wait(g.page, 600);
    await top(g.page, 'chat-assistant').evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(g.page, 4200);
    g.marks.chat.push(g.now());
    await glide(g.page, 'reasons'); // возвращаемся наверх: отсюда экран сменится на итог

    // ---------- 5. Данияр: русский интерфейс, отклоняет ----------
    const d = await actor(browser, url, path.join(tmp, 'd'));
    await login(d.page, 'Данияр Сейткали');
    await tid(d.page, 'lang-ru').click();
    await tid(d.page, 'trusted-badge').waitFor({ timeout: 15000 });
    await wait(d.page, 1500);
    d.marks.trusted = [d.now()];
    await wait(d.page, 1600);
    await tid(d.page, 'tile-trusted').click();
    await tid(d.page, 'trusted-request').waitFor();
    await wait(d.page, 3600);
    await d.page.getByTestId('trusted-reason').first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(d.page, 3600);
    await tid(d.page, 'trusted-decline').click();
    const declinedAt = Date.now();
    await tid(d.page, 'trusted-earlier').first().waitFor();
    await wait(d.page, 2000);
    d.marks.trusted.push(d.now());

    // ---------- 6. Итог у Гульнары ----------
    await tid(g.page, 'final-declined').waitFor({ timeout: 20000 });
    g.marks.final = [g.now() - Math.min(1.2, (Date.now() - declinedAt) / 1000)];
    await wait(g.page, 6000);
    g.marks.final.push(g.now());

    const gVideo = await g.page.video().path();
    const dVideo = await d.page.video().path();
    await g.context.close();
    await d.context.close();

    console.log('Фрагменты:');
    const durations = {};
    for (const [name, [a, b]] of Object.entries(g.marks)) durations[name] = cut(gVideo, name, a, b);
    for (const [name, [a, b]] of Object.entries(d.marks)) durations[name] = cut(dVideo, name, a, b);
    fs.writeFileSync(path.join(OUT, 'clips.json'), `${JSON.stringify(durations, (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v), 2)}\n`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error('Запись остановлена:', e.message); process.exit(1); });
