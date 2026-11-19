/* eslint-disable no-console */
// Сквозной прогон демо-сценария Sabyr в браузере (web-сборка приложения + живой API).
//
//   npx expo export --platform web      # собрать web-версию в dist/
//   node e2e/walkthrough.js             # прогон + скриншоты в ../docs/screenshots
//
// Переменные окружения:
//   E2E_API_URL   адрес API (по умолчанию http://localhost:8001)
//   E2E_APP_URL   адрес уже запущенного приложения; если не задан — скрипт сам раздаёт dist/
//   E2E_SHOTS     каталог для скриншотов (по умолчанию ../docs/screenshots)
//   E2E_MOCK_ASSISTANT=1  подменять помощника заглушкой (только явно; по умолчанию — настоящий сервис,
//                 а если он не отвечает, прогон останавливается с ошибкой)
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const API = (process.env.E2E_API_URL || 'http://localhost:8001').replace(/\/+$/, '');
const DIST = path.join(__dirname, '..', 'dist');
const SHOTS = process.env.E2E_SHOTS || path.join(__dirname, '..', '..', 'docs', 'screenshots');
const DROP = 'KZ11SBA0000000007777';
const FRIEND = 'KZ22SBA0000000001111';
const FRIEND_PHONE = '8 700 000 00 59';   // телефон владелицы счёта FRIEND
const VIEWPORT = { width: 412, height: 915 };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.css': 'text/css', '.ttf': 'font/ttf', '.map': 'application/json',
};

/** Раздаёт каталог dist/ (с возвратом index.html для неизвестных путей). */
function serveDist() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('Нет dist/index.html — сначала выполните: npx expo export --platform web');
  }
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.normalize(path.join(DIST, urlPath));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

const checks = [];
function check(ok, title, detail = '') {
  checks.push({ ok: !!ok, title });
  console.log(`${ok ? '  ✓' : '  ✗'} ${title}${detail ? ` — ${detail}` : ''}`);
  if (!ok) throw new Error(`Проверка не прошла: ${title} ${detail}`);
}

// ---------------------------------------------------------------------------------------------
// Заглушка помощника: используется, только пока на сервере нет /api/assistant/message.
// Повторяет контракт: старт без текста идемпотентен, 4 реплики помощника, затем done.
// ---------------------------------------------------------------------------------------------
const MOCK_LINES = {
  kk: [
    'Сәлеметсіз бе! Мен Sabyr көмекшісімін. Айтыңызшы, осы аударымды жасауды қазір сізден телефон арқылы біреу сұрап тұр ма?',
    'Түсіндім. Ол адам өзін банк не полиция қызметкерімін деп таныстырды ма? Нағыз банк қызметкері ақшаны басқа шотқа аударуды ешқашан сұрамайды.',
    'Алушыны жеке танисыз ба? Бұрын осы адамға ақша аударып көрдіңіз бе?',
    'Рақмет. Асықпаңыз: тұтқаны қойып, жақыныңызбен ақылдасыңыз. Күмәніңіз болса, аударымнан бас тартқан дұрыс.',
  ],
  ru: [
    'Здравствуйте! Я помощник Sabyr. Скажите, вас сейчас кто-то просит сделать этот перевод по телефону?',
    'Понятно. Этот человек представился сотрудником банка или полиции? Настоящий банк никогда не просит переводить деньги на другой счёт.',
    'Вы лично знаете получателя? Переводили ли вы этому человеку раньше?',
    'Спасибо. Не спешите: положите трубку и посоветуйтесь с близким человеком. Если есть сомнения, перевод лучше отменить.',
  ],
};
const mockDialogs = new Map(); // transfer_id → { messages, level }
const transferActions = new Map(); // transfer_id → action из ответа /check

function mockState(id, lang) {
  if (!mockDialogs.has(id)) {
    mockDialogs.set(id, { messages: [{ role: 'assistant', text: MOCK_LINES[lang][0], created_at: new Date().toISOString() }] });
  }
  return mockDialogs.get(id);
}
function mockCanConfirm(id) {
  const d = mockDialogs.get(id);
  if (!d || transferActions.get(id) !== 'warn') return false;
  const turns = d.messages.filter((m) => m.role === 'assistant').length;
  return d.messages.some((m) => m.role === 'user') && turns >= 2;
}
function mockPayload(id, d) {
  const turns = d.messages.filter((m) => m.role === 'assistant').length;
  return {
    transfer_id: id, messages: d.messages, reply: d.messages[d.messages.length - 1], turn: turns, max_turns: 4,
    done: turns >= 4, provider: 'static', degraded: false, can_confirm: mockCanConfirm(id),
  };
}

