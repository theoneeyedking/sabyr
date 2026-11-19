/* Трёхмерная сцена демо Sabyr: ночной город, квартира Гульнары, колл-центр мошенников, Данияр на улице, два банка,
   прохожие, машины, кафе и остановка. Сцена — фон для слайдов фильма. Движок слайдов (deck.js) сообщает, какой шаг
   показывать: SabyrScene.setBeat(id, step). Всё собрано из простых фигур, без файлов моделей и текстур.
   Библиотека — three.js (../lib/, лицензия MIT). */
import * as THREE from '../lib/three.module.js';

const W = 1920;
const H = 1080;
const canvas = document.getElementById('world');
const bubblesBox = document.getElementById('bubbles');
const rand = (() => { let s = 11; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- места действия ----------
const FLAT = V(-18, 0, -9);    // квартира Гульнары
const DEN = V(22, 0, -10);     // колл-центр мошенников
const BANK_A = V(-6.5, 0, -22);
const BANK_B = V(9.5, 0, -22);
const STREET_Z = 5.2;          // тротуар, по которому идёт Данияр

// ---------- кадры: куда смотрит камера и что происходит на каждом шаге ----------
// cam, look — положение и цель камеры; shift — сдвиг кадра влево (когда справа телефон); ease — скорость пролёта;
// from — откуда камера прилетает при первом показе; state — состояние сцены; bubbles — облачка над точкой сцены.
const WIDE = { cam: [3, 19, 60], look: [1, 8, -20] };
const BEATS = {
  's-title': [
    { ...WIDE, from: [-30, 62, 150], ease: 0.42 },
    { cam: [-6, 9, 30], look: [-10, 3.5, -8], ease: 0.7 },
  ],
  's-story': [
    { cam: [-13, 6.5, 5.5], look: [-18, 1.6, -9], state: { gulnara: 'idle' } },
    { cam: [27.5, 4.6, -1.6], look: [21.6, 1.7, -11.4], state: { call: 1, gulnara: 'phone' },
      bubbles: [{ at: [22.3, 3.7, -11.6], tone: 'scam', text: '«Служба безопасности банка. На вас оформляют кредит»' }] },
    { cam: [-12.5, 5.2, 3], look: [-18, 1.6, -9], state: { call: 1, gulnara: 'phone' },
      bubbles: [{ at: [-17.6, 4.1, -9], tone: 'scam', text: '«Срочно переведите деньги на безопасный счёт. Трубку не кладите»' }] },
    { cam: [3, 25, 34], look: [2, 3.5, -8], state: { call: 1, gulnara: 'look', token: 'fly' },
      bubbles: [{ follow: 'token', tone: 'money', text: '1 500 000 ₸' }] },
    { cam: [8, 19, 28], look: [4, 4, -8], ease: 0.8, state: { call: 1, gulnara: 'look', token: 'fly' },
      bubbles: [{ follow: 'token', tone: 'money', text: '1 500 000 ₸' }] },
  ],
  's-flow': [
    { cam: [-9.5, 5.4, 2.6], look: [-17.2, 1.7, -9], shift: 9, state: { call: 1, gulnara: 'look', token: 'fly' } },
    { cam: [-4, 17, 22], look: [-7, 3.5, -8], shift: 9, state: { call: 1, gulnara: 'look', token: 'hold', dome: 1, beams: 1 },
      bubbles: [{ follow: 'token', tone: 'gauge', text: '100' }] },
    { cam: [8, 4.6, 15], look: [3.2, 1.6, STREET_Z], shift: 9, state: { call: 1, gulnara: 'look', token: 'hold', dome: 1, daniyar: 'stop' },
      bubbles: [{ follow: 'daniyar', tone: 'app', text: 'Мама просит посмотреть перевод' }] },
    { cam: [-10.5, 4.8, 1.5], look: [-17.4, 1.7, -9], shift: 9, state: { call: 1, gulnara: 'look', token: 'hold', dome: 1, daniyar: 'stop' },
      bubbles: [{ at: [-17.6, 4.1, -9], tone: 'app', text: 'Вам сейчас звонит кто-то от имени банка?' }] },
    { cam: [7, 4.2, 13.5], look: [3.2, 1.6, STREET_Z], shift: 9, state: { call: 1, gulnara: 'look', token: 'hold', dome: 1, daniyar: 'decline' },
      bubbles: [{ follow: 'daniyar', tone: 'warn', text: 'Отклонить' }] },
    { cam: [-5, 15, 19], look: [-10, 3, -8], shift: 9, state: { gulnara: 'happy', token: 'back', dome: 1, daniyar: 'walk' },
      bubbles: [{ at: [-18, 5.2, -9], tone: 'ok', text: 'Деньги остались' }] },
  ],
  's-ledger': [
    { cam: [1.5, 13, 16], look: [1.5, 7, -22], state: { dome: 1 } },
    { cam: [-3, 9.5, 6], look: [-6, 6, -22], state: { dome: 1, flag: 1 },
      bubbles: [{ at: [-6.5, 12.6, -22], tone: 'ok', text: 'Банк А: перевод остановлен, счёт помечен' }] },
    { cam: [1.5, 17, 20], look: [1.5, 9, -22], state: { dome: 1, flag: 1, block1: 1 },
      bubbles: [{ follow: 'block1', tone: 'code', text: 'отметка счёта · HMAC-SHA256' }] },
    { cam: [6, 5, -4], look: [10, 2.8, -17], state: { dome: 1, flag: 1, block1: 1, warn: 1 },
      bubbles: [{ follow: 'clientB', tone: 'warn', text: 'Этот счёт отмечен другим банком' }] },
    { cam: [1.5, 18, 22], look: [1.5, 9, -22], state: { dome: 1, flag: 1, block1: 1, block2: 1, warn: 1 },
      bubbles: [{ follow: 'block2', tone: 'code', text: 'доказательство предупреждения' }] },
  ],
  's-end': [
    { cam: [-4, 14, 30], look: [-5, 5, -16], state: { dome: 1, block1: 1, block2: 1, gulnara: 'happy' } },
    { cam: [1, 17, 46], look: [0, 7, -20], ease: 0.7, state: { dome: 1, block1: 1, block2: 1, gulnara: 'happy' } },
    { cam: [4, 26, 74], look: [1, 9, -20], ease: 0.5, state: { dome: 1, block1: 1, block2: 1, gulnara: 'happy' } },
  ],
};
const DEFAULT_STATE = { call: 0, gulnara: 'idle', token: 'none', dome: 0, beams: 0, daniyar: 'walk', flag: 0, block1: 0, block2: 0, warn: 0 };

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
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d1730, 80, 210);
  const camera = new THREE.PerspectiveCamera(38, W / H, 0.5, 500);

  // ---------- помощники для фигур ----------
  const materials = new Map();
  const mat = (color, extra) => {
    if (extra) return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...extra });
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 }));
    return materials.get(color);
  };
  const glow = (color, intensity = 1) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
  const put = (geo, material, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    return m;
  };
  const box = (w, h, d, material, x = 0, y = 0, z = 0, shadow = true) => put(new THREE.BoxGeometry(w, h, d), material, x, y, z, shadow);
  const cyl = (r, h, material, x = 0, y = 0, z = 0, seg = 14) => put(new THREE.CylinderGeometry(r, r, h, seg), material, x, y, z);
  const ball = (r, material, x = 0, y = 0, z = 0) => put(new THREE.SphereGeometry(r, 16, 12), material, x, y, z);

  // мягкое свечение: спрайт с радиальным градиентом (заменяет «блум»)
  const haloMap = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const halo = (color, size, x, y, z, opacity = 0.7, parent = scene) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    s.scale.setScalar(size);
    s.position.set(x, y, z);
    parent.add(s);
    return s;
  };

  // ---------- небо ----------
  {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#060b18');
    grad.addColorStop(0.55, '#101d3c');
    grad.addColorStop(0.8, '#24376a');
    grad.addColorStop(1, '#3a4d86');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false }));
    scene.add(sky);
    const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshBasicMaterial({ color: 0xf3ecd6, fog: false }));
    moonDisc.position.set(96, 118, -300);
    scene.add(moonDisc);
    halo(0xcdd9ff, 90, 96, 118, -299, 0.5).material.fog = false;
    const pts = [];
    for (let n = 0; n < 420; n += 1) pts.push((rand() - 0.5) * 620, 50 + rand() * 210, -320 - rand() * 20);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe6eeff, size: 1.3, fog: false, sizeAttenuation: false })));
  }

  // ---------- свет ----------
  scene.add(new THREE.HemisphereLight(0xa9bdf0, 0x1a2540, 1.9));
  const moon = new THREE.DirectionalLight(0xcfdcff, 2.3);
  moon.position.set(-26, 46, 40);
  moon.target.position.set(0, 0, -6);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -52, right: 52, top: 40, bottom: -40, near: 1, far: 150 });
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.06;
  scene.add(moon, moon.target);
  const lamp = (color, intensity, x, y, z, distance = 18) => {
    const l = new THREE.PointLight(color, intensity, distance, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  };

  // ---------- земля, улица ----------
  scene.add(box(320, 0.2, 320, mat(0x141f36), 0, -0.1, 0));
  scene.add(box(130, 0.06, 6.4, mat(0x0d1524), 0, 0.03, 0));            // дорога
  scene.add(box(130, 0.16, 3, mat(0x26334f), 0, 0.08, STREET_Z + 0.2));  // тротуары
  scene.add(box(130, 0.16, 3, mat(0x26334f), 0, 0.08, -STREET_Z - 0.2));
  for (let x = -60; x <= 60; x += 6) scene.add(box(2.6, 0.02, 0.16, mat(0x55627f), x, 0.07, 0, false));
  for (let n = 0; n < 7; n += 1) scene.add(box(0.5, 0.02, 5.6, mat(0x7c88a3), -1.5 + n * 0.95, 0.075, 0, false)); // «зебра»
  for (let x = -48; x <= 48; x += 16) {                                  // фонари
    scene.add(cyl(0.07, 4.6, mat(0x33405c), x, 2.3, 3.5, 8));
    scene.add(box(0.7, 0.1, 0.3, mat(0x33405c), x, 4.6, 3.75));
    scene.add(box(0.5, 0.08, 0.26, glow(0xffdca8, 2.6), x, 4.52, 3.9, false));
    halo(0xffcf8a, 5.5, x, 4.4, 3.9, 0.55);
    lamp(0xffcf8a, 24, x, 4.2, 4.4, 13);
  }
  const tree = (x, z, s = 1) => {
    scene.add(cyl(0.13 * s, 1.5 * s, mat(0x3a2f2a), x, 0.75 * s, z, 7));
    const leaves = mat(0x21463f, { flatShading: true });
    [[0, 2.3, 0, 1.3], [0.55, 1.9, 0.3, 0.9], [-0.5, 2, -0.3, 0.95]].forEach(([dx, y, dz, r]) => {
      scene.add(put(new THREE.IcosahedronGeometry(r * s, 0), leaves, x + dx * s, y * s, z + dz * s));
    });
  };
  [[-30, 9], [-27, -15], [-12, 9.2], [1.5, -19], [26, 9], [31, -15], [-36, -6.8], [38, 8.4], [17.5, -18], [-44, 9.3]]
    .forEach(([x, z], n) => tree(x, z, 0.9 + (n % 3) * 0.18));

  // ---------- город вокруг: дома с окнами, горы, телебашня ----------
  function windowsTexture(seed) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#16213a';
    g.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 122; y += 10) for (let x = 5; x < 60; x += 9) {
      const lit = ((x * 31 + y * 17 + seed * 53) % 11) < 4;
      g.fillStyle = lit ? (((x + y + seed) % 3) ? '#ffd58a' : '#ffe9c2') : '#1d2a45';
      g.fillRect(x, y, 5, 6);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  }
  const windowMaps = [0, 1, 2, 3].map(windowsTexture);
  const facade = (n, w, h) => {
    const t = windowMaps[n % 4].clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / 13)));
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 1 });
  };
  for (let n = 0; n < 120; n += 1) {
    const x = (rand() - 0.5) * 250;
    const z = -36 - rand() * 90;
    const w = 6 + rand() * 8;
    const h = 6 + rand() * 24 + (Math.abs(x) > 60 ? 8 : 0);
    scene.add(box(w, h, 6 + rand() * 6, facade(n, w, h), x, h / 2, z, false));
    if (n % 5 === 0) scene.add(box(0.12, 3, 0.12, mat(0x55627f), x, h + 1.5, z, false));
  }
  [[-44, -14, 12, 16], [-54, 2, 10, 11], [44, -16, 12, 18], [52, 0, 10, 12], [-40, -30, 14, 24], [40, -32, 14, 22]]
    .forEach(([x, z, w, h], n) => scene.add(box(w, h, 9, facade(n + 1, w, h), x, h / 2, z)));
  function ridge(z, base, amp, color, drop = 0) {
    const s = new THREE.Shape();
    s.moveTo(-260, 0);
    for (let x = -260, k = 0; x <= 260; x += 10, k += 1) {
      const peak = base + amp * (0.55 + 0.45 * Math.sin(k * 1.7) * Math.cos(k * 0.6)) + ((k * 37) % 7);
      s.lineTo(x, Math.max(2, peak - drop));
    }
    s.lineTo(260, 0);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color, fog: false }));
    m.position.z = z;
    return m;
  }
  scene.add(ridge(-190, 44, 26, 0xd3dcf0));        // снежные вершины
  scene.add(ridge(-189, 44, 26, 0x22305a, 11));    // склоны
  scene.add(ridge(-165, 22, 13, 0x18233f));        // предгорья
  scene.add(box(0.8, 34, 0.8, glow(0xffd9a0, 0.9), -92, 30, -150, false), box(2.6, 2.8, 2.6, glow(0xffd9a0, 1.2), -92, 41, -150, false));
  halo(0xffd9a0, 16, -92, 41, -149, 0.5);

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

  // ---------- человечки: суставной «скелет» из гладких фигур ----------
  // Иерархия: корень → таз → (ноги: бедро → колено → стопа) и позвоночник → (руки: плечо → локоть → кисть, голова).
  // Всё генерируется кодом: формы тела, лицо, причёска, одежда и аксессуары задаются параметрами.
  const LITE = matchMedia('(pointer: coarse)').matches || innerWidth < 900; // на телефонах — без теней и с меньшей толпой
  if (LITE) renderer.shadowMap.enabled = false;
  const taper = (rTop, rBottom, len, material) => put(new THREE.CylinderGeometry(rTop, rBottom, len, 12), material, 0, -len / 2, 0);
  const torsoShape = [[0.150, 0], [0.174, 0.10], [0.200, 0.27], [0.212, 0.39], [0.180, 0.455], [0.110, 0.50], [0.058, 0.53]].map(([r, y]) => new THREE.Vector2(r, y));
  function person({
    shirt, pants = 0x27334d, skin = 0xe3b891, hair = 0x2b2320, shoes = 0x1a1d26, height = 1, phone = false, style = 'short',
    skirt = false, dress = false, sleeves = 'long', jacket = null, glasses = false, bag = null, beard = false, scarf = 0xc9856f,
  }) {
    const g = new THREE.Group();
    const top = mat(jacket ?? shirt);
    const hips = new THREE.Group();
    hips.position.y = 0.94;
    g.add(hips);
    const pelvis = put(new THREE.SphereGeometry(0.17, 14, 10), mat(skirt || dress ? shirt : pants), 0, 0, 0);
    pelvis.scale.set(1.04, 0.76, 0.78);
    hips.add(pelvis);
    const hem = new THREE.Group();
    if (skirt || dress) {
      hem.add(put(new THREE.CylinderGeometry(0.165, dress ? 0.29 : 0.26, dress ? 0.66 : 0.44, 18), mat(shirt), 0, dress ? -0.33 : -0.22, 0));
      hips.add(hem);
    }

    const leg = (x) => {
      const cloth = mat(skirt || dress ? skin : pants);
      const hip = new THREE.Group();
      hip.position.set(x, -0.04, 0);
      hip.add(ball(0.088, cloth), taper(0.088, 0.066, 0.42, cloth));
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      knee.add(ball(0.066, cloth), taper(0.064, 0.046, 0.4, cloth));
      const foot = put(new THREE.CapsuleGeometry(0.052, 0.15, 4, 10), mat(shoes), 0, -0.425, 0.065);
      foot.rotation.x = Math.PI / 2;
      foot.scale.set(1.05, 1, 0.74);
      knee.add(foot);
      hip.add(knee);
      hips.add(hip);
      return { hip, knee };
    };
    const legs = [leg(-0.095), leg(0.095)];

    const spine = new THREE.Group();
    spine.position.y = 0.05;
    hips.add(spine);
    const torso = put(new THREE.LatheGeometry(torsoShape, 18), top, 0, 0, 0);
    torso.scale.z = 0.68;
    spine.add(torso);
    if (jacket != null) {                                        // распахнутая куртка: видна рубашка и воротник
      spine.add(box(0.07, 0.36, 0.016, mat(shirt), 0, 0.25, 0.132, false));
      spine.add(box(0.012, 0.36, 0.02, mat(0x1b1b22), 0, 0.25, 0.141, false)); // молния
    }
    if (bag === 'backpack') spine.add(box(0.27, 0.34, 0.13, mat(0x39485f), 0, 0.27, -0.185), box(0.2, 0.1, 0.05, mat(0x55627f), 0, 0.2, -0.26));
    if (bag === 'shoulder') {
      spine.add(box(0.24, 0.18, 0.09, mat(0x8a5a3c), -0.24, -0.02, 0.02));
      const strap = box(0.03, 0.62, 0.03, mat(0x6b452e), -0.04, 0.26, 0.1, false);
      strap.rotation.z = -0.55;
      spine.add(strap);
    }

    const arm = (side) => {
      const sleeve = mat(jacket ?? shirt);
      const lower = sleeves === 'short' ? mat(skin) : sleeve;
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.2, 0.425, 0);
      shoulder.add(ball(0.057, sleeve), taper(0.056, 0.047, 0.27, sleeve));
      const elbow = new THREE.Group();
      elbow.position.y = -0.27;
      elbow.add(ball(0.047, lower), taper(0.045, 0.037, 0.25, lower));
      const hand = ball(0.05, mat(skin), 0, -0.285, 0);
      hand.scale.set(0.78, 1.12, 0.6);
      elbow.add(hand);
      shoulder.add(elbow);
      spine.add(shoulder);
      return { shoulder, elbow };
    };
    const arms = [arm(-1), arm(1)];
    if (phone) arms[1].elbow.add(box(0.075, 0.15, 0.014, glow(0xcfe6ff, 1.8), 0, -0.33, 0.045, false));

    const head = new THREE.Group();
    head.position.y = 0.56;
    spine.add(head);
    head.add(taper(0.05, 0.056, 0.1, mat(skin)));
    head.children[0].position.y = 0.04;
    const skull = ball(0.15, mat(skin), 0, 0.17, 0);
    skull.scale.set(0.93, 1.06, 0.98);
    head.add(skull);
    const dark = mat(0x1b1b22);
    const eyes = [-0.052, 0.052].map((x) => {
      const eye = ball(0.0175, dark, x, 0.19, 0.134);
      head.add(eye, box(0.045, 0.009, 0.01, mat(hair), x, 0.228, 0.136, false));
      return eye;
    });
    const smile = put(new THREE.TorusGeometry(0.026, 0.0055, 5, 12, Math.PI), mat(0x8a4038), 0, 0.118, 0.137, false);
    smile.rotation.z = Math.PI;
    head.add(ball(0.02, mat(skin), 0, 0.155, 0.148), smile);
    [-0.142, 0.142].forEach((x) => head.add(ball(0.03, mat(skin), x, 0.165, 0)));
    const hairMat = mat(style === 'hood' ? (jacket ?? shirt) : style === 'scarf' ? scarf : hair);
    const crown = (r, cover, tilt) => {
      const c = put(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI * cover), hairMat, 0, 0.175, -0.008);
      c.rotation.x = tilt;
      c.scale.set(0.95, 1.06, 1);
      return c;
    };
    if (style !== 'bald') head.add(crown(style === 'scarf' ? 0.166 : 0.158, style === 'hood' ? 0.74 : style === 'scarf' ? 0.6 : 0.55, style === 'hood' ? -0.12 : style === 'scarf' ? -0.42 : -0.32));
    if (style === 'long') head.add(put(new THREE.CapsuleGeometry(0.13, 0.2, 4, 12), hairMat, 0, 0.06, -0.075));
    if (style === 'bun') head.add(ball(0.075, hairMat, 0, 0.3, -0.09));
    if (style === 'pony') {
      const tail = put(new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), hairMat, 0, 0.1, -0.2);
      tail.rotation.x = 0.5;
      head.add(tail);
    }
    if (style === 'cap') head.add(box(0.2, 0.02, 0.14, hairMat, 0, 0.245, 0.17));
    if (style === 'scarf') {                                     // платок с узлом под подбородком, из-под него — чёлка
      head.add(box(0.2, 0.035, 0.03, mat(hair), 0, 0.262, 0.118, false));
      head.add(box(0.03, 0.2, 0.05, hairMat, -0.135, 0.12, 0.05, false), box(0.03, 0.2, 0.05, hairMat, 0.135, 0.12, 0.05, false));
      head.add(ball(0.045, hairMat, 0, 0.03, 0.115));
      const drape = put(new THREE.ConeGeometry(0.15, 0.24, 14), hairMat, 0, 0.02, -0.07);
      head.add(drape);
    }
    if (beard) {
      const b = put(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), mat(hair), 0, 0.15, 0.03);
      head.add(b);
    }
    if (glasses) {
      [-0.052, 0.052].forEach((x) => head.add(put(new THREE.TorusGeometry(0.032, 0.006, 6, 16), dark, x, 0.19, 0.145, false)));
      head.add(box(0.04, 0.006, 0.006, dark, 0, 0.19, 0.147, false));
    }
    g.scale.setScalar(height);
    g.userData = { hips, spine, head, eyes, legs, arms, hem, phase: rand() * 6, pose: 'idle', gait: 0, baseY: 0, j: {} };
    scene.add(g);
    return g;
  }

  /** Целевые углы суставов для позы. Отрицательный угол — конечность идёт вперёд. */
  function targets(u, t) {
    const phi = t * 7.4 + u.phase;
    const s = Math.sin(phi);
    const c = Math.cos(phi);
    const w = u.gait;                                   // 0..1 — насколько человечек шагает
    const sway = Math.sin(t * 1.5 + u.phase);
    const T = {
      hipL: -0.62 * s * w, hipR: 0.62 * s * w,
      kneeL: (0.08 + 0.95 * Math.max(0, c)) * w, kneeR: (0.08 + 0.95 * Math.max(0, -c)) * w,   // колено сгибается на переносе ноги
      shL: 0.5 * s * w + sway * 0.03, shR: -0.5 * s * w - sway * 0.03, shLz: 0.07, shRz: -0.07,
      elL: -0.14 - (0.18 + 0.32 * Math.max(0, -s)) * w, elR: -0.14 - (0.18 + 0.32 * Math.max(0, s)) * w,
      spineX: 0.05 * w + sway * 0.012, spineY: 0.11 * s * w, hipsY: -0.08 * s * w,
      headX: 0, headY: -0.06 * s * w, drop: -0.022 * Math.cos(2 * phi) * w, hop: 0,
    };
    const p = u.pose;
    if (p === 'phone') Object.assign(T, { shR: -0.95, shRz: -0.3, elR: -2.15, headX: 0.06, headY: Math.sin(t * 0.7) * 0.2, spineY: Math.sin(t * 0.5) * 0.08 });
    if (p === 'look') Object.assign(T, { shR: -0.5, elR: -1.45, shRz: 0.12, headX: 0.34, shL: -0.2, elL: -0.9 });
    if (p === 'no') Object.assign(T, { shR: -0.5, elR: -1.45, shRz: 0.12, headX: 0.18, headY: Math.sin(t * 9) * 0.5 });
    if (p === 'happy') {
      const wave = Math.sin(t * 5.5) * 0.22;
      Object.assign(T, { shL: -2.5 + wave, shR: -2.5 - wave, shLz: 0.62, shRz: -0.62, elL: -0.3, elR: -0.3, headX: -0.14,
        hop: Math.abs(Math.sin(t * 5.5)) * 0.13, kneeL: 0.25, kneeR: 0.25, hipL: -0.12, hipR: -0.12 });
    }
    if (p.startsWith('sit')) Object.assign(T, { hipL: -1.5, hipR: -1.5, kneeL: 1.5, kneeR: 1.5, drop: -0.44, spineX: 0.04 });
    if (p === 'sitcall') {
      Object.assign(T, { shR: -0.95, shRz: -0.3, elR: -2.15, shL: -0.55 + Math.sin(t * 3 + u.phase) * 0.2, elL: -1.1 + Math.sin(t * 2.2 + u.phase) * 0.3,
        headY: Math.sin(t * 0.9 + u.phase) * 0.28, spineX: 0.1 });
    }
    if (p === 'sittalk') {
      Object.assign(T, { shL: -0.5 + Math.sin(t * 2.4 + u.phase) * 0.28, elL: -1.2 + Math.sin(t * 3.1 + u.phase) * 0.35, shR: -0.35, elR: -1.25,
        headY: Math.sin(t * 0.8 + u.phase) * 0.5, headX: Math.sin(t * 1.3 + u.phase) * 0.1, spineY: Math.sin(t * 0.6 + u.phase) * 0.12 });
    }
    return T;
  }

  function animate(p, t, dt) {
    const u = p.userData;
    u.gait += ((u.pose === 'walk' ? 1 : 0) - u.gait) * Math.min(1, dt * 6);
    const T = targets(u, t);
    const k = Math.min(1, dt * 9);
    const j = u.j;
    for (const key in T) j[key] = (j[key] ?? T[key]) + (T[key] - (j[key] ?? T[key])) * k;
    const [L, R] = u.legs;
    L.hip.rotation.x = j.hipL; R.hip.rotation.x = j.hipR;
    L.knee.rotation.x = j.kneeL; R.knee.rotation.x = j.kneeR;
    const [AL, AR] = u.arms;
    AL.shoulder.rotation.set(j.shL, 0, j.shLz); AR.shoulder.rotation.set(j.shR, 0, j.shRz);
    AL.elbow.rotation.x = j.elL; AR.elbow.rotation.x = j.elR;
    u.spine.rotation.set(j.spineX, j.spineY, 0);
    u.hips.rotation.y = j.hipsY;
    const lap = (j.hipL + j.hipR) / 2;                     // у сидящих подол ложится на колени
    u.hem.rotation.x = lap < -0.6 ? lap * 0.86 : 0;
    u.hem.scale.y = lap < -0.6 ? 0.72 : 1;
    u.head.rotation.set(j.headX, j.headY, 0);
    const blink = Math.sin(t * 0.9 + u.phase * 3) > 0.985 ? 0.12 : 1;
    u.eyes[0].scale.y = blink; u.eyes[1].scale.y = blink;
    p.position.y = u.baseY + (j.drop + j.hop) * p.scale.y;
  }
  const extras = []; // статисты: сидят, разговаривают
  const sitter = (opts, x, y, z, rot, pose = 'sittalk') => {
    const p = person(opts);
    p.position.set(x, y, z);
    p.rotation.y = rot;
    p.userData.baseY = y;
    p.userData.pose = pose;
    extras.push(p);
    return p;
  };

  // ---------- квартира Гульнары: комната в разрезе ----------
  const tv = box(1.5, 0.85, 0.06, glow(0x7fb2ff, 1.2), 0, 0, 0, false);
  {
    const g = new THREE.Group();
    g.position.copy(FLAT);
    g.add(box(9.4, 0.3, 7.2, mat(0x7a6048), 0, 0.15, 0));              // пол
    for (let n = 0; n < 9; n += 1) g.add(box(0.03, 0.01, 7, mat(0x5e4936), -4.2 + n * 1.05, 0.305, 0, false));
    g.add(box(9.4, 4.4, 0.3, mat(0xdccfb8), 0, 2.5, -3.6));            // дальняя стена
    g.add(box(0.3, 4.4, 7.2, mat(0xd0c2aa), -4.7, 2.5, 0));            // боковая стена
    g.add(box(9.4, 0.14, 0.34, mat(0xb9a98f), 0, 0.4, -3.44, false), box(0.34, 0.14, 7.2, mat(0xb9a98f), -4.54, 0.4, 0, false)); // плинтус
    g.add(put(new THREE.CylinderGeometry(1.7, 1.7, 0.05, 28), mat(0x9c4338), 0.6, 0.33, 0.5));   // ковёр
    g.add(put(new THREE.CylinderGeometry(1.25, 1.25, 0.055, 28), mat(0xc98a5a), 0.6, 0.335, 0.5));
    g.add(box(3.2, 0.5, 1.2, mat(0x4f6b74), -2.6, 0.6, -2.7), box(3.2, 0.9, 0.34, mat(0x435c64), -2.6, 1.2, -3.2));   // диван
    g.add(box(0.34, 0.76, 1.2, mat(0x435c64), -4.05, 0.85, -2.7), box(0.34, 0.76, 1.2, mat(0x435c64), -1.15, 0.85, -2.7));
    g.add(box(0.9, 0.3, 0.6, mat(0xd9b46a), -3.3, 1, -2.6), box(0.8, 0.28, 0.55, mat(0xc7705a), -1.9, 1, -2.7));     // подушки
    g.add(box(1.9, 0.9, 0.5, mat(0x7a5a3c), 2.4, 0.75, -3.1));          // тумба с телевизором
    tv.position.set(2.4, 1.75, -3.2);
    g.add(tv);
    g.add(cyl(0.05, 1.6, mat(0x3a3a3a), 4.1, 1.1, -2.9, 8));            // торшер
    g.add(put(new THREE.CylinderGeometry(0.28, 0.42, 0.5, 14, 1, true), glow(0xffd7a0, 2.2), 4.1, 2.1, -2.9, false));
    halo(0xffc98a, 5, 4.1, 2.1, -2.9, 0.6, g);
    g.add(box(2.2, 1.7, 0.08, glow(0x3f5f9a, 0.8), -0.2, 2.75, -3.42, false));                    // окно
    g.add(box(0.07, 1.8, 0.1, mat(0xf0e8d8), -0.2, 2.75, -3.38, false), box(2.3, 0.07, 0.1, mat(0xf0e8d8), -0.2, 2.75, -3.38, false));
    g.add(box(0.5, 2, 0.08, mat(0xa9624d), -1.55, 2.7, -3.36, false), box(0.5, 2, 0.08, mat(0xa9624d), 1.15, 2.7, -3.36, false)); // шторы
    g.add(box(0.1, 1.5, 1.9, mat(0x8a6f52), -4.5, 2.3, 1.4, false));    // полка
    [[1.9, 0x4d8f6b], [1.5, 0xc2573f], [1.15, 0xd3b24a], [0.8, 0x4a78b8]].forEach(([z, c], n) => g.add(box(0.24, 0.42 + (n % 2) * 0.1, 0.22, mat(c), -4.34, 2.75, z, false)));
    g.add(cyl(0.22, 0.4, mat(0x9a5a3c), -3.9, 0.5, 2.6, 12));           // цветок
    g.add(put(new THREE.IcosahedronGeometry(0.55, 0), mat(0x3f8a5f, { flatShading: true }), -3.9, 1.2, 2.6));
    g.add(cyl(0.5, 0.06, mat(0x8a6f52), 3, 0.95, 1.6, 20), cyl(0.07, 0.65, mat(0x8a6f52), 3, 0.62, 1.6, 8)); // столик с чаем
    g.add(cyl(0.12, 0.16, mat(0xf0e8d8), 3, 1.06, 1.6, 12));
    const cat = put(new THREE.CapsuleGeometry(0.16, 0.34, 4, 10), mat(0xd08a3c), -3.1, 1.02, -2.35); // кот на диване
    cat.rotation.z = Math.PI / 2;
    g.add(cat, ball(0.15, mat(0xd08a3c), -2.72, 1.12, -2.35));
    scene.add(g);
    lamp(0xffc98a, 30, FLAT.x + 2.6, 2.9, FLAT.z - 1.4, 17);
  }

  // ---------- колл-центр мошенников ----------
  {
    const g = new THREE.Group();
    g.position.copy(DEN);
    g.add(box(9, 0.3, 6.8, mat(0x1b1d26), 0, 0.15, 0));
    g.add(box(9, 4.2, 0.3, mat(0x242734), 0, 2.4, -3.4));
    g.add(box(0.3, 4.2, 6.8, mat(0x20232f), 4.5, 2.4, 0));
    [-3, -1, 1, 3].forEach((x, n) => g.add(box(1.6, 0.9, 0.06, glow(n % 2 ? 0xff5a4a : 0xff8a5a, 1.4), x, 2.7, -3.22, false))); // экраны на стене
    [-2.6, 0, 2.6].forEach((x) => {                                      // три рабочих места
      g.add(box(2, 0.1, 0.9, mat(0x3a3340), x, 1, -0.6));
      g.add(box(0.1, 1, 0.8, mat(0x3a3340), x - 0.92, 0.5, -0.6), box(0.1, 1, 0.8, mat(0x3a3340), x + 0.92, 0.5, -0.6));
      g.add(box(0.62, 0.04, 0.42, mat(0x555a6a), x, 1.07, -0.55, false), box(0.62, 0.4, 0.04, glow(0xff6a5a, 1.3), x, 1.28, -0.78, false));
      g.add(cyl(0.3, 0.1, mat(0x2a2c38), x, 0.72, -1.7, 12), cyl(0.06, 0.7, mat(0x2a2c38), x, 0.36, -1.7, 8));
    });
    scene.add(g);
    halo(0xff4030, 13, DEN.x, 2.6, DEN.z - 2.6, 0.35);
    lamp(0xff5040, 26, DEN.x, 2.8, DEN.z - 0.6, 15);
  }
  sitter({ shirt: 0x24252e, pants: 0x1a1b22, style: 'hood', phone: true, beard: true }, DEN.x, 0.3, DEN.z - 1.7, 0.2, 'sitcall');
  sitter({ shirt: 0x2f2a36, pants: 0x1a1b22, style: 'hood', phone: true }, DEN.x - 2.6, 0.3, DEN.z - 1.7, 0.1, 'sitcall');
  sitter({ shirt: 0x3a3f4a, jacket: 0x20232c, pants: 0x1a1b22, style: 'cap', hair: 0x1b1b1b, phone: true, glasses: true }, DEN.x + 2.6, 0.3, DEN.z - 1.7, -0.2, 'sitcall');

  // ---------- банки ----------
  function bank(pos, name, accent) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(box(11, 8, 7, mat(0x2c3c5c), 0, 4, 0));
    g.add(box(12.4, 0.5, 8.4, mat(0x3a4d70), 0, 8.25, 0));
    g.add(box(7, 1.6, 0.4, mat(0x3a4d70), 0, 9.3, -3.6));               // фронтон
    g.add(box(12.6, 0.24, 3, mat(0x3a4d70), 0, 0.12, -4.9), box(11.8, 0.24, 2.4, mat(0x44597f), 0, 0.36, -4.7)); // ступени
    [-4.2, -1.45, 1.45, 4.2].forEach((x) => {
      g.add(cyl(0.38, 6.6, mat(0xe6ebf5), x, 3.8, -4.1, 16));
      g.add(box(1, 0.3, 1, mat(0xe6ebf5), x, 7.25, -4.1), box(1, 0.3, 1, mat(0xe6ebf5), x, 0.63, -4.1));
    });
    g.add(box(2.6, 3.4, 0.1, glow(0xffe2b0, 1.3), 0, 2.2, -3.56, false));                          // вход
    [-3.2, 3.2].forEach((x) => g.add(box(1.6, 2.2, 0.1, glow(0xffe2b0, 0.9), x, 4.6, -3.56, false)));
    const label = sign(name, 6.4, 1.3);
    label.position.set(0, 9.3, -3.82);
    label.rotation.y = Math.PI;
    g.add(label);
    g.add(box(12.4, 0.16, 0.16, glow(accent, 2.2), 0, 8.62, -4.2, false));
    g.rotation.y = Math.PI;                                              // фасадом к улице и к камере
    scene.add(g);
    halo(0xffe0b0, 9, pos.x, 2.4, pos.z + 4.2, 0.4);
    lamp(0xffe0b0, 16, pos.x, 3, pos.z + 6, 13);
    return g;
  }
  bank(BANK_A, 'БАНК А', 0x4fd6bb);
  bank(BANK_B, 'БАНК Б', 0xe2a52b);

  // ---------- остановка и кафе: люди сидят и разговаривают ----------
  {
    const x = 16; const z = STREET_Z + 2.6;
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc0ff, emissive: 0x35507e, emissiveIntensity: 0.5, transparent: true, opacity: 0.45 });
    scene.add(box(4.4, 0.12, 1.5, mat(0x33405c), x, 2.7, z), box(4.2, 2.3, 0.08, glass, x, 1.5, z + 0.7, false));
    scene.add(cyl(0.06, 2.6, mat(0x33405c), x - 2.1, 1.4, z - 0.6, 8), cyl(0.06, 2.6, mat(0x33405c), x + 2.1, 1.4, z - 0.6, 8));
    scene.add(box(3.2, 0.1, 0.5, mat(0x7a5a3c), x, 0.7, z + 0.3));
    scene.add(box(0.9, 0.5, 0.06, glow(0x4fd6bb, 1.4), x + 1.7, 2.3, z - 0.72, false));
    sitter({ shirt: 0x7a66b5, hair: 0x6b4a2f, style: 'long', skirt: true, bag: 'shoulder' }, x - 0.7, 0.3, z + 0.3, Math.PI, 'sittalk');
    sitter({ shirt: 0xd9d2c2, jacket: 0x5a6478, pants: 0x2a3042, glasses: true, hair: 0x8a8a8a }, x + 0.5, 0.3, z + 0.3, Math.PI * 0.9, 'sittalk');
  }
  {
    const x = -33; const z = STREET_Z + 4.4;
    scene.add(box(9, 4.4, 5, mat(0x3b2f3a), x, 2.2, z + 3.4));
    scene.add(box(9.4, 0.2, 2.6, mat(0xc7705a), x, 3.3, z + 0.2));                                  // навес
    for (let n = 0; n < 5; n += 1) scene.add(box(0.9, 0.22, 2.62, mat(0xf0e8d8), x - 3.6 + n * 1.8, 3.31, z + 0.2, false));
    scene.add(box(4.4, 2.2, 0.08, glow(0xffd7a0, 1.3), x, 1.9, z + 0.88, false));
    const cafe = sign('КАФЕ', 3.4, 0.8, '#3b2f3a', '#ffd7a0');
    cafe.position.set(x, 4, z + 0.85);
    cafe.rotation.y = Math.PI;
    scene.add(cafe);
    for (let n = 0; n < 9; n += 1) halo(n % 2 ? 0xffd9a0 : 0xff9a7a, 1.1, x - 4.2 + n * 1.05, 3.05 - Math.sin((n / 8) * Math.PI) * 0.3, z - 1.05, 0.9);
    [[-2, 0x4d8f6b, 0xd3b24a], [2.2, 0xb5607f, 0x4a78b8]].forEach(([dx, a, b], n) => {
      scene.add(cyl(0.55, 0.07, mat(0xf0e8d8), x + dx, 0.95, z - 0.6, 18), cyl(0.07, 0.75, mat(0x33405c), x + dx, 0.55, z - 0.6, 8));
      scene.add(cyl(0.3, 0.08, mat(0x33405c), x + dx - 1, 0.66, z - 0.6, 12), cyl(0.3, 0.08, mat(0x33405c), x + dx + 1, 0.66, z - 0.6, 12));
      sitter({ shirt: a, style: n ? 'pony' : 'short', hair: n ? 0x2b2320 : 0x6b4a2f, dress: !!n, sleeves: 'short', beard: !n }, x + dx - 1, 0.24, z - 0.6, Math.PI / 2, 'sittalk');
      sitter({ shirt: b, style: n ? 'short' : 'bun', hair: n ? 0x4a3020 : 0x2b2320, jacket: n ? 0x39485f : null, skirt: !n }, x + dx + 1, 0.24, z - 0.6, -Math.PI / 2, 'sittalk');
    });
    lamp(0xffd0a0, 18, x, 2.6, z - 0.8, 12);
  }

  // ---------- главные герои и прохожие ----------
  const gulnara = person({ shirt: 0x8a4f73, hair: 0xb9b6b0, style: 'scarf', scarf: 0xc9605a, phone: true, dress: true, shoes: 0x5a3a3a, height: 0.95 });
  gulnara.position.set(FLAT.x + 0.6, 0.3, FLAT.z + 0.2);
  gulnara.userData.baseY = 0.3;
  gulnara.rotation.y = 0.5;
  const daniyar = person({ shirt: 0xe8e4da, jacket: 0x2f6f8f, pants: 0x232c40, phone: true, bag: 'backpack', height: 1.04 });
  daniyar.userData.x = -9;
  const clientB = person({ shirt: 0xb07a3a, pants: 0x2b2f3d, phone: true, style: 'cap', hair: 0x3a3340, sleeves: 'short' });
  clientB.position.set(BANK_B.x + 1.2, 0.6, BANK_B.z + 5.4);
  clientB.userData.baseY = 0.6;
  clientB.rotation.y = 0.2;
  clientB.userData.pose = 'look';
  const palette = [0xc2573f, 0x4d8f6b, 0xd3b24a, 0x7a66b5, 0x4a78b8, 0xb5607f, 0x8a8f9a, 0x3f9a9a, 0xd98a5a, 0x5a6fd0, 0x9ab85a, 0xd06a8a];
  const SKIN = [0xe3b891, 0xd9a67a, 0xf0c9a5, 0xc68e63];
  const walkers = palette.slice(0, LITE ? 6 : palette.length).map((shirt, n) => {
    const woman = n % 3 === 1;
    const w = person({
      shirt, pants: n % 2 ? 0x2a3042 : 0x3a3340, skin: SKIN[n % 4], hair: [0x2b2320, 0x6b4a2f, 0x1b1b1b, 0xb9b6b0, 0x8a4a2a][n % 5],
      style: woman ? ['long', 'pony', 'bun'][n % 3] : ['short', 'cap', 'short', 'bald'][n % 4],
      skirt: woman && n % 2 === 0, dress: woman && n % 2 === 1, sleeves: n % 4 === 2 ? 'short' : 'long',
      jacket: n % 3 === 0 ? [0x39485f, 0x5a4a3a, 0x2f4f4a][n % 3] : null, glasses: n % 5 === 3, beard: !woman && n % 6 === 4,
      bag: [null, 'shoulder', 'backpack', null][n % 4], height: 0.92 + (n % 4) * 0.045, phone: n % 4 === 0,
    });
    Object.assign(w.userData, {
      dir: n % 2 ? 1 : -1, z: n % 2 ? STREET_Z + ((n % 3) - 1) * 0.6 : -4.4 + ((n % 3) - 1) * 0.25, x: -56 + n * 9.6, // дальний тротуар — у дороги, мимо комнат
      speed: 1.2 + (n % 4) * 0.2, pose: 'walk', baseY: 0.16,
    });
    return w;
  });

  // ---------- машины ----------
  function car(color, dir, x, speed) {
    const g = new THREE.Group();
    g.add(box(3.7, 0.5, 1.62, mat(color), 0, 0.6, 0));
    const hood = put(new THREE.CylinderGeometry(0.81, 0.81, 3.7, 14, 1, false, 0, Math.PI), mat(color), 0, 0.6, 0);
    hood.rotation.set(Math.PI / 2, 0, Math.PI / 2);      // скруглённые борта
    hood.scale.set(1, 1, 0.42);
    g.add(hood);
    const cabin = put(new THREE.CylinderGeometry(0.78, 1.18, 0.56, 4), mat(color), -0.15, 1.13, 0);
    cabin.rotation.y = Math.PI / 4;
    cabin.scale.set(1.25, 1, 0.94);
    g.add(cabin);
    const glassMat = mat(0x8fb4e8, { emissive: 0x24406a, emissiveIntensity: 0.6, roughness: 0.2 });
    g.add(box(1.5, 0.34, 1.5, glassMat, -0.15, 1.16, 0, false), box(1.86, 0.3, 1.1, glassMat, -0.15, 1.15, 0, false));
    [[-1.15, 0.82], [1.15, 0.82], [-1.15, -0.82], [1.15, -0.82]].forEach(([wx, wz]) => {
      const w = cyl(0.34, 0.24, mat(0x12151c), wx, 0.34, wz, 16);
      w.rotation.x = Math.PI / 2;
      const rim = cyl(0.17, 0.26, mat(0xb9c2d0), wx, 0.34, wz, 12);
      rim.rotation.x = Math.PI / 2;
      g.add(w, rim);
    });
    [-0.52, 0.52].forEach((z) => {
      g.add(box(0.06, 0.2, 0.34, glow(0xfff2c8, 3), 1.82, 0.66, z, false), box(0.06, 0.16, 0.34, glow(0xff3a2a, 2.2), -1.82, 0.7, z, false));
      halo(0xfff2c8, 2.4, 2, 0.66, z, 0.7, g);
    });
    g.rotation.y = dir > 0 ? 0 : Math.PI;
    g.userData = { dir, x, speed, z: dir > 0 ? 1.6 : -1.6 };
    scene.add(g);
    return g;
  }
  const cars = [car(0x3d6fb0, 1, -40, 6.5), car(0xc9c2b4, -1, 30, 5.6), car(0xa8473a, 1, 12, 7.2), car(0x2f8f7a, -1, -24, 6.1)];

  // ---------- звонок: точки бегут от мошенника к Гульнаре ----------
  const callCurve = new THREE.QuadraticBezierCurve3(V(DEN.x, 2.3, DEN.z - 1.4), V(2, 16, -11), V(FLAT.x + 0.6, 2.1, FLAT.z));
  const callDots = Array.from({ length: 24 }, () => {
    const m = ball(0.15, glow(0xff5a4a, 2.6));
    m.castShadow = false;
    scene.add(m);
    return m;
  });

  // ---------- перевод: светящаяся «монета» летит к мошенникам, Sabyr её останавливает ----------
  const tokenCurve = new THREE.QuadraticBezierCurve3(V(FLAT.x + 0.8, 1.9, FLAT.z + 0.3), V(1, 12, -7), V(DEN.x - 0.4, 2, DEN.z - 1));
  const token = new THREE.Group();
  const coin = put(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 28), glow(0xffcf5a, 2.4), 0, 0, 0, false);
  coin.rotation.x = Math.PI / 2;
  token.add(coin);
  const tokenHalo = halo(0xffc94a, 5, 0, 0, 0, 0.75, token);
  const tokenLight = new THREE.PointLight(0xffcf5a, 16, 12, 1.8);
  token.add(tokenLight);
  const pauseRing = put(new THREE.TorusGeometry(1.3, 0.09, 10, 56), glow(0x4fd6bb, 2.8), 0, 0, 0, false);
  const pauseBars = new THREE.Group();
  pauseBars.add(box(0.2, 0.86, 0.1, glow(0x4fd6bb, 2.8), -0.22, 0, 0.3, false), box(0.2, 0.86, 0.1, glow(0x4fd6bb, 2.8), 0.22, 0, 0.3, false));
  token.add(pauseRing, pauseBars);
  scene.add(token);
  const trail = Array.from({ length: 10 }, (_, n) => halo(0xffc94a, 1.6 - n * 0.12, 0, -50, 0, 0.5 - n * 0.045));
  let tokenU = 0;
  let tokenShow = 0;

  // лучи оценки риска: от отправителя и от получателя к остановленному переводу
  const beamMat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const beams = [
    { from: V(FLAT.x + 0.6, 2.2, FLAT.z + 0.2), mesh: new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 8), beamMat(0xe2a52b)) },
    { from: V(DEN.x, 2.2, DEN.z - 1.4), mesh: new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 8), beamMat(0xe77a48)) },
  ];
  beams.forEach((b) => scene.add(b.mesh));

  // ---------- защита: купол над квартирой ----------
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(7.6, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4fd6bb, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  dome.position.set(FLAT.x, 0.05, FLAT.z);
  const domeWire = new THREE.Mesh(
    new THREE.SphereGeometry(7.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x9ff0dd, wireframe: true, transparent: true, opacity: 0, depthWrite: false }),
  );
  domeWire.position.copy(dome.position);
  const domeEdge = put(new THREE.TorusGeometry(7.6, 0.07, 8, 96), glow(0x4fd6bb, 2.2), FLAT.x, 0.14, FLAT.z, false);
  domeEdge.rotation.x = Math.PI / 2;
  scene.add(dome, domeWire, domeEdge);

  // ---------- реестр: блоки между банками ----------
  const chainCurve = new THREE.QuadraticBezierCurve3(V(BANK_A.x, 10.4, BANK_A.z), V(1.5, 15.5, BANK_A.z), V(BANK_B.x, 10.4, BANK_B.z));
  {
    const geo = new THREE.BufferGeometry().setFromPoints(chainCurve.getPoints(48));
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4fd6bb, transparent: true, opacity: 0.5 })));
  }
  function block(slot) {
    const g = new THREE.Group();
    g.add(box(1.5, 1.5, 1.5, new THREE.MeshStandardMaterial({ color: 0x0f2742, emissive: 0x4fd6bb, emissiveIntensity: 0.6, roughness: 0.4 }), 0, 0, 0, false));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.56, 1.56, 1.56)), new THREE.LineBasicMaterial({ color: 0x9ff0dd })));
    halo(0x4fd6bb, 5, 0, 0, 0, 0.45, g);
    g.userData = { slot, u: 0, show: 0 };
    g.scale.setScalar(0.001);
    scene.add(g);
    return g;
  }
  const block1 = block(0.36);
  const block2 = block(0.64);
  const flag = box(0.9, 0.9, 0.9, glow(0xe77a48, 2.4), BANK_A.x, 11.2, BANK_A.z, false);
  flag.rotation.set(0.6, 0.7, 0);
  scene.add(flag);
  const anchors = { token, daniyar, clientB, block1, block2 };

  // ---------- состояние и камера ----------
  const state = { ...DEFAULT_STATE };
  const cam = { pos: V(...WIDE.cam), look: V(...WIDE.look), shift: 0 };
  const goal = { pos: cam.pos.clone(), look: cam.look.clone(), shift: 0, ease: 1 };
  let bubbles = [];
  let first = true;

  function setBeat(id, step, snap) {
    const beats = BEATS[id];
    document.body.classList.toggle('world-dim', !beats);
    const beat = beats ? beats[Math.min(step, beats.length - 1)] : WIDE;
    goal.pos.set(...beat.cam);
    goal.look.set(...beat.look);
    goal.shift = beat.shift ?? 0;
    goal.ease = beat.ease ?? 1;
    Object.assign(state, DEFAULT_STATE, beat.state);
    if (snap) { cam.pos.copy(goal.pos); cam.look.copy(goal.look); cam.shift = goal.shift; }
    if (first && beat.from) cam.pos.set(...beat.from); // вступление: камера прилетает издалека
    first = false;
    bubblesBox.replaceChildren();
    bubbles = (beat.bubbles ?? []).map((b, n) => {
      const el = document.createElement('div');
      el.className = `bubble3d ${b.tone}`;
      if (b.tone === 'gauge') {
        el.innerHTML = '<svg viewBox="0 0 200 112" aria-hidden="true"><path d="M14 104A86 86 0 0 1 186 104" class="track"/><path d="M14 104A86 86 0 0 1 186 104" class="arc"/></svg><b>0</b><span>риск</span>';
        const num = el.querySelector('b');
        const t0 = performance.now() + 700;
        const tick = (now) => {
          const k = Math.min(1, Math.max(0, (now - t0) / 1300));
          num.textContent = String(Math.round(Number(b.text) * (1 - Math.pow(1 - k, 3))));
          if (k < 1 && el.isConnected) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } else el.textContent = b.text;
      el.style.animationDelay = `${0.55 + n * 0.25}s`;
      bubblesBox.append(el);
      return { ...b, el, point: b.at ? V(...b.at) : null };
    });
  }

  const tmp = V(0, 0, 0);
  const up = V(0, 1, 0);
  function placeBubbles() {
    for (const b of bubbles) {
      if (b.point) tmp.copy(b.point);
      else {
        anchors[b.follow].getWorldPosition(tmp);
        tmp.y += b.follow === 'token' ? 2 : b.follow.startsWith('block') ? 1.7 : 2.6;
      }
      tmp.project(camera);
      b.el.style.visibility = tmp.z < 1 && Math.abs(tmp.x) < 1.2 ? 'visible' : 'hidden';
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
    const k = 1 - Math.exp(-dt * 1.9 * goal.ease);
    cam.pos.lerp(goal.pos, k);
    cam.look.lerp(goal.look, k);
    cam.shift += (goal.shift - cam.shift) * k;
    camera.position.set(cam.pos.x + Math.sin(t * 0.21) * 0.5, cam.pos.y + Math.sin(t * 0.17) * 0.25, cam.pos.z + Math.cos(t * 0.19) * 0.5);
    camera.lookAt(cam.look);
    if (Math.abs(camera.filmOffset - cam.shift) > 0.01) { camera.filmOffset = cam.shift; camera.updateProjectionMatrix(); }

    // прохожие и машины
    for (const w of walkers) {
      const u = w.userData;
      u.x += u.dir * u.speed * dt;
      if (u.x > 60) u.x = -60;
      if (u.x < -60) u.x = 60;
      w.position.x = u.x;
      w.position.z = u.z;
      w.rotation.y = u.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      animate(w, t, dt);
    }
    for (const c of cars) {
      const u = c.userData;
      u.x += u.dir * u.speed * dt;
      if (u.x > 66) u.x = -66;
      if (u.x < -66) u.x = 66;
      c.position.set(u.x, 0.02, u.z);
    }
    for (const p of extras) animate(p, t, dt);
    tv.material.emissiveIntensity = 1 + Math.sin(t * 7) * 0.18 + Math.sin(t * 2.3) * 0.25;

    // Данияр идёт по улице, останавливается, когда приходит просьба
    {
      const u = daniyar.userData;
      const stopped = state.daniyar !== 'walk';
      u.pose = state.daniyar === 'stop' ? 'look' : state.daniyar === 'decline' ? 'no' : 'walk';
      if (stopped) u.x += (3.2 - u.x) * Math.min(1, dt * 2.2);
      else { u.x += 1.5 * dt; if (u.x > 44) u.x = -44; }
      if (stopped && Math.abs(3.2 - u.x) > 0.4) u.pose = 'walk';
      daniyar.position.x = u.x;
      daniyar.position.z = STREET_Z;
      u.baseY = 0.16;
      const face = stopped && u.pose !== 'walk' ? Math.PI * 0.18 : Math.PI / 2;
      daniyar.rotation.y += (face - daniyar.rotation.y) * Math.min(1, dt * 5);
      animate(daniyar, t, dt);
    }
    gulnara.userData.pose = state.gulnara;
    animate(gulnara, t, dt);
    clientB.userData.pose = state.warn ? 'no' : 'look';
    animate(clientB, t, dt);

    // звонок
    callDots.forEach((dot, n) => {
      const u = ((t * 0.16 + n / callDots.length) % 1);
      dot.position.copy(callCurve.getPoint(u));
      const s = state.call ? 0.6 + 0.6 * Math.sin(u * Math.PI) : 0.001;
      dot.scale.setScalar(dot.scale.x + (s - dot.scale.x) * Math.min(1, dt * 6));
    });

    // перевод
    const targetU = state.token === 'fly' ? 0.86 : state.token === 'hold' ? Math.min(Math.max(tokenU, 0.34), 0.46) : 0;
    const speed = state.token === 'fly' ? 0.075 : state.token === 'back' ? 0.5 : 0.6;
    tokenU += Math.sign(targetU - tokenU) * Math.min(Math.abs(targetU - tokenU), speed * dt);
    const wantShow = state.token === 'none' ? 0 : state.token === 'back' && tokenU < 0.02 ? 0 : 1;
    tokenShow += (wantShow - tokenShow) * Math.min(1, dt * 5);
    token.position.copy(tokenCurve.getPoint(tokenU));
    token.position.y += Math.sin(t * 2.4) * 0.12;
    token.scale.setScalar(Math.max(0.001, tokenShow));
    coin.rotation.z = t * 2.2;
    tokenLight.intensity = 16 * tokenShow;
    tokenHalo.material.opacity = 0.75 * tokenShow;
    trail.forEach((s, n) => {
      const u = tokenU - (n + 1) * 0.012 * (state.token === 'back' ? -1 : 1);
      const moving = state.token === 'fly' || (state.token === 'back' && tokenU > 0.03);
      if (moving && u > 0 && u < 1) s.position.copy(tokenCurve.getPoint(u)); else s.position.y = -50;
    });
    const held = state.token === 'hold' ? 1 : 0;
    pauseRing.scale.setScalar(pauseRing.scale.x + (Math.max(0.001, held) - pauseRing.scale.x) * Math.min(1, dt * 6));
    pauseBars.scale.copy(pauseRing.scale);
    pauseRing.quaternion.copy(camera.quaternion);
    pauseBars.quaternion.copy(camera.quaternion);

    // лучи оценки
    for (const b of beams) {
      const dir = tmp.copy(token.position).sub(b.from);
      const len = Math.max(0.01, dir.length());
      b.mesh.position.copy(b.from).addScaledVector(dir, 0.5);
      b.mesh.scale.set(1 + Math.sin(t * 8) * 0.25, len, 1 + Math.sin(t * 8) * 0.25);
      b.mesh.quaternion.setFromUnitVectors(up, dir.normalize());
      b.mesh.material.opacity += ((state.beams ? 0.75 : 0) - b.mesh.material.opacity) * Math.min(1, dt * 4);
    }

    // купол
    const domeGoal = state.dome ? 0.11 + Math.sin(t * 1.6) * 0.03 : 0;
    dome.material.opacity += (domeGoal - dome.material.opacity) * Math.min(1, dt * 3);
    domeWire.material.opacity += ((state.dome ? 0.16 : 0) - domeWire.material.opacity) * Math.min(1, dt * 3);
    domeWire.rotation.y = t * 0.08;
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

  /** Для проверки и съёмки: поставить камеру в произвольную точку (в демо не используется). */
  function view(camPos, lookAt, extra = {}) {
    goal.pos.set(...camPos); goal.look.set(...lookAt); goal.shift = 0; goal.ease = 1;
    cam.pos.copy(goal.pos); cam.look.copy(goal.look); cam.shift = 0;
    Object.assign(state, DEFAULT_STATE, extra);
    bubblesBox.replaceChildren();
    bubbles = [];
  }
  window.SabyrScene = { setBeat, view };
  const now = window.SabyrDeck?.current?.();
  if (now) setBeat(now.id, now.step, true);
  requestAnimationFrame(frame);
}
