/* Трёхмерная сцена демо Sabyr: ночной город, квартира Гульнары, мошенник, Данияр на улице, два банка и прохожие.
   Сцена — фон для слайдов фильма. Движок слайдов (deck.js) сообщает, какой шаг показывать: SabyrScene.setBeat(id, step).
   Всё собрано из простых фигур, без моделей и текстур из файлов. Библиотека — three.js (../lib/, лицензия MIT). */
import * as THREE from '../lib/three.module.js';

const W = 1920;
const H = 1080;
const canvas = document.getElementById('world');
const bubblesBox = document.getElementById('bubbles');
const rand = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- места действия ----------
const FLAT = V(-18, 0, -9);    // квартира Гульнары
const DEN = V(22, 0, -10);     // комната мошенника
const BANK_A = V(-6.5, 0, -22);
const BANK_B = V(9.5, 0, -22);
const STREET_Z = 5.2;          // тротуар, по которому идёт Данияр

// ---------- кадры: куда смотрит камера и что происходит на каждом шаге ----------
// cam, look — положение и цель камеры; shift — сдвиг кадра влево (когда справа телефон);
// state — состояние сцены; bubbles — реплики в облачках над точкой сцены.
const WIDE = { cam: [3, 19, 60], look: [1, 8, -20] };
const BEATS = {
  's-title': [
    { ...WIDE },
    { cam: [1, 15, 46], look: [0, 6.5, -20] },
  ],
  's-story': [
    { cam: [-13, 6.5, 5.5], look: [-18, 1.6, -9], state: { gulnara: 'idle' } },
    { cam: [26.5, 4.4, -2.6], look: [21.4, 1.7, -11.2], state: { call: 1, gulnara: 'phone' },
      bubbles: [{ at: [22.3, 3.5, -11.4], tone: 'scam', text: '«Служба безопасности банка. На вас оформляют кредит»' }] },
    { cam: [-12.5, 5.2, 3], look: [-18, 1.6, -9], state: { call: 1, gulnara: 'phone' },
      bubbles: [{ at: [-17.6, 4.1, -9], tone: 'scam', text: '«Срочно переведите деньги на безопасный счёт. Трубку не кладите»' }] },
    { cam: [3, 25, 34], look: [2, 3.5, -8], state: { call: 1, gulnara: 'look', token: 'fly' },
      bubbles: [{ follow: 'token', tone: 'money', text: '1 500 000 ₸' }] },
    { cam: [6, 21, 30], look: [3, 4, -8], state: { call: 1, gulnara: 'look', token: 'fly' },
      bubbles: [{ follow: 'token', tone: 'money', text: '1 500 000 ₸' }] },
  ],
  's-flow': [
    { cam: [-9.5, 5.4, 2.6], look: [-17.2, 1.7, -9], shift: 9, state: { call: 1, gulnara: 'look', token: 'fly' } },
    { cam: [-4, 17, 22], look: [-7, 3.5, -8], shift: 9, state: { call: 1, gulnara: 'look', token: 'hold', dome: 1 },
      bubbles: [{ follow: 'token', tone: 'ok', text: 'Пауза' }] },
    { cam: [8, 4.6, 15], look: [3.2, 1.6, STREET_Z], shift: 9, state: { call: 1, gulnara: 'look', token: 'hold', dome: 1, daniyar: 'stop' },
      bubbles: [{ follow: 'daniyar', tone: 'app', text: 'Мама просит посмотреть перевод' }] },
    { cam: [-10.5, 4.8, 1.5], look: [-17.4, 1.7, -9], shift: 9, state: { call: 1, gulnara: 'look', token: 'hold', dome: 1, daniyar: 'stop' },
      bubbles: [{ at: [-17.6, 4.1, -9], tone: 'app', text: 'Вам сейчас звонит кто-то от имени банка?' }] },
    { cam: [7, 4.2, 13.5], look: [3.2, 1.6, STREET_Z], shift: 9, state: { call: 1, gulnara: 'look', token: 'hold', dome: 1, daniyar: 'decline' },
      bubbles: [{ follow: 'daniyar', tone: 'warn', text: 'Отклонить' }] },
    { cam: [-5, 15, 19], look: [-10, 3, -8], shift: 9, state: { gulnara: 'idle', token: 'back', dome: 1, daniyar: 'walk' },
      bubbles: [{ at: [-18, 5.2, -9], tone: 'ok', text: 'Деньги остались' }] },
  ],
  's-ledger': [
    { cam: [1.5, 13, 16], look: [1.5, 7, -22], state: { dome: 1 } },
    { cam: [-3, 9.5, 6], look: [-6, 6, -22], state: { dome: 1, flag: 1 },
      bubbles: [{ at: [-6.5, 11.4, -22], tone: 'ok', text: 'Банк А: перевод остановлен, счёт помечен' }] },
    { cam: [1.5, 17, 20], look: [1.5, 8.5, -22], state: { dome: 1, flag: 1, block1: 1 },
      bubbles: [{ follow: 'block1', tone: 'code', text: 'отметка счёта · HMAC-SHA256' }] },
    { cam: [6, 5, -4], look: [10, 2.8, -17], state: { dome: 1, flag: 1, block1: 1, warn: 1 },
      bubbles: [{ follow: 'clientB', tone: 'warn', text: 'Этот счёт отмечен другим банком' }] },
    { cam: [1.5, 18, 22], look: [1.5, 8.5, -22], state: { dome: 1, flag: 1, block1: 1, block2: 1, warn: 1 },
      bubbles: [{ follow: 'block2', tone: 'code', text: 'доказательство предупреждения' }] },
  ],
  's-end': [
    { cam: [-4, 14, 30], look: [-5, 5, -16], state: { dome: 1, block1: 1, block2: 1 } },
    { cam: [1, 17, 46], look: [0, 7, -20], state: { dome: 1, block1: 1, block2: 1 } },
    { ...WIDE, state: { dome: 1, block1: 1, block2: 1 } },
  ],
};
const DEFAULT_STATE = { call: 0, gulnara: 'idle', token: 'none', dome: 0, daniyar: 'walk', flag: 0, block1: 0, block2: 0, warn: 0 };