async function installAssistantMock(context) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await context.route('**/api/assistant/message', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(req.postData() || '{}');
    const lang = (req.headers()['accept-language'] || 'ru').startsWith('kk') ? 'kk' : 'ru';
    const d = mockState(body.transfer_id, lang);
    const turns = d.messages.filter((m) => m.role === 'assistant').length;
    if (body.text) {
      if (turns >= 4) {
        return route.fulfill({
          status: 409, headers: cors, contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'dialog_finished', message: 'Диалог завершён' } }),
        });
      }
      d.messages.push({ role: 'user', text: body.text, created_at: new Date().toISOString() });
      d.messages.push({ role: 'assistant', text: MOCK_LINES[lang][turns], created_at: new Date().toISOString() });
    }
    await new Promise((r) => setTimeout(r, 400)); // имитация раздумий
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(mockPayload(body.transfer_id, d)) });
  });
  // Настоящий сервер не знает о диалоге заглушки, поэтому can_confirm для среднего риска
  // дописывается в ответ GET /api/transfers/<id> (только в режиме заглушки).
  await context.route(/\/api\/transfers\/[0-9a-f-]{36}$/, async (route) => {
    const res = await route.fetch();
    const id = route.request().url().split('/').pop();
    if (!res.ok() || !mockCanConfirm(id)) return route.fulfill({ response: res });
    const json = await res.json();
    if (['warned'].includes(json.status)) {
      json.can_confirm = true;
      json.blockers = [];
    }
    return route.fulfill({ response: res, json });
  });
}