// ---------- рендер ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  renderer = null;
}

if (renderer) start();

function start() {
  document.body.classList.add('has3d');
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1424);
  scene.fog = new THREE.Fog(0x0b1424, 70, 170);
  const camera = new THREE.PerspectiveCamera(38, W / H, 0.5, 400);

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra });
  const glow = (color, intensity = 1) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
  const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    return m;
  };

  // свет: ночное небо, луна, тёплые и тревожные пятна
  scene.add(new THREE.HemisphereLight(0xa9bdf0, 0x1a2540, 2.1));
  const moon = new THREE.DirectionalLight(0xcfdcff, 2.2);
  moon.position.set(-20, 40, 50);
  scene.add(moon);
  const lamp = (color, intensity, x, y, z, distance = 18) => {
    const l = new THREE.PointLight(color, intensity, distance, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  };

  // ---------- земля, улица ----------
  scene.add(box(260, 0.2, 260, mat(0x121c30), 0, -0.1, 0));
  scene.add(box(120, 0.06, 6.4, mat(0x0c1321), 0, 0.03, 0));          // дорога
  scene.add(box(120, 0.14, 2.6, mat(0x222e48), 0, 0.07, STREET_Z));   // тротуары
  scene.add(box(120, 0.14, 2.6, mat(0x222e48), 0, 0.07, -STREET_Z));
  for (let x = -56; x <= 56; x += 6) scene.add(box(2.6, 0.02, 0.18, mat(0x3a4763), x, 0.07, 0));
  for (let x = -48; x <= 48; x += 16) {                                // фонари
    scene.add(box(0.14, 4.4, 0.14, mat(0x2b3852), x, 2.2, 3.6));
    scene.add(box(0.5, 0.14, 0.3, glow(0xffd9a0, 2.2), x, 4.4, 3.4));
    lamp(0xffcf8a, 22, x, 4.1, 4.4, 13);
  }
  const tree = (x, z, s = 1) => {
    scene.add(box(0.24 * s, 1.2 * s, 0.24 * s, mat(0x2a2a30), x, 0.6 * s, z));
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25 * s, 0), mat(0x1f3d3a, { flatShading: true }));
    crown.position.set(x, 2.1 * s, z);
    scene.add(crown);
  };
  [[-30, 8.5], [-27, -15], [-11, 8.6], [1.5, -19], [10.5, 8.4], [30, 8.6], [31, -15], [-36, -6.5], [38, 7], [17.5, -18]]
    .forEach(([x, z], n) => tree(x, z, 0.9 + (n % 3) * 0.18));

  // ---------- город вокруг: дома с окнами, горы, телебашня, звёзды ----------
  function windowsTexture(seed) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#18233a';
    g.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 122; y += 10) for (let x = 5; x < 60; x += 9) {
      const lit = ((x * 31 + y * 17 + seed * 53) % 11) < 4;
      g.fillStyle = lit ? (((x + y + seed) % 3) ? '#ffd58a' : '#ffe9c2') : '#1f2c47';
      g.fillRect(x, y, 5, 6);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  }
  const windowMaps = [0, 1, 2, 3].map(windowsTexture);
  /** Фасад с окнами: рисунок повторяется по размеру дома, чтобы окна были одного масштаба. */
  const facade = (n, w, h) => {
    const t = windowMaps[n % 4].clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / 13)));
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 1 });
  };
  for (let n = 0; n < 110; n += 1) {
    const x = (rand() - 0.5) * 230;
    const z = -34 - rand() * 80;                 // город — только позади сцены, камера смотрит на него
    const w = 6 + rand() * 8;
    const h = 6 + rand() * 22 + (Math.abs(x) > 60 ? 8 : 0);
    scene.add(box(w, h, 6 + rand() * 6, facade(n, w, h), x, h / 2, z));
  }
  [[-44, -14, 12, 16], [-52, 2, 10, 11], [44, -16, 12, 18], [50, 0, 10, 12], [-40, -30, 14, 24], [40, -32, 14, 22]]
    .forEach(([x, z, w, h], n) => scene.add(box(w, h, 9, facade(n + 1, w, h), x, h / 2, z)));
  function ridge(z, base, amp, color, drop = 0) {
    const s = new THREE.Shape();
    s.moveTo(-190, 0);
    for (let x = -190, k = 0; x <= 190; x += 10, k += 1) {
      const peak = base + amp * (0.55 + 0.45 * Math.sin(k * 1.7) * Math.cos(k * 0.6)) + ((k * 37) % 7);
      s.lineTo(x, Math.max(2, peak - drop));
    }
    s.lineTo(190, 0);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color, fog: false }));
    m.position.z = z;
    return m;
  }
  scene.add(ridge(-150, 30, 18, 0xc9d4ea));        // снежные вершины
  scene.add(ridge(-149, 30, 18, 0x1c2742, 8));     // склоны
  scene.add(ridge(-130, 14, 9, 0x141d33));         // предгорья
  const tower = box(0.7, 26, 0.7, glow(0xffd9a0, 0.9), -74, 21, -118);
  scene.add(tower, box(2.2, 2.4, 2.2, glow(0xffd9a0, 1.2), -74, 29, -118));
  {
    const pts = [];
    for (let n = 0; n < 260; n += 1) pts.push((rand() - 0.5) * 380, 60 + rand() * 90, -160 - rand() * 30);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.9, fog: false })));
  }

  // ---------- подписи на зданиях ----------
  function sign(text, w, h, fg = '#f3f1ec', bg = '#0f2742') {
    const c = document.createElement('canvas');
    c.width = 512; c.height = Math.round(512 * (h / w));
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = fg;
    g.font = `800 ${Math.round(c.height * 0.56)}px Onest, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9 }));
  }

  // ---------- квартира Гульнары: комната в разрезе ----------
  {
    const g = new THREE.Group();
    g.position.copy(FLAT);
    g.add(box(9, 0.3, 7, mat(0x6b5642), 0, 0.15, 0));                 // пол
    g.add(box(9, 4.2, 0.3, mat(0xd9cdb8), 0, 2.4, -3.5));             // дальняя стена
    g.add(box(0.3, 4.2, 7, mat(0xcfc2ab), -4.5, 2.4, 0));             // боковая стена
    g.add(box(3.4, 0.08, 2.4, mat(0x8c3f35), 0.4, 0.34, 0.3));        // ковёр
    g.add(box(3, 0.9, 1.1, mat(0x4f6b74), -2.2, 0.75, -2.6));         // диван
    g.add(box(3, 0.8, 0.3, mat(0x435c64), -2.2, 1.5, -3.1));
    g.add(box(1.1, 0.7, 1.1, mat(0x7a5a3c), 2.6, 0.65, -2.5));        // тумба
    g.add(box(0.12, 1.5, 0.12, mat(0x3a3a3a), 3.5, 1.05, -2.9));      // торшер
    g.add(box(0.7, 0.5, 0.7, glow(0xffd7a0, 2.4), 3.5, 2, -2.9));
    g.add(box(2.4, 1.7, 0.1, glow(0x35507e, 0.7), 1, 2.6, -3.32));    // окно
    g.add(box(1.2, 0.9, 0.08, mat(0x8a6f52), -2.4, 2.9, -3.3));       // картина
    scene.add(g);
    lamp(0xffc98a, 26, FLAT.x + 2.4, 2.8, FLAT.z - 1.6, 16);
  }

  // ---------- комната мошенника ----------
  {
    const g = new THREE.Group();
    g.position.copy(DEN);
    g.add(box(8, 0.3, 6.4, mat(0x1b1d26), 0, 0.15, 0));
    g.add(box(8, 4, 0.3, mat(0x232632), 0, 2.3, -3.2));
    g.add(box(0.3, 4, 6.4, mat(0x1f222d), 4, 2.3, 0));
    [-2.4, -0.8, 0.8, 2.4].forEach((x, n) => g.add(box(1.3, 0.85, 0.06, glow(n % 2 ? 0xff5a4a : 0xff8a5a, 1.5), x, 2.5, -3.02))); // экраны на стене
    g.add(box(3.4, 0.12, 1.1, mat(0x3a3340), 0, 1.02, -0.5));          // стол перед ним
    g.add(box(0.12, 1, 1, mat(0x3a3340), -1.6, 0.52, -0.5), box(0.12, 1, 1, mat(0x3a3340), 1.6, 0.52, -0.5));
    g.add(box(0.7, 0.04, 0.5, mat(0x555a6a), 0, 1.1, -0.5), box(0.7, 0.46, 0.04, glow(0xff6a5a, 1.2), 0, 1.34, -0.74)); // ноутбук
    g.add(box(0.8, 0.12, 0.8, mat(0x2a2c38), 0, 0.72, -1.6));           // табурет
    scene.add(g);
    lamp(0xff5040, 22, DEN.x, 2.6, DEN.z - 0.8, 14);
  }

  // ---------- банки ----------
  function bank(pos, name, accent) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(box(11, 8, 7, mat(0x2a3956), 0, 4, 0));
    g.add(box(12, 0.5, 8, mat(0x384a6c), 0, 8.25, 0));
    g.add(box(12, 0.5, 2.6, mat(0x384a6c), 0, 0.25, -4.6));           // ступени (к улице)
    [-4, -1.35, 1.35, 4].forEach((x) => g.add(box(0.7, 6.4, 0.7, mat(0xdfe5f1), x, 3.7, -4.1)));
    g.add(box(2.6, 3.4, 0.1, glow(0xffe2b0, 1.3), 0, 1.95, -3.56));    // вход
    [-3.2, 3.2].forEach((x) => g.add(box(1.6, 2.2, 0.1, glow(0xffe2b0, 0.9), x, 4.6, -3.56)));
    const label = sign(name, 6.4, 1.3);
    label.position.set(0, 7.2, -3.6);
    label.rotation.y = Math.PI;
    g.add(label);
    g.add(box(11.2, 0.16, 0.16, glow(accent, 2), 0, 8.6, -4));
    g.rotation.y = Math.PI;                                              // фасадом к улице и к камере
    scene.add(g);
    lamp(0xffe0b0, 14, pos.x, 3, pos.z + 6, 13);
    return g;
  }
  bank(BANK_A, 'БАНК А', 0x4fd6bb);
  bank(BANK_B, 'БАНК Б', 0xe2a52b);

  // ---------- человечки ----------
  function person({ shirt, pants = 0x27334d, skin = 0xe3b891, hair = 0x2b2320, height = 1, phone = false, bun = false, hood = false }) {
    const g = new THREE.Group();
    const part = (w, h, d, color, pivotY, x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, pivotY, 0);
      const m = box(w, h, d, mat(color), 0, -h / 2, 0);
      pivot.add(m);
      g.add(pivot);
      return pivot;
    };
    const legL = part(0.19, 0.86, 0.21, pants, 0.88, -0.12);
    const legR = part(0.19, 0.86, 0.21, pants, 0.88, 0.12);
    const torso = box(0.5, 0.66, 0.28, mat(shirt), 0, 1.2, 0);
    g.add(torso);
    const armL = part(0.14, 0.62, 0.16, shirt, 1.5, -0.33);
    const armR = part(0.14, 0.62, 0.16, shirt, 1.5, 0.33);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), mat(skin));
    head.position.y = 1.74;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.205, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(hood ? shirt : hair));
    cap.position.y = 1.76;
    cap.rotation.x = -0.25;
    g.add(cap);
    if (bun) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(hair)); b.position.set(0, 1.86, -0.17); g.add(b); }
    if (phone) {
      const p = box(0.1, 0.19, 0.03, glow(0xcfe6ff, 1.6), 0, -0.66, 0.1);
      armR.add(p);
    }
    g.scale.setScalar(height);
    g.userData = { legL, legR, armL, armR, head, phase: rand() * 6, pose: 'idle', gait: 0 };
    scene.add(g);
    return g;
  }
  /** Поза человечка: gait 0..1 — насколько он шагает; pose — что делают руки. */
  function animate(p, t, dt) {
    const u = p.userData;
    const walking = u.pose === 'walk' ? 1 : 0;
    u.gait += (walking - u.gait) * Math.min(1, dt * 6);
    const swing = Math.sin(t * 7.2 + u.phase) * 0.62 * u.gait;
    const target = { ll: swing, lr: -swing, al: -swing * 0.8, ar: swing * 0.8, az: 0, head: 0, sit: 0 };
    if (u.pose === 'phone') { target.ar = -2.5; target.az = -0.35; target.head = 0.08; }
    if (u.pose === 'look') { target.ar = -1.15; target.head = 0.28; }
    if (u.pose === 'sit') { target.ll = -1.5; target.lr = -1.5; target.ar = -2.5; target.az = -0.35; target.sit = 1; }
    if (u.pose === 'no') { target.ar = -1.15; target.head = 0.2; }
    const k = Math.min(1, dt * 8);
    u.legL.rotation.x += (target.ll - u.legL.rotation.x) * k;
    u.legR.rotation.x += (target.lr - u.legR.rotation.x) * k;
    u.armL.rotation.x += (target.al - u.armL.rotation.x) * k;
    u.armR.rotation.x += (target.ar - u.armR.rotation.x) * k;
    u.armR.rotation.z += (target.az - u.armR.rotation.z) * k;
    u.head.rotation.x += (target.head - u.head.rotation.x) * k;
    u.head.rotation.y = u.pose === 'no' ? Math.sin(t * 9) * 0.45 : u.head.rotation.y * (1 - k);
    p.position.y = (u.baseY ?? 0) + Math.abs(Math.sin(t * 7.2 + u.phase)) * 0.05 * u.gait - target.sit * 0.36;
  }

  const gulnara = person({ shirt: 0x7a4b6b, pants: 0x3b3550, hair: 0xb9b6b0, bun: true, phone: true, height: 0.96 });
  gulnara.position.set(FLAT.x + 0.6, 0.3, FLAT.z + 0.2);
  gulnara.userData.baseY = 0.3;
  gulnara.rotation.y = 0.5;
  const scammer = person({ shirt: 0x24252e, pants: 0x1a1b22, hood: true, phone: true });
  scammer.position.set(DEN.x, 0.3, DEN.z - 1.6);
  scammer.userData.baseY = 0.3;
  scammer.userData.pose = 'sit';
  scammer.rotation.y = 0.25;
  const daniyar = person({ shirt: 0x2f6f8f, pants: 0x232c40, phone: true, height: 1.04 });
  daniyar.userData.x = -9;
  const clientB = person({ shirt: 0xb07a3a, pants: 0x2b2f3d, phone: true });
  clientB.position.set(BANK_B.x + 1.2, 0.5, BANK_B.z + 5.4);
  clientB.userData.baseY = 0.5;
  clientB.rotation.y = 0.2;
  clientB.userData.pose = 'look';
  const palette = [0xc2573f, 0x4d8f6b, 0xd3b24a, 0x7a66b5, 0x4a78b8, 0xb5607f, 0x8a8f9a, 0x3f9a9a];
  const walkers = palette.map((shirt, n) => {
    const w = person({ shirt, pants: n % 2 ? 0x2a3042 : 0x3a3340, hair: n % 3 ? 0x2b2320 : 0x6b4a2f, height: 0.92 + (n % 4) * 0.05 });
    w.userData.dir = n % 2 ? 1 : -1;
    w.userData.z = (n % 2 ? STREET_Z : -STREET_Z) + ((n % 3) - 1) * 0.55;
    w.userData.x = -50 + n * 13.5;
    w.userData.speed = 1.25 + (n % 3) * 0.22;
    w.userData.pose = 'walk';
    return w;
  });

  // ---------- звонок: точки бегут от мошенника к Гульнаре ----------
  const callCurve = new THREE.QuadraticBezierCurve3(V(DEN.x, 2.1, DEN.z), V(2, 15, -11), V(FLAT.x + 0.6, 2, FLAT.z));
  const callDots = Array.from({ length: 22 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow(0xff5a4a, 2.4));
    scene.add(m);
    return m;
  });

  // ---------- перевод: светящаяся «монета» летит к мошеннику, Sabyr её останавливает ----------
  const tokenCurve = new THREE.QuadraticBezierCurve3(V(FLAT.x + 0.8, 1.8, FLAT.z + 0.3), V(1, 11, -7), V(DEN.x - 0.5, 1.9, DEN.z));
  const token = new THREE.Group();
  token.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), glow(0xffcf5a, 2.6)));
  const tokenLight = new THREE.PointLight(0xffcf5a, 16, 12, 1.8);
  token.add(tokenLight);
  const pauseRing = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.09, 10, 48), glow(0x4fd6bb, 2.6));
  const pauseBars = new THREE.Group();
  pauseBars.add(box(0.22, 0.9, 0.12, glow(0x4fd6bb, 2.6), -0.24, 1.95, 0), box(0.22, 0.9, 0.12, glow(0x4fd6bb, 2.6), 0.24, 1.95, 0));
  token.add(pauseRing, pauseBars);
  scene.add(token);
  let tokenU = 0;
  let tokenShow = 0;

  // ---------- защита: купол над квартирой ----------
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(7.4, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4fd6bb, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  dome.position.set(FLAT.x, 0.05, FLAT.z);
  const domeEdge = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.07, 8, 80), glow(0x4fd6bb, 2));
  domeEdge.rotation.x = Math.PI / 2;
  domeEdge.position.set(FLAT.x, 0.12, FLAT.z);
  scene.add(dome, domeEdge);

  // ---------- реестр: блоки между банками ----------
  const chainCurve = new THREE.QuadraticBezierCurve3(V(BANK_A.x, 9.6, BANK_A.z), V(1.5, 14.5, BANK_A.z), V(BANK_B.x, 9.6, BANK_B.z));
  {
    const geo = new THREE.BufferGeometry().setFromPoints(chainCurve.getPoints(40));
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4fd6bb, transparent: true, opacity: 0.45 })));
  }
  function block(slot) {
    const g = new THREE.Group();
    g.add(box(1.5, 1.5, 1.5, new THREE.MeshStandardMaterial({ color: 0x0f2742, emissive: 0x4fd6bb, emissiveIntensity: 0.55, roughness: 0.4 })));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.56, 1.56, 1.56)), new THREE.LineBasicMaterial({ color: 0x9ff0dd })));
    g.userData = { slot, u: 0, show: 0 };
    g.scale.setScalar(0.001);
    scene.add(g);
    return g;
  }
  const block1 = block(0.36);
  const block2 = block(0.64);
  const flag = box(0.9, 0.9, 0.9, glow(0xe77a48, 2.2), BANK_A.x, 9.6, BANK_A.z);
  flag.rotation.set(0.6, 0.7, 0);
  scene.add(flag);
  const anchors = { token, daniyar, clientB, block1, block2 };

  // ---------- состояние и камера ----------
  const state = { ...DEFAULT_STATE };
  const cam = { pos: V(...WIDE.cam), look: V(...WIDE.look), shift: 0 };
  const goal = { pos: cam.pos.clone(), look: cam.look.clone(), shift: 0 };
  let bubbles = [];

  function setBeat(id, step, snap) {
    const beats = BEATS[id];
    document.body.classList.toggle('world-dim', !beats);
    const beat = beats ? beats[Math.min(step, beats.length - 1)] : WIDE;
    goal.pos.set(...beat.cam);
    goal.look.set(...beat.look);
    goal.shift = beat.shift ?? 0;
    Object.assign(state, DEFAULT_STATE, beat.state);
    if (snap) { cam.pos.copy(goal.pos); cam.look.copy(goal.look); cam.shift = goal.shift; }
    bubblesBox.replaceChildren();
    bubbles = (beat.bubbles ?? []).map((b, n) => {
      const el = document.createElement('div');
      el.className = `bubble3d ${b.tone}`;
      el.textContent = b.text;
      el.style.animationDelay = `${0.55 + n * 0.25}s`;
      bubblesBox.append(el);
      return { ...b, el, point: b.at ? V(...b.at) : null };
    });
  }

  const tmp = V(0, 0, 0);
  function placeBubbles() {
    for (const b of bubbles) {
      if (b.point) tmp.copy(b.point);
      else {
        anchors[b.follow].getWorldPosition(tmp);
        tmp.y += b.follow === 'token' ? 1.9 : b.follow.startsWith('block') ? 1.7 : 2.5;
      }
      tmp.project(camera);
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.2;
      b.el.style.visibility = visible ? 'visible' : 'hidden';
      b.el.style.left = `${((tmp.x + 1) / 2) * W}px`;
      b.el.style.top = `${((1 - tmp.y) / 2) * H}px`;
    }
  }

  let last = performance.now();
  let t = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;

    // камера плавно догоняет цель и чуть «дышит»
    const k = 1 - Math.exp(-dt * 1.9);
    cam.pos.lerp(goal.pos, k);
    cam.look.lerp(goal.look, k);
    cam.shift += (goal.shift - cam.shift) * k;
    camera.position.set(cam.pos.x + Math.sin(t * 0.21) * 0.5, cam.pos.y + Math.sin(t * 0.17) * 0.25, cam.pos.z + Math.cos(t * 0.19) * 0.5);
    camera.lookAt(cam.look);
    if (Math.abs(camera.filmOffset - cam.shift) > 0.01) { camera.filmOffset = cam.shift; camera.updateProjectionMatrix(); }

    // прохожие
    for (const w of walkers) {
      const u = w.userData;
      u.x += u.dir * u.speed * dt;
      if (u.x > 56) u.x = -56;
      if (u.x < -56) u.x = 56;
      w.position.set(u.x, 0.14, u.z);
      u.baseY = 0.14;
      w.rotation.y = u.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      animate(w, t, dt);
    }
    // Данияр идёт по улице, останавливается, когда приходит просьба
    {
      const u = daniyar.userData;
      const stopped = state.daniyar !== 'walk';
      u.pose = state.daniyar === 'stop' ? 'look' : state.daniyar === 'decline' ? 'no' : 'walk';
      const targetX = stopped ? 3.2 : u.x + 1;
      if (stopped) u.x += (targetX - u.x) * Math.min(1, dt * 2.2);
      else { u.x += 1.5 * dt; if (u.x > 40) u.x = -40; }
      if (stopped && Math.abs(targetX - u.x) > 0.4) u.pose = 'walk';
      daniyar.position.set(u.x, 0.14, STREET_Z);
      u.baseY = 0.14;
      const face = stopped && u.pose !== 'walk' ? Math.PI * 0.2 : Math.PI / 2;
      daniyar.rotation.y += (face - daniyar.rotation.y) * Math.min(1, dt * 5);
      animate(daniyar, t, dt);
    }
    gulnara.userData.pose = state.gulnara;
    animate(gulnara, t, dt);
    animate(scammer, t, dt);
    animate(clientB, t, dt);

    // звонок
    callDots.forEach((dot, n) => {
      const u = ((t * 0.16 + n / callDots.length) % 1);
      dot.position.copy(callCurve.getPoint(u));
      const s = state.call ? 0.6 + 0.6 * Math.sin(u * Math.PI) : 0.001;
      dot.scale.setScalar(dot.scale.x + (s - dot.scale.x) * Math.min(1, dt * 6));
    });

    // перевод
    const flying = state.token === 'fly';
    const targetU = state.token === 'fly' ? 0.86 : state.token === 'hold' ? Math.min(Math.max(tokenU, 0.34), 0.46) : 0;
    const speed = flying ? 0.075 : state.token === 'back' ? 0.5 : 0.6;
    tokenU += Math.sign(targetU - tokenU) * Math.min(Math.abs(targetU - tokenU), speed * dt);
    const wantShow = state.token === 'none' ? 0 : state.token === 'back' && tokenU < 0.02 ? 0 : 1;
    tokenShow += (wantShow - tokenShow) * Math.min(1, dt * 5);
    token.position.copy(tokenCurve.getPoint(tokenU));
    token.position.y += Math.sin(t * 2.4) * 0.12;
    token.scale.setScalar(Math.max(0.001, tokenShow));
    tokenLight.intensity = 16 * tokenShow;
    const held = state.token === 'hold' ? 1 : 0;
    pauseRing.scale.setScalar(pauseRing.scale.x + (Math.max(0.001, held) - pauseRing.scale.x) * Math.min(1, dt * 6));
    pauseBars.scale.copy(pauseRing.scale);
    pauseRing.lookAt(camera.position);
    pauseBars.lookAt(camera.position);

    // купол
    const domeGoal = state.dome ? 0.13 + Math.sin(t * 1.6) * 0.03 : 0;
    dome.material.opacity += (domeGoal - dome.material.opacity) * Math.min(1, dt * 3);
    domeEdge.scale.setScalar(domeEdge.scale.x + ((state.dome ? 1 : 0.001) - domeEdge.scale.x) * Math.min(1, dt * 3));

    // реестр
    flag.scale.setScalar(flag.scale.x + ((state.flag && !state.block1 ? 1 : 0.001) - flag.scale.x) * Math.min(1, dt * 6));
    flag.rotation.y += dt * 1.4;
    for (const [b, on] of [[block1, state.block1], [block2, state.block2]]) {
      const u = b.userData;
      u.show += ((on ? 1 : 0) - u.show) * Math.min(1, dt * 5);
      u.u += ((on ? u.slot : 0) - u.u) * Math.min(1, dt * 1.6);
      b.position.copy(chainCurve.getPoint(u.u));
      b.scale.setScalar(Math.max(0.001, u.show));
      b.rotation.y += dt * 0.5;
    }
    clientB.userData.pose = state.warn ? 'no' : 'look';

    placeBubbles();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function resize() {
    const k = Math.min(innerWidth / W, innerHeight / H);
    renderer.setPixelRatio(Math.min(2, Math.max(0.5, k * (window.devicePixelRatio || 1))));
    renderer.setSize(W, H, false);
  }
  addEventListener('resize', resize);
  resize();

  window.SabyrScene = { setBeat };
  const now = window.SabyrDeck?.current?.();
  if (now) setBeat(now.id, now.step, true);
  requestAnimationFrame(frame);
}