async function assistantIsLive() {
  try {
    const res = await fetch(`${API}/api/assistant/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    return res.status !== 404 && res.status < 500;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------

async function newClient(browser, appUrl, mock) {
  const context = await browser.newContext({
    viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU',
  });
  // Адрес API кладётся в то же хранилище, что и поле в демо-меню.
  await context.addInitScript((api) => window.localStorage.setItem('sabyr.apiUrl', api), API);
  if (mock) await installAssistantMock(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('   [ошибка страницы]', e.message));
  page.on('response', async (res) => {
    if (res.url().endsWith('/api/transfers/check') && res.ok()) {
      try {
        const j = await res.json();
        transferActions.set(j.transfer_id, j.action);
      } catch { /* не JSON */ }
    }
  });
  await page.goto(appUrl);
  return { context, page };
}

const tid = (page, id) => page.getByTestId(id);
// На web экраны стека остаются в DOM, поэтому берём элемент верхнего (последнего) экрана.
const top = (page, id) => page.getByTestId(id).last();

async function shot(page, name) {
  await page.waitForTimeout(1300); // даём доиграть анимациям появления
  await page.screenshot({ path: path.join(SHOTS, name) });
  console.log(`   📷 ${name}`);
}

async function scrollTo(page, testId) {
  await top(page, testId).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);
}

async function login(page, name) {
  await tid(page, 'screen-login').waitFor();
  await page.getByText(name, { exact: true }).click();
  await tid(page, 'screen-home').waitFor();
}

async function openDemoMenu(page) {
  const logo = top(page, 'logo');
  for (let i = 0; i < 5; i += 1) await logo.click({ delay: 20 });
  await tid(page, 'screen-demo').waitFor();
}

async function fillTransfer(page, account, amount) {
  await top(page, 'tile-transfer').click();
  await tid(page, 'screen-transfer').waitFor();
  await top(page, 'input-account').fill(account);
  await top(page, 'input-amount').fill(String(amount));
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const health = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
  if (!health) throw new Error(`API недоступен: ${API}`);

  let served = null;
  let appUrl = process.env.E2E_APP_URL;
  if (!appUrl) {
    served = await serveDist();
    appUrl = served.url;
  }
  const mock = process.env.E2E_MOCK_ASSISTANT === '1';
  if (!mock && !(await assistantIsLive())) {
    throw new Error('Помощник (/api/assistant/message) не отвечает. Поднимите backend или запустите с E2E_MOCK_ASSISTANT=1 — '
      + 'тогда скриншоты чата будут с заглушкой, и это нельзя выдавать за работу LLM.');
  }
  console.log(`Приложение: ${appUrl}\nAPI: ${API}\nПомощник: ${mock ? 'ЗАГЛУШКА (перехват запросов в браузере)' : 'настоящий сервис'}`);

  const browser = await chromium.launch();
  try {
    // ---------- 1. Гульнара: вход, демо-меню, «идёт звонок» ----------
    console.log('\n1. Гульнара входит и включает сигнал «идёт звонок»');
    const g = await newClient(browser, appUrl, mock);
    await tid(g.page, 'screen-login').waitFor();
    await g.page.getByText('Гульнара Сейткали').waitFor();
    await shot(g.page, '01-login.png');
    await login(g.page, 'Гульнара Сейткали');
    const greeting = await tid(g.page, 'greeting').innerText();
    check(greeting.includes('Сәлеметсіз бе'), 'интерфейс Гульнары на казахском', greeting);
    const balanceBefore = await tid(g.page, 'balance').innerText();
    check(/\d[\d  ]+₸/.test(balanceBefore), 'баланс показан в формате «1 500 000 ₸»', balanceBefore);
    await shot(g.page, '02-home.png');

    await openDemoMenu(g.page);
    check(true, 'демо-меню открывается пятью нажатиями на логотип');
    await tid(g.page, 'toggle-call').click();
    await g.page.waitForFunction(() => document.querySelector('[data-testid="preview-on-call"]')?.textContent === 'true');
    check((await tid(g.page, 'preview-source').innerText()) === 'demo', 'сигнал on_call=true, source=demo');
    check((await tid(g.page, 'native-call').innerText()).length > 0, 'показания нативного модуля на web: «неизвестно»',
      await tid(g.page, 'native-call').innerText());
    await shot(g.page, '03-demo-menu.png');
    await top(g.page, 'back').click();

    // ---------- 2. Перевод 1 500 000 на счёт дропа ----------
    console.log('\n2. Перевод 1 500 000 ₸ на счёт дропа');
    await fillTransfer(g.page, DROP, 1500000);
    const typed = await top(g.page, 'input-amount').inputValue();
    check(typed.replace(/ /g, ' ') === '1 500 000', 'сумма форматируется при вводе', typed);
    await shot(g.page, '04-transfer-form.png');
    await top(g.page, 'transfer-continue').click();
    await tid(g.page, 'screen-sabyr').waitFor();

    const score = Number(await tid(g.page, 'risk-score').innerText());
    check(score > 70, 'риск выше 70', String(score));
    const reasons = await tid(g.page, 'reason').allInnerTexts();
    check(reasons.length === 3, 'показаны 3 причины', reasons.join(' | '));
    check(reasons.every((r) => /[әғқңөұүһі]/i.test(r)), 'причины на казахском');
    const timer = await tid(g.page, 'cooldown-timer').innerText();
    check(/^1[45]:\d\d$/.test(timer), 'таймер паузы идёт', timer);
    await tid(g.page, 'trusted-pending').waitFor();
    check((await tid(g.page, 'trusted-pending').innerText()).includes('Данияр'), 'запрос доверенному лицу ожидает ответа');
    check(/\d\d:\d\d/.test(await tid(g.page, 'trusted-until').innerText()), 'показано, до какого времени ждём ответа',
      await tid(g.page, 'trusted-until').innerText());
    check(await tid(g.page, 'trusted-call').isVisible(), 'есть кнопка «Позвонить» доверенному лицу');
    check(await tid(g.page, 'sabyr-confirm').isDisabled(), '«Всё равно перевести» недоступна');
    check(await tid(g.page, 'sabyr-cancel').isEnabled(), '«Отменить перевод» доступна');
    await tid(g.page, 'chat-assistant').first().waitFor({ timeout: 30000 });
    check(true, 'диалог с помощником стартовал сам');
    await shot(g.page, '05-sabyr-risk.png');
    await scrollTo(g.page, 'cooldown');
    await shot(g.page, '06-sabyr-cooldown-reasons.png');

    await tid(g.page, 'chat-quick-0').click();
    await g.page.waitForFunction(() => document.querySelectorAll('[data-testid="chat-assistant"]').length >= 2, null, { timeout: 60000 });
    await tid(g.page, 'chat-input').fill('Ол банктің қауіпсіздік қызметіненмін деді');
    await tid(g.page, 'chat-send').click();
    await g.page.waitForFunction(() => document.querySelectorAll('[data-testid="chat-assistant"]').length >= 3, null, { timeout: 60000 });
    check((await tid(g.page, 'chat-user').count()) === 2, 'ответы клиента (кнопка и свободный текст) ушли помощнику');
    check(await tid(g.page, 'sabyr-confirm').isDisabled(), 'при высоком риске диалог не снимает паузу');
    await scrollTo(g.page, 'scheme');
    await shot(g.page, '07-sabyr-scheme-chat.png');

    // ---------- 3. Данияр видит запрос и отклоняет ----------
    console.log('\n3. Данияр (доверенное лицо) отклоняет перевод');
    const d = await newClient(browser, appUrl, mock);
    await login(d.page, 'Данияр Сейткали');
    await tid(d.page, 'trusted-badge').waitFor({ timeout: 10000 });
    check((await tid(d.page, 'trusted-badge').innerText()) === '1', 'на главной Данияра значок: 1 запрос');
    await tid(d.page, 'tile-trusted').click();
    await tid(d.page, 'trusted-request').waitFor();
    const card = await tid(d.page, 'trusted-request').innerText();
    check(card.includes('Гульнара Сейткали') && card.replace(/ /g, ' ').includes('1 500 000 ₸'),
      'в запросе видно, кто и сколько переводит');
    check((await tid(d.page, 'trusted-reason').count()) === 3, 'доверенное лицо видит 3 причины');
    await shot(d.page, '08-trusted-request.png');
    check(await tid(d.page, 'trusted-decline').isVisible(), 'кнопки «Отклонить» / «Подтвердить» видны без прокрутки');
    await tid(d.page, 'trusted-decline').click();
    await tid(d.page, 'trusted-earlier').first().waitFor();
    check((await tid(d.page, 'trusted-request').count()) === 0, 'после отказа запрос ушёл из ожидающих');

    // ---------- 4. Экран Гульнары переходит в итоговое состояние ----------
    console.log('\n4. Экран Гульнары сам переключается на «перевод отклонён»');
    await tid(g.page, 'final-declined').waitFor({ timeout: 10000 });
    const finalText = await tid(g.page, 'final-text').innerText();
    check(finalText.includes('Данияр'), 'итог: Данияр отклонил перевод, деньги на счёте', finalText);
    await shot(g.page, '09-declined-final.png');
    await tid(g.page, 'final-home').click();
    await tid(g.page, 'screen-home').waitFor();
    await g.page.waitForTimeout(800);
    check((await tid(g.page, 'balance').innerText()) === balanceBefore, 'баланс не изменился', balanceBefore);

    // ---------- 5. Обычный перевод с низким риском ----------
    console.log('\n5. Перевод 20 000 ₸ другу — без вмешательства Sabyr');
    await openDemoMenu(g.page);
    await tid(g.page, 'toggle-call').click(); // звонок закончился
    await g.page.waitForFunction(() => document.querySelector('[data-testid="preview-on-call"]')?.textContent === 'false');
    await tid(g.page, 'fill-friend').click(); // быстрая подстановка счёта из демо-меню
    await tid(g.page, 'screen-transfer').waitFor();
    // счёт подставляется в useEffect уже после появления экрана — ждём значение, а не читаем сразу
    let filled = '';
    for (let i = 0; i < 30 && filled !== FRIEND; i++) {
      filled = await top(g.page, 'input-account').inputValue();
      if (filled !== FRIEND) await g.page.waitForTimeout(100);
    }
    check(filled === FRIEND, 'демо-меню подставило счёт друга', filled);
    await top(g.page, 'input-amount').fill('20000');
    await top(g.page, 'transfer-continue').click();
    await tid(g.page, 'screen-confirm').waitFor();
    check((await tid(g.page, 'screen-sabyr').count()) === 0, 'экран Sabyr не показан (action = allow)');
    await shot(g.page, '10-low-risk-confirm.png');
    await tid(g.page, 'confirm-submit').click();
    await tid(g.page, 'final-confirmed').waitFor();
    await tid(g.page, 'final-home').click();
    await tid(g.page, 'screen-home').waitFor();
    const expected = Number(balanceBefore.replace(/\D/g, '')) - 20000;
    await g.page.waitForFunction(
      (want) => Number(document.querySelector('[data-testid="balance"]')?.textContent.replace(/\D/g, '')) === want,
      expected, { timeout: 10000 });
    check(true, 'баланс уменьшился на 20 000 ₸', await tid(g.page, 'balance').innerText());

    // ---------- 6. История ----------
    console.log('\n6. История переводов');
    await tid(g.page, 'tile-history').click();
    await tid(g.page, 'history-item').first().waitFor();
    const history = (await tid(g.page, 'screen-history').innerText()).replace(/ /g, ' ');
    check(history.includes('1 500 000 ₸') && history.includes('20 000 ₸'), 'оба перевода есть в истории');
    await shot(g.page, '11-history.png');
    await g.context.close();
    await d.context.close();

    // ---------- 7. Средний риск: диалог открывает подтверждение; русский интерфейс ----------
    console.log('\n7. Средний риск (800 000 ₸ другу сразу после входа), интерфейс на русском');
    const m = await newClient(browser, appUrl, mock);
    await login(m.page, 'Гульнара Сейткали');
    await tid(m.page, 'lang-ru').click();
    await m.page.getByText('Здравствуйте', { exact: false }).waitFor();
    check(true, 'переключатель языка: интерфейс стал русским');
    await fillTransfer(m.page, FRIEND_PHONE, 800000);   // получатель — по номеру телефона
    await top(m.page, 'transfer-continue').click();
    await Promise.race([tid(m.page, 'screen-sabyr').waitFor(), tid(m.page, 'screen-confirm').waitFor()]);
    if ((await tid(m.page, 'screen-sabyr').count()) === 0) {
      console.log('   (!) сервер оценил перевод как низкий риск — сценарий среднего риска пропущен');
      await tid(m.page, 'confirm-cancel').click();
    } else {
      const level = await tid(m.page, 'risk-level').innerText();
      check(level === 'Средний', 'уровень риска — средний', level);
      const ruReasons = await tid(m.page, 'reason').allInnerTexts();
      check(ruReasons.length > 0 && ruReasons.every((r) => !/[әғқңөұүһі]/i.test(r)), 'причины пришли на русском', ruReasons.join(' | '));
      check(await tid(m.page, 'sabyr-confirm').isDisabled(), 'до диалога подтверждение недоступно');
      await tid(m.page, 'chat-assistant').first().waitFor({ timeout: 30000 });
      await tid(m.page, 'chat-quick-1').click();
      await m.page.waitForFunction(() => document.querySelectorAll('[data-testid="chat-assistant"]').length >= 2, null, { timeout: 60000 });
      await m.page.waitForFunction(() => !document.querySelector('[data-testid="sabyr-confirm"]')?.hasAttribute('disabled')
        && document.querySelector('[data-testid="sabyr-confirm"]')?.getAttribute('aria-disabled') !== 'true', null, { timeout: 15000 });
      check(true, `после ответа помощнику «Всё равно перевести» доступна${mock ? ' (can_confirm из заглушки)' : ''}`);
      await scrollTo(m.page, 'assistant-chat');
      await shot(m.page, '12-medium-risk-chat-ru.png');
      // Отвечаем до конца диалога: после последней реплики поле ввода скрывается.
      for (let i = 0; i < 6 && (await tid(m.page, 'chat-done').count()) === 0; i += 1) {
        const before = await tid(m.page, 'chat-assistant').count();
        await tid(m.page, 'chat-quick-2').click();
        await m.page.waitForFunction((n) => document.querySelectorAll('[data-testid="chat-assistant"]').length > n, before, { timeout: 60000 });
        await m.page.waitForTimeout(300);
      }
      check((await tid(m.page, 'chat-done').count()) === 1 && (await tid(m.page, 'chat-input').count()) === 0,
        'после последней реплики помощника (done) поле ввода скрыто');
      await tid(m.page, 'sabyr-cancel').click();
      await tid(m.page, 'final-cancelled').waitFor();
      check(true, 'отмена перевода клиентом → итог «Перевод отменён»');
    }
    await m.page.getByTestId('final-home').last().click().catch(() => {});
    await tid(m.page, 'screen-home').waitFor();
    await tid(m.page, 'lang-kz').click(); // возвращаем Гульнаре казахский язык (PATCH /api/me)
    await m.page.getByText('Сәлеметсіз бе', { exact: false }).waitFor();
    await m.page.waitForTimeout(500);
    await m.context.close();

    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\nИтог: ${checks.length - failed} из ${checks.length} проверок прошли. Скриншоты: ${SHOTS}`);
  } finally {
    await browser.close();
    if (served) served.server.close();
  }
}

main().catch((e) => {
  console.error(`\nПрогон остановлен: ${e.message}`);
  process.exit(1);
});
