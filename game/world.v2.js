// Dream Rider — monde 3D (Three.js r170). Chargé à la demande par game.js.
// Tout est procédural : géométries low-poly à couleurs de sommets, dégradés en canvas.
// Aucune allocation par image : matrices, vecteurs et particules sont réutilisés.
import * as THREE from '../vendor/three.module.min.js';
import { CFG, K, FX } from './sim.js';

// ---------------------------------------------------------------- palette
const COL = {
  skyTop: 0x1c2747, skyMid: 0xa8607f, skyHor: 0xf0a262, sunGlow: 0xffc98a, sun: 0xfff0c8,
  fog: 0xe79a6b,
  ground: 0x354a2f, soil: 0x4b3a2b,
  red: 0xD42A30, redDark: 0xa81f26, ink: 0x0D141A,
};
const TRACK_W = 8.4, TEX_LEN = 16.8;
const VINE_SP = 1.3, VINE_PER = 8, VINE_PERIOD = VINE_SP * VINE_PER; // motif périodique : défilement sans saut
const HOUSE_SPAN = 290, TREE_SPAN = 300;

// ---------------------------------------------------------------- temporaires partagés
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _zAxis = new THREE.Vector3(0, 0, 1), _v2 = new THREE.Vector2();

function rng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---- construction de géométries « à plat » (non indexées, couleur par sommet)
function colorize(g, hex) {
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function flat(geo) {
  if (!geo.index) return geo;
  const g = geo.toNonIndexed(); geo.dispose(); return g;
}
function P(geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const g = flat(geo);
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return colorize(g, hex);
}
// pavé tendu entre deux points (membres du pilote, cou de la cigogne…)
function limb(hex, ax, ay, az, bx, by, bz, w, h) {
  _a.set(ax, ay, az); _b.set(bx, by, bz);
  const len = _a.distanceTo(_b);
  const g = flat(new THREE.BoxGeometry(w, h, len));
  _b.sub(_a).normalize(); _q.setFromUnitVectors(_zAxis, _b);
  _p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); _s.set(1, 1, 1);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return colorize(g, hex);
}
function merge(list, names = ['position', 'normal', 'color']) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = list[0].attributes[name].itemSize, arr = new Float32Array(n * size);
    let o = 0;
    for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  for (const g of list) g.dispose();
  out.computeBoundingSphere();
  return out;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function radial(g, w, h, stops) {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------- modèles
function barrelParts(list, cx, cy, cz, lying) {
  // v2 : botte de paille ronde (plus de tonneau : zéro alcool sur le site) ; même forme, couleurs paille, liens de ficelle
  const WOOD = 0xd6ae55, WOOD2 = 0xc99f47, HOOP = 0x9c7a35, LID = 0xe2c171;
  const segs = [
    [-0.55, -0.46, 0.40, 0.43, HOOP, false], [-0.46, -0.14, 0.43, 0.485, WOOD, true],
    [-0.14, -0.08, 0.485, 0.495, HOOP, true], [-0.08, 0.08, 0.495, 0.495, WOOD2, true],
    [0.08, 0.14, 0.495, 0.485, HOOP, true], [0.14, 0.46, 0.485, 0.43, WOOD, true],
    [0.46, 0.55, 0.43, 0.40, HOOP, false],
  ];
  const rx = lying ? Math.PI / 2 : 0;
  _e.set(rx, 0, 0); _q.setFromEuler(_e);
  for (const [y0, y1, r0, r1, col, open] of segs) {
    const g = flat(new THREE.CylinderGeometry(r1, r0, y1 - y0, 10, 1, open));
    g.translate(0, (y0 + y1) / 2, 0);
    g.applyQuaternion(_q); g.translate(cx, cy, cz);
    list.push(colorize(g, col));
  }
  for (const sgn of [1, -1]) {
    const g = flat(new THREE.CircleGeometry(0.35, 10));
    g.rotateX(sgn > 0 ? -Math.PI / 2 : Math.PI / 2); g.translate(0, sgn * 0.553, 0);
    g.applyQuaternion(_q); g.translate(cx, cy, cz);
    list.push(colorize(g, LID));
  }
}

function blob(r, seed, segs) { // disque irrégulier (flaques)
  const g = new THREE.CircleGeometry(r, segs);
  const p = g.attributes.position;
  for (let i = 1; i < p.count; i++) {
    const k = 0.8 + 0.34 * hash(seed + (i % segs) * 7.3);
    p.setXY(i, p.getX(i) * k, p.getY(i) * k);
  }
  return g;
}

function buildModels() {
  const M = {};
  const RED = COL.red, DARK = 0x16191c, JEANS = 0x2b3a4e, JACKET = 0x111a22;

  // --- quad + pilote (une seule géométrie), roues à part pour tourner
  M.quad = merge([
    P(new THREE.BoxGeometry(0.62, 0.2, 1.5), 0x22262b, 0, 0.42, 0),
    P(new THREE.BoxGeometry(0.5, 0.3, 0.55), 0x3a3f45, 0, 0.36, 0.05),
    P(new THREE.BoxGeometry(0.78, 0.26, 0.92), RED, 0, 0.62, 0),
    P(new THREE.BoxGeometry(0.52, 0.14, 0.42), COL.redDark, 0, 0.8, -0.22),
    P(new THREE.BoxGeometry(1.3, 0.12, 0.66), RED, 0, 0.76, -0.66, -0.12),
    P(new THREE.BoxGeometry(1.3, 0.12, 0.64), RED, 0, 0.78, 0.66, 0.1),
    P(new THREE.BoxGeometry(0.12, 0.2, 0.5), RED, -0.6, 0.67, 0.66),
    P(new THREE.BoxGeometry(0.12, 0.2, 0.5), RED, 0.6, 0.67, 0.66),
    P(new THREE.BoxGeometry(0.95, 0.05, 0.32), DARK, 0, 0.9, -0.74),
    P(new THREE.BoxGeometry(0.95, 0.05, 0.38), DARK, 0, 0.93, 0.78),
    P(new THREE.BoxGeometry(0.05, 0.08, 0.38), DARK, -0.47, 0.97, 0.78),
    P(new THREE.BoxGeometry(0.05, 0.08, 0.38), DARK, 0.47, 0.97, 0.78),
    P(new THREE.BoxGeometry(0.46, 0.14, 0.72), 0x101214, 0, 0.87, 0.2),
    P(new THREE.BoxGeometry(0.17, 0.08, 0.04), 0xff3a32, -0.4, 0.74, 0.985),
    P(new THREE.BoxGeometry(0.17, 0.08, 0.04), 0xff3a32, 0.4, 0.74, 0.985),
    P(new THREE.BoxGeometry(0.9, 0.06, 0.06), DARK, 0, 0.5, 0.96),
    P(new THREE.BoxGeometry(0.07, 0.34, 0.07), DARK, 0, 0.98, -0.44, -0.3),
    P(new THREE.BoxGeometry(0.96, 0.05, 0.05), DARK, 0, 1.13, -0.38),
    P(new THREE.BoxGeometry(0.2, 0.04, 0.3), DARK, -0.42, 0.47, -0.05),
    P(new THREE.BoxGeometry(0.2, 0.04, 0.3), DARK, 0.42, 0.47, -0.05),
    P(new THREE.BoxGeometry(0.3, 0.1, 0.06), 0xfff1c4, 0, 0.7, -1.0),
    // pilote
    limb(JEANS, -0.15, 1.0, 0.24, -0.3, 1.02, -0.2, 0.19, 0.19),
    limb(JEANS, 0.15, 1.0, 0.24, 0.3, 1.02, -0.2, 0.19, 0.19),
    limb(JEANS, -0.3, 1.0, -0.2, -0.4, 0.56, -0.08, 0.16, 0.16),
    limb(JEANS, 0.3, 1.0, -0.2, 0.4, 0.56, -0.08, 0.16, 0.16),
    P(new THREE.BoxGeometry(0.17, 0.14, 0.3), 0x1a1410, -0.41, 0.53, -0.13),
    P(new THREE.BoxGeometry(0.17, 0.14, 0.3), 0x1a1410, 0.41, 0.53, -0.13),
    P(new THREE.BoxGeometry(0.54, 0.62, 0.3), JACKET, 0, 1.36, 0.2, -0.28),
    P(new THREE.BoxGeometry(0.555, 0.08, 0.31), RED, 0, 1.47, 0.17, -0.28),
    limb(JACKET, -0.27, 1.6, 0.12, -0.46, 1.16, -0.37, 0.14, 0.14),
    limb(JACKET, 0.27, 1.6, 0.12, 0.46, 1.16, -0.37, 0.14, 0.14),
    P(new THREE.BoxGeometry(0.11, 0.11, 0.12), 0x0b0b0b, -0.47, 1.14, -0.38),
    P(new THREE.BoxGeometry(0.11, 0.11, 0.12), 0x0b0b0b, 0.47, 1.14, -0.38),
    P(new THREE.BoxGeometry(0.16, 0.12, 0.14), JACKET, 0, 1.68, 0.1),
    P(new THREE.IcosahedronGeometry(0.25, 1), 0xf3f3f1, 0, 1.88, 0.07, 0, 0, 0, 1, 0.95, 1.1),
    P(new THREE.BoxGeometry(0.06, 0.05, 0.52), RED, 0, 2.11, 0.07),
    P(new THREE.BoxGeometry(0.36, 0.12, 0.1), 0x1b232c, 0, 1.85, -0.19),
  ]);
  M.wheel = merge([
    P(new THREE.CylinderGeometry(0.34, 0.34, 0.28, 9), 0x1b1d20, 0, 0, 0, 0, 0, Math.PI / 2),
    P(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 7), 0xa3a7ab, 0, 0, 0, 0, 0, Math.PI / 2),
  ]);

  // --- obstacles
  let parts = [];
  barrelParts(parts, 0, 0.55, 0, false);
  M.barrel = merge(parts);

  parts = [
    P(new THREE.BoxGeometry(1.92, 0.12, 1.15), 0x8a6a45, 0, 0.06, 0),
    P(new THREE.BoxGeometry(1.94, 0.04, 0.16), 0x5f4630, 0, 0.125, -0.42),
    P(new THREE.BoxGeometry(1.94, 0.04, 0.16), 0x5f4630, 0, 0.125, 0.42),
  ];
  barrelParts(parts, -0.47, 0.61, 0, true);
  barrelParts(parts, 0.47, 0.61, 0, true);
  barrelParts(parts, 0, 1.47, 0, true);
  M.pile = merge(parts);

  M.rock = merge([
    P(new THREE.DodecahedronGeometry(0.62, 0), 0x8b8478, 0, 0.42, 0, 0.3, 0.5, 0, 1.25, 0.85, 1.05),
    P(new THREE.DodecahedronGeometry(0.34, 0), 0x736c61, 0.56, 0.2, 0.2, 0.7, 0.2, 0.4),
    P(new THREE.DodecahedronGeometry(0.22, 0), 0x9a9283, -0.58, 0.12, -0.12, 0.2, 0.9, 0.1),
    P(new THREE.ConeGeometry(0.05, 0.3, 3), 0x58743a, -0.35, 0.15, 0.48, 0.3, 0, -0.3),
    P(new THREE.ConeGeometry(0.05, 0.26, 3), 0x58743a, -0.25, 0.13, 0.52, -0.2, 0, 0.2),
  ]);

  const mud = [
    P(blob(1, 3, 11), 0x4a3121, 0, 0, 0, -Math.PI / 2, 0, 0, 0.95, 1, 1.25),
    P(blob(0.6, 9, 9), 0x2f1f15, 0.08, 0.006, -0.1, -Math.PI / 2, 0, 0, 1, 1, 1.2),
  ];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.37 + 0.4, r = 1.15 + hash(i) * 0.3;
    mud.push(P(new THREE.CircleGeometry(0.1 + hash(i + 9) * 0.1, 6), 0x4a3121, Math.cos(a) * r * 0.95, 0.003, Math.sin(a) * r * 1.2, -Math.PI / 2));
  }
  M.mud = merge(mud);

  // --- grappe (récompense)
  const grape = [];
  const berries = [[0, 0, 0.17, 4, 0], [-0.19, 0, 0.14, 4, 0.5], [-0.37, 0, 0.1, 3, 0.2], [-0.53, 0, 0, 1, 0]];
  const tones = [0x4a1636, 0x6a2350, 0x83305f];
  let bi = 0;
  for (const [y, , r, n, off] of berries) {
    for (let k = 0; k < n; k++) {
      const a = off + (k / n) * Math.PI * 2;
      grape.push(P(new THREE.IcosahedronGeometry(0.125, 0), tones[bi++ % 3], Math.cos(a) * r, y, Math.sin(a) * r, bi, bi * 2, 0));
    }
  }
  grape.push(P(new THREE.IcosahedronGeometry(0.12, 0), tones[1], 0, -0.1, 0));
  grape.push(P(new THREE.BoxGeometry(0.035, 0.2, 0.035), 0x5a4a24, 0, 0.17, 0));
  grape.push(P(new THREE.CircleGeometry(0.22, 5), 0x4d7a35, 0.14, 0.2, 0.02, -0.35, 0.3, 0.7));
  grape.push(P(new THREE.CircleGeometry(0.22, 5), 0x4d7a35, 0.14, 0.2, 0.02, -0.35 + Math.PI, -0.3, -0.7));
  for (const g of grape) g.scale(1.3, 1.3, 1.3);
  M.grape = merge(grape);

  // --- bretzel (bonus ×2)
  const pts = [[0.58, -0.42, 0], [0.25, -0.12, 0.06], [0, 0.1, 0.1], [-0.3, 0.38, 0.05], [-0.52, 0.56, 0], [-0.82, 0.42, 0], [-0.9, 0, 0], [-0.72, -0.4, 0], [-0.36, -0.6, 0], [0, -0.63, 0], [0.36, -0.6, 0], [0.72, -0.4, 0], [0.9, 0, 0], [0.82, 0.42, 0], [0.52, 0.56, 0], [0.3, 0.38, -0.05], [0, 0.1, -0.1], [-0.25, -0.12, -0.06], [-0.58, -0.42, 0]];
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const pz = [P(new THREE.TubeGeometry(curve, 72, 0.13, 6, false), 0xb8692c)];
  pz.push(P(new THREE.IcosahedronGeometry(0.13, 0), 0xb8692c, 0.58, -0.42, 0));
  pz.push(P(new THREE.IcosahedronGeometry(0.13, 0), 0xb8692c, -0.58, -0.42, 0));
  for (let i = 0; i < 14; i++) {
    curve.getPointAt((i + 0.5) / 14, _a);
    pz.push(P(new THREE.BoxGeometry(0.05, 0.05, 0.05), 0xfaf6ee, _a.x, _a.y + 0.06, _a.z + 0.11, i, i * 2, 0));
  }
  M.pretzel = merge(pz);

  // --- vigne : cep + feuillage (teinté par instance)
  // rang palissé : haie continue (chaque touffe déborde sur la suivante), cep court
  M.vine = merge([
    P(new THREE.BoxGeometry(0.08, 0.55, 0.08), 0x7a6450, 0, 0.27, 0),
    P(new THREE.IcosahedronGeometry(0.62, 0), 0xffffff, 0, 0.98, 0, 0.2, 0.4, 0, 0.5, 0.8, 1.95),
    P(new THREE.IcosahedronGeometry(0.46, 0), 0xe6f2dc, 0.03, 1.42, 0.3, 0.5, 0.1, 0.2, 0.5, 0.55, 1.7),
    P(new THREE.IcosahedronGeometry(0.42, 0), 0xd4e6c8, -0.04, 0.72, -0.4, 0.1, 0.7, 0, 0.55, 0.5, 1.6),
  ]);
  M.post = merge([P(new THREE.BoxGeometry(0.09, 1.6, 0.09), 0x3b2b1f, 0, 0.8, 0, 0.04, 0, 0.03)]);
  const vg = [];
  for (let k = 0; k < 6; k++) vg.push(P(new THREE.IcosahedronGeometry(0.075, 0), tones[k % 3], 0.36 + (k % 2) * 0.05, 0.62 - (k >> 1) * 0.09, (k % 3 - 1) * 0.07));
  M.vineGrapes = merge(vg);
  M.tuft = merge([
    P(new THREE.ConeGeometry(0.06, 0.42, 3), 0x5d7a3c, 0, 0.2, 0, 0.25, 0, -0.2),
    P(new THREE.ConeGeometry(0.05, 0.34, 3), 0x6b8a44, 0.08, 0.16, 0.04, -0.2, 0.5, 0.3),
    P(new THREE.ConeGeometry(0.05, 0.3, 3), 0x4f6b33, -0.07, 0.14, -0.05, 0.1, 1, 0.35),
  ]);
  M.flower = merge([
    P(new THREE.BoxGeometry(0.02, 0.36, 0.02), 0x4f6b33, 0, 0.18, 0),
    P(new THREE.IcosahedronGeometry(0.07, 0), 0xffffff, 0, 0.38, 0, 0, 0, 0, 1, 0.6, 1),
  ]);

  // --- maisons à colombages : murs texturés (pignons compris) + toit
  const box = flat(new THREE.BoxGeometry(1, 1, 1)); box.translate(0, 0.5, 0);
  const gable = new THREE.BufferGeometry();
  const gp = [-0.5, 1, 0.5, 0.5, 1, 0.5, 0, 1.75, 0.5, 0.5, 1, -0.5, -0.5, 1, -0.5, 0, 1.75, -0.5];
  gable.setAttribute('position', new THREE.BufferAttribute(new Float32Array(gp), 3));
  gable.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 0.75, 0, 0, 1, 0, 0.5, 0.75]), 2));
  gable.computeVertexNormals();
  M.walls = merge([box, gable], ['position', 'normal', 'uv']);
  const roof = new THREE.BufferGeometry();
  const ex = 0.6, ey = 0.94, ry = 1.8, ez = 0.58, iy = 0.06;
  const rp = [
    -ex, ey, -ez, -ex, ey, ez, 0, ry, ez, -ex, ey, -ez, 0, ry, ez, 0, ry, -ez,
    ex, ey, ez, ex, ey, -ez, 0, ry, -ez, ex, ey, ez, 0, ry, -ez, 0, ry, ez,
    // dessous
    -ex, ey - iy, ez, -ex, ey - iy, -ez, 0, ry - iy, ez, 0, ry - iy, ez, -ex, ey - iy, -ez, 0, ry - iy, -ez,
    ex, ey - iy, -ez, ex, ey - iy, ez, 0, ry - iy, -ez, 0, ry - iy, -ez, ex, ey - iy, ez, 0, ry - iy, ez,
  ];
  roof.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rp), 3));
  roof.computeVertexNormals();
  const rc = new Float32Array(rp.length);
  for (let i = 0; i < rp.length / 3; i++) {
    _c.set(i < 12 ? 0x8f3c2a : 0x3a2219);
    rc[i * 3] = _c.r; rc[i * 3 + 1] = _c.g; rc[i * 3 + 2] = _c.b;
  }
  roof.setAttribute('color', new THREE.BufferAttribute(rc, 3));
  M.roof = merge([roof, P(new THREE.BoxGeometry(0.1, 0.5, 0.1), 0x6d4a3a, 0.22, 1.55, 0.2)]);

  M.tree = merge([
    P(new THREE.BoxGeometry(0.28, 1.8, 0.28), 0x4a3424, 0, 0.9, 0),
    P(new THREE.IcosahedronGeometry(1.35, 0), 0x2e4728, 0, 2.6, 0, 0.3, 0.2, 0),
    P(new THREE.IcosahedronGeometry(0.95, 0), 0x3a5631, 0.55, 3.3, 0.25, 0.6, 0, 0.3),
  ]);
  M.poplar = merge([
    P(new THREE.BoxGeometry(0.2, 1.2, 0.2), 0x4a3424, 0, 0.6, 0),
    P(new THREE.ConeGeometry(0.85, 6.5, 6), 0x2b4526, 0, 4.1, 0),
  ]);

  // --- cigogne : corps + deux ailes (qui battent)
  const W_ = 0xf6f4ef, BEAK = 0xd8502a, BLK = 0x121212;
  M.storkBody = merge([
    P(new THREE.IcosahedronGeometry(0.5, 0), W_, 0, 0, 0, 0, 0, 0, 0.42, 0.38, 1.1),
    P(new THREE.BoxGeometry(0.3, 0.06, 0.36), W_, 0, 0.02, 0.62),
    limb(W_, 0, 0.08, -0.45, 0, 0.12, -1.0, 0.11, 0.11),
    P(new THREE.IcosahedronGeometry(0.13, 0), W_, 0, 0.14, -1.06),
    P(new THREE.ConeGeometry(0.045, 0.55, 4), BEAK, 0, 0.1, -1.38, -Math.PI / 2),
    limb(BEAK, -0.07, -0.05, 0.4, -0.07, -0.07, 1.25, 0.04, 0.04),
    limb(BEAK, 0.07, -0.05, 0.4, 0.07, -0.07, 1.25, 0.04, 0.04),
  ]);
  const wing = (s) => merge([
    P(new THREE.BoxGeometry(1.0, 0.04, 0.55), W_, s * 0.5, 0, 0.02),
    P(new THREE.BoxGeometry(0.95, 0.035, 0.46), BLK, s * 1.45, 0, 0.06),
    P(new THREE.BoxGeometry(0.32, 0.03, 0.3), BLK, s * 2.05, 0, 0.12),
  ]);
  M.wingR = wing(1); M.wingL = wing(-1);
  return M;
}

// ---- silhouettes des Vosges (ballons arrondis), en dégradé vers la brume
function ridge(z, width, segs, base, amp, seed, topHex, botHex, extra) {
  const top = new THREE.Color(topHex), bot = new THREE.Color(botHex), mix = new THREE.Color();
  const pos = [], col = [], idx = [];
  const hAt = (x) => {
    const f = 0.5 * Math.sin(x * 0.016 + seed) + 0.3 * Math.sin(x * 0.037 + seed * 2.1) + 0.2 * Math.sin(x * 0.083 + seed * 3.7);
    return base + amp * (0.5 + 0.5 * f);
  };
  for (let i = 0; i <= segs; i++) {
    const x = -width / 2 + (width * i) / segs, h = hAt(x);
    mix.copy(bot).lerp(top, 0.5 + 0.5 * Math.min(1, h / (base + amp)));
    pos.push(x, -4, z, x, h, z);
    col.push(bot.r, bot.g, bot.b, mix.r, mix.g, mix.b);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const list = [flat(g)];
  if (extra) extra(list, hAt, topHex);
  return { list, hAt };
}

// ---------------------------------------------------------------- monde
export async function createWorld(canvas, sim, o = {}) {
  const keep = [];
  const K_ = (x) => { keep.push(x); return x; };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !!o.antialias, alpha: false, stencil: false, powerPreference: 'high-performance' });
  renderer.setClearColor(COL.skyHor, 1);
  const lowEnd = !!o.lowEnd;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COL.fog, 24, 135);
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.3, 800);
  camera.position.set(0, 3.7, 7.4);

  scene.add(new THREE.HemisphereLight(0xffd7b8, 0x2c3a2a, 2.1));
  const sunLight = new THREE.DirectionalLight(0xffc591, 2.6);
  sunLight.position.set(-5, 6, 3.2);
  scene.add(sunLight);

  const M = buildModels();
  for (const k in M) K_(M[k]);
  const matFlat = K_(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const matMud = K_(new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 70, specular: 0x7a5a44 }));

  // ---- ciel (dégradé + halo du soleil)
  const sunPos = new THREE.Vector3(-62, 9, -385);
  const skyMat = K_(new THREE.ShaderMaterial({
    uniforms: {
      cTop: { value: new THREE.Color(COL.skyTop) }, cMid: { value: new THREE.Color(COL.skyMid) },
      cHor: { value: new THREE.Color(COL.skyHor) }, cSun: { value: new THREE.Color(COL.sunGlow) },
      sunDir: { value: sunPos.clone().sub(camera.position).normalize() },
    },
    vertexShader: 'varying vec3 vDir;\nvoid main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 cTop; uniform vec3 cMid; uniform vec3 cHor; uniform vec3 cSun; uniform vec3 sunDir; varying vec3 vDir;',
      'void main(){',
      '  vec3 d = normalize(vDir); float h = d.y;',
      '  vec3 col = mix(cHor, cMid, smoothstep(0.0, 0.17, h));',
      '  col = mix(col, cTop, smoothstep(0.13, 0.55, h));',
      '  float s = max(dot(d, sunDir), 0.0);',
      '  col += cSun * (pow(s, 7.0) * 0.30 + pow(s, 48.0) * 0.5);',
      '  gl_FragColor = vec4(col, 1.0);',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  }));
  const sky = new THREE.Mesh(K_(new THREE.SphereGeometry(500, 32, 16)), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  const sunDisc = new THREE.Mesh(K_(new THREE.CircleGeometry(15, 40)), K_(new THREE.MeshBasicMaterial({ color: COL.sun, fog: false })));
  sunDisc.position.copy(sunPos); scene.add(sunDisc);
  const glowTex = K_(canvasTex(128, 128, (g, w, h) => radial(g, w, h, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']])));
  const sunGlow = new THREE.Mesh(K_(new THREE.PlaneGeometry(120, 120)), K_(new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffb070, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
  sunGlow.position.set(sunPos.x, sunPos.y, sunPos.z + 2); scene.add(sunGlow);

  const castle = (list, hAt, hex) => {
    const xc = 70, hc = hAt(xc) - 1.2;
    list.push(P(new THREE.BoxGeometry(9, 4.5, 3), hex, xc, hc + 2, 0));
    list.push(P(new THREE.BoxGeometry(2.6, 9, 2.6), hex, xc + 3.4, hc + 4.4, 0));
    list.push(P(new THREE.ConeGeometry(2.1, 3, 4), hex, xc + 3.4, hc + 10.4, 0, 0, Math.PI / 4));
    list.push(P(new THREE.BoxGeometry(1.6, 6, 1.6), hex, xc - 4, hc + 3, 0));
    list.push(P(new THREE.ConeGeometry(1.3, 2.2, 4), hex, xc - 4, hc + 7.1, 0, 0, Math.PI / 4));
  };
  const rFar = ridge(-430, 1500, 70, 30, 34, 1.3, 0x9b6a8a, 0xeaa070);
  const rMid = ridge(-345, 1300, 64, 14, 26, 4.1, 0x5c4566, 0xe59a72, castle);
  const rNear = ridge(-250, 1100, 60, 4, 11, 7.7, 0x3a3a4c, 0xdf946c);
  const hills = K_(merge([...rFar.list, ...rMid.list, ...rNear.list]));
  const hillsMesh = new THREE.Mesh(hills, K_(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  scene.add(hillsMesh);
  // soleil posé entre la crête lointaine et la crête du milieu, à moitié caché par celle-ci
  {
    const sz = -400, k = (-sz + 7.4) / (345 + 7.4), sx = -62;
    const hMid = rMid.hAt(sx / k);
    const sy = 3.7 + (hMid - 3.7) * k + 17 * 0.25;
    sunDisc.position.set(sx, sy, sz); sunDisc.scale.setScalar(17 / 15);
    sunGlow.position.set(sx, sy, sz + 2);
    skyMat.uniforms.sunDir.value.copy(sunDisc.position).sub(camera.position).normalize();
  }

  // ---- sol, chemin, bandes de terre sous les rangs
  const ground = new THREE.Mesh(K_(new THREE.PlaneGeometry(1200, 900)), K_(new THREE.MeshLambertMaterial({ color: COL.ground })));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.06, -380);
  scene.add(ground);

  const dirt = K_(canvasTex(256, 512, drawDirt));
  dirt.wrapS = THREE.ClampToEdgeWrapping; dirt.wrapT = THREE.RepeatWrapping;
  dirt.anisotropy = Math.min(lowEnd ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  const TRACK_LEN = 230;
  dirt.repeat.set(1, TRACK_LEN / TEX_LEN);
  const trackMesh = new THREE.Mesh(K_(new THREE.PlaneGeometry(TRACK_W, TRACK_LEN)), K_(new THREE.MeshLambertMaterial({ map: dirt })));
  trackMesh.rotation.x = -Math.PI / 2; trackMesh.position.set(0, 0, 12 - TRACK_LEN / 2);
  scene.add(trackMesh);

  const ROWS = lowEnd ? 5 : 7;
  const rowX = [];
  for (let r = 0; r < ROWS; r++) { rowX.push(-(6.5 + r * 2.5)); rowX.push(6.5 + r * 2.5); }
  const strips = [];
  for (const x of rowX) strips.push(P(new THREE.PlaneGeometry(1.25, 175), COL.soil, x, 0.004, 12 - 87.5, -Math.PI / 2));
  strips.push(P(new THREE.PlaneGeometry(1.0, 175), 0x445a33, -4.7, 0.003, 12 - 87.5, -Math.PI / 2));
  strips.push(P(new THREE.PlaneGeometry(1.0, 175), 0x445a33, 4.7, 0.003, 12 - 87.5, -Math.PI / 2));
  const stripMesh = new THREE.Mesh(K_(merge(strips)), matFlat);
  scene.add(stripMesh);

  // ---- rangs de vigne (InstancedMesh dans un groupe qui défile modulo la période)
  const vines = new THREE.Group(); scene.add(vines);
  const zNear = 12, zFar = -150, perRow = Math.ceil((zNear - zFar) / VINE_SP);
  const greens = [0x233A2C, 0x2a4632, 0x31513a, 0x284331, 0x3b5a37, 0x2e4a2e, 0x46603a, 0x26402d];
  const autumn = [0x6e6a2e, 0x7d5f2c];
  const vineIM = new THREE.InstancedMesh(M.vine, matFlat, rowX.length * perRow);
  const postIM = new THREE.InstancedMesh(M.post, matFlat, rowX.length * Math.ceil(perRow / 4));
  const vgIM = new THREE.InstancedMesh(M.vineGrapes, matFlat, rowX.length * perRow);
  let vi = 0, pi = 0, gi = 0;
  rowX.forEach((x, r) => {
    for (let j = 0; j < perRow; j++) {
      const v = r * 31 + (j % VINE_PER) * 7.7; // variation périodique : le motif se répète tous les VINE_PERIOD m
      const z = zNear - j * VINE_SP;
      _e.set(0, (hash(v) - 0.5) * 0.16, 0); _q.setFromEuler(_e);
      _p.set(x + (hash(v + 1) - 0.5) * 0.08, 0, z);
      _s.set(0.9 + hash(v + 2) * 0.28, 0.85 + hash(v + 3) * 0.35, 0.9 + hash(v + 4) * 0.2);
      vineIM.setMatrixAt(vi, _m.compose(_p, _q, _s));
      const hv = hash(v + 5);
      _c.set(hv < 0.08 ? autumn[(hv * 100) & 1] : greens[(hash(v + 6) * greens.length) | 0]);
      vineIM.setColorAt(vi++, _c);
      if (hash(v + 8) < 0.4) {
        _e.set(0, x < 0 ? 0 : Math.PI, 0); _q.setFromEuler(_e);
        _p.set(x, 0, z + (hash(v + 9) - 0.5) * 0.5); _s.set(1, 0.85 + hash(v + 3) * 0.35, 1);
        vgIM.setMatrixAt(gi++, _m.compose(_p, _q, _s));
      }
      if (j % 4 === 2) {
        _q.identity(); _p.set(x, 0, z + VINE_SP / 2); _s.set(1, 1, 1);
        postIM.setMatrixAt(pi++, _m.compose(_p, _q, _s));
      }
    }
  });
  vineIM.count = vi; postIM.count = pi; vgIM.count = gi;
  const tuftCount = Math.ceil((zNear - zFar) / (VINE_PERIOD / 12)) * 2;
  const tuftIM = new THREE.InstancedMesh(M.tuft, matFlat, tuftCount);
  const flowerIM = new THREE.InstancedMesh(M.flower, matFlat, tuftCount);
  let ti = 0, fi = 0;
  const flowerCols = [COL.red, COL.red, 0xf3efe6, 0xe0b23a];
  for (const side of [-1, 1]) {
    for (let j = 0; j * (VINE_PERIOD / 12) < zNear - zFar; j++) {
      const v = (side + 2) * 97 + (j % 12) * 5.3;
      const z = zNear - j * (VINE_PERIOD / 12);
      _e.set(0, hash(v) * 6.28, 0); _q.setFromEuler(_e);
      _p.set(side * (4.45 + hash(v + 1) * 1.5), 0, z + (hash(v + 2) - 0.5) * 0.6);
      const sc = 0.8 + hash(v + 3) * 0.7; _s.set(sc, sc, sc);
      tuftIM.setMatrixAt(ti++, _m.compose(_p, _q, _s));
      if (hash(v + 4) < 0.3) {
        _p.x += 0.15; _p.z += 0.1; _s.set(1, 0.8 + hash(v + 5) * 0.6, 1);
        flowerIM.setMatrixAt(fi, _m.compose(_p, _q, _s));
        _c.set(flowerCols[(hash(v + 6) * 4) | 0]); flowerIM.setColorAt(fi++, _c);
      }
    }
  }
  tuftIM.count = ti; flowerIM.count = fi;
  for (const im of [vineIM, postIM, vgIM, tuftIM, flowerIM]) { im.frustumCulled = false; vines.add(im); }

  // ---- maisons, arbres, peupliers : recyclés quand ils passent derrière la caméra
  const timber = K_(canvasTex(128, 128, drawTimber));
  const matWalls = K_(new THREE.MeshLambertMaterial({ map: timber }));
  const nH = lowEnd ? 10 : 14, nT = lowEnd ? 14 : 22, nP = lowEnd ? 8 : 12;
  const wallsIM = new THREE.InstancedMesh(M.walls, matWalls, nH);
  const roofIM = new THREE.InstancedMesh(M.roof, matFlat, nH);
  const treeIM = new THREE.InstancedMesh(M.tree, matFlat, nT);
  const poplarIM = new THREE.InstancedMesh(M.poplar, matFlat, nP);
  for (const im of [wallsIM, roofIM, treeIM, poplarIM]) { im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
  const wallCols = [0xf1e6cf, 0xeec9a0, 0xe8b9a8, 0xc9d6c2, 0xeadf9f, 0xd9a68a, 0xbfd0d8, 0xf3ede4];
  const R = rng(1977);
  const houses = [];
  for (let i = 0; i < nH; i++) houses.push({ x: 0, z: 0, w: 0, h: 0, d: 0, r: 0 });
  const placeHouse = (hs, i, zBase) => {
    const side = (i >> 1) % 2 ? 1 : -1;
    hs.x = side * (27 + R() * 15); hs.z = zBase + (R() - 0.5) * 14;
    hs.w = 3.2 + R() * 1.3; hs.h = 2.6 + R() * 1.0; hs.d = 4 + R() * 2;
    hs.r = (R() < 0.5 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.3;
    _c.set(wallCols[(R() * wallCols.length) | 0]); wallsIM.setColorAt(i, _c);
    const rb = 0.82 + R() * 0.2; _c.setRGB(rb, rb * (0.92 + R() * 0.1), rb * 0.95); roofIM.setColorAt(i, _c);
  };
  for (let i = 0; i < nH; i++) placeHouse(houses[i], i, 20 - Math.floor(i / 2) * (HOUSE_SPAN / Math.ceil(nH / 2)));
  const props = (n, im, xMin, xMax, span) => {
    const arr = [];
    for (let i = 0; i < n; i++) {
      const it = { x: (i % 2 ? 1 : -1) * (xMin + R() * (xMax - xMin)), z: 20 - R() * span, s: 0.8 + R() * 0.6, r: R() * 6.28 };
      arr.push(it);
      const b = 0.82 + R() * 0.3; _c.setRGB(b, b, b * (0.9 + R() * 0.15)); im.setColorAt(i, _c);
    }
    return arr;
  };
  const trees = props(nT, treeIM, 24, 70, TREE_SPAN);
  const poplars = props(nP, poplarIM, 22, 60, TREE_SPAN);

  // ---- objets du jeu (instanciés : un appel de dessin par type)
  const caps = [24, 8, 24, 14, 64, 3];
  const geos = [M.barrel, M.pile, M.rock, M.mud, M.grape, M.pretzel];
  const IM = geos.map((g, k) => {
    const im = new THREE.InstancedMesh(g, k === K.MUD ? matMud : matFlat, caps[k]);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0;
    scene.add(im); return im;
  });
  const cnt = new Int32Array(6);
  const blobTex = K_(canvasTex(64, 64, (g, w, h) => radial(g, w, h, [[0, 'rgba(0,0,0,0.62)'], [0.55, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']])));
  const shadowGeo = K_(new THREE.PlaneGeometry(1, 1)); shadowGeo.rotateX(-Math.PI / 2);
  const matShadow = K_(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const shadowIM = new THREE.InstancedMesh(shadowGeo, matShadow, 96);
  shadowIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shadowIM.frustumCulled = false; shadowIM.count = 0; shadowIM.renderOrder = 1;
  scene.add(shadowIM);
  const glowIM = new THREE.InstancedMesh(K_(new THREE.PlaneGeometry(2.6, 2.6)), K_(new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffc04a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })), 3);
  glowIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); glowIM.frustumCulled = false; glowIM.count = 0;
  scene.add(glowIM);
  const SH = [[1.2, 1.2], [2.3, 1.4], [1.7, 1.4], [0, 0], [0.9, 0.9], [1.4, 1.0]]; // taille des ombres

  // ---- quad
  const quadRoot = new THREE.Group(), pivot = new THREE.Group();
  quadRoot.add(pivot); scene.add(quadRoot);
  pivot.add(new THREE.Mesh(M.quad, matFlat));
  const wheels = [];
  for (const [x, z] of [[-0.6, -0.62], [0.6, -0.62], [-0.6, 0.64], [0.6, 0.64]]) {
    const w = new THREE.Mesh(M.wheel, matFlat); w.position.set(x, 0.34, z); pivot.add(w); wheels.push(w);
  }
  const blobTex2 = K_(canvasTex(64, 64, (g, w, h) => radial(g, w, h, [[0, 'rgba(0,0,0,0.88)'], [0.5, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']])));
  const matQShadow = K_(matShadow.clone()); matQShadow.map = blobTex2;
  const qShadow = new THREE.Mesh(shadowGeo, matQShadow);
  qShadow.renderOrder = 1; scene.add(qShadow);

  // ---- cigognes
  const storks = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(M.storkBody, matFlat));
    const wr = new THREE.Mesh(M.wingR, matFlat), wl = new THREE.Mesh(M.wingL, matFlat);
    wr.position.set(0.16, 0.06, -0.05); wl.position.set(-0.16, 0.06, -0.05);
    g.add(wr); g.add(wl); g.scale.setScalar(1.8);
    scene.add(g);
    storks.push({ g, wr, wl, phase: i * 1.7, glide: 0 });
  }
  const flock = { on: true, dir: 1, x: -26, y: 15, z: -70, wait: 0 };

  // ---- particules (poussière, éclaboussures, étincelles)
  const PN = lowEnd ? 120 : 180;
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pAl = new Float32Array(PN), pSz = new Float32Array(PN);
  const pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN);
  const pS0 = new Float32Array(PN), pS1 = new Float32Array(PN), pA0 = new Float32Array(PN), pG = new Float32Array(PN), pAt = new Float32Array(PN);
  let pNext = 0;
  const pGeo = K_(new THREE.BufferGeometry());
  const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
  const aPos = attr(pPos, 3), aCol = attr(pCol, 3), aAl = attr(pAl, 1), aSz = attr(pSz, 1);
  pGeo.setAttribute('position', aPos); pGeo.setAttribute('aColor', aCol); pGeo.setAttribute('aAlpha', aAl); pGeo.setAttribute('aSize', aSz);
  const dustMat = K_(new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: [
      'attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale;',
      'varying float vA; varying vec3 vC;',
      'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = aSize * uScale / max(0.3, -mv.z); vA = aAlpha; vC = aColor; }',
    ].join('\n'),
    fragmentShader: [
      'varying float vA; varying vec3 vC;',
      'void main(){ vec2 p = gl_PointCoord - 0.5; float r = 1.0 - dot(p, p) * 4.0;',
      '  if (r <= 0.0 || vA <= 0.002) discard;',
      '  gl_FragColor = vec4(vC, vA * r * r);',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
    transparent: true, depthWrite: false,
  }));
  const points = new THREE.Points(pGeo, dustMat);
  points.frustumCulled = false; points.renderOrder = 2;
  scene.add(points);
  const lin = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };
  const PC = { dust: lin(0xd8b98e), dust2: lin(0xc49a6c), mud: lin(0x3e2a1c), grape: lin(0x9a3a72), gold: lin(0xffcf5a), white: lin(0xfff6e0), wood: lin(0x7b4e2c) };
  function emit(x, y, z, vx, vy, vz, life, s0, s1, a0, grav, attach, col) {
    const i = pNext; pNext = (pNext + 1) % PN;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pLife[i] = life; pMax[i] = life; pS0[i] = s0; pS1[i] = s1; pA0[i] = a0; pG[i] = grav; pAt[i] = attach;
    pCol[i * 3] = col[0]; pCol[i * 3 + 1] = col[1]; pCol[i * 3 + 2] = col[2];
  }
  const rs = () => Math.random() - 0.5;
  function burst(type, x, y, z) {
    switch (type) {
      case FX.GRAPE:
        for (let i = 0; i < 12; i++) emit(x, y, z, rs() * 4, 1 + Math.random() * 3, rs() * 3, 0.45, 0.32, 0.04, 1, 4, 0.2, i % 3 ? PC.grape : PC.gold);
        break;
      case FX.PRETZEL:
        for (let i = 0; i < 26; i++) emit(x, y, z, rs() * 6, 1 + Math.random() * 4, rs() * 4, 0.7, 0.4, 0.05, 1, 3, 0.2, i % 4 ? PC.gold : PC.white);
        break;
      case FX.MUD:
        for (let i = 0; i < 22; i++) emit(x + rs() * 1.2, 0.2, 0.2 + rs(), rs() * 5, 2 + Math.random() * 3.5, 1 + Math.random() * 2, 0.6, 0.22, 0.14, 0.95, 13, 0.6, PC.mud);
        shake = Math.max(shake, 0.12);
        break;
      case FX.CRASH:
        for (let i = 0; i < 28; i++) emit(x + rs() * 1.4, 0.3 + Math.random(), z + rs(), rs() * 6, 1 + Math.random() * 4, 1 + Math.random() * 3, 0.9, 0.5, 1.6, 0.55, -0.5, 0, i % 2 ? PC.dust : PC.dust2);
        for (let i = 0; i < 10; i++) emit(x + rs(), 0.8, z, rs() * 7, 2 + Math.random() * 4, 1 + Math.random() * 3, 0.8, 0.16, 0.12, 1, 14, 0, PC.wood);
        shake = Math.max(shake, 0.45);
        break;
      case FX.LAND:
        for (let i = 0; i < 9; i++) emit(x + rs() * 1.2, 0.12, 0.3 + rs() * 1.4, rs() * 3, 0.4 + Math.random(), 0.5, 0.6, 0.4, 1.3, 0.35, 0, 0.9, PC.dust);
        break;
      case FX.JUMP:
        for (let i = 0; i < 6; i++) emit(x + rs() * 1.1, 0.1, 0.7, rs() * 2, 0.5, 0.8, 0.5, 0.35, 1.1, 0.3, 0, 0.9, PC.dust);
        break;
      case FX.BUMP:
        shake = Math.max(shake, 0.06);
        break;
    }
  }

  // ---- caméra / taille
  let W = 2, H = 1, portrait = false, baseFov = 52;
  const cam = { y: 3.7, z: 7.4, ly: 1.3, lz: -14, follow: 0.55, x: 0, yy: 3.7 };
  let shake = 0, t = 0, wheelA = 0, lean = 0, pitch = 0, dustAcc = 0, sparkAcc = 0;

  function resize(w, h, dprCap) {
    W = Math.max(2, w | 0); H = Math.max(2, h | 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap || 1.5));
    renderer.setSize(W, H, false);
    const aspect = W / H;
    portrait = aspect < 1.05;
    if (portrait) {
      cam.y = 4.6; cam.z = 8.8; cam.ly = 1.1; cam.lz = -12; cam.follow = 0.4;
      baseFov = Math.min(74, (2 * Math.atan(0.5 / aspect) * 180) / Math.PI);
    } else {
      cam.y = 3.7; cam.z = 7.4; cam.ly = 1.3; cam.lz = -14; cam.follow = 0.55;
      baseFov = aspect > 1.9 ? 48 : 52;
    }
    camera.aspect = aspect; camera.fov = baseFov; camera.updateProjectionMatrix();
    updatePointScale();
    placeCamera(0);
  }
  function updatePointScale() {
    const bufH = renderer.getDrawingBufferSize(_v2).y;
    dustMat.uniforms.uScale.value = bufH / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }
  function placeCamera(dt) {
    const k = dt > 0 ? 1 - Math.exp(-dt * 3.5) : 1;
    cam.x += (sim.x * cam.follow - cam.x) * k;
    cam.yy += (cam.y + sim.y * 0.35 - cam.yy) * (dt > 0 ? 1 - Math.exp(-dt * 5) : 1);
    const sx = shake * Math.sin(t * 47.3), sy = shake * 0.6 * Math.cos(t * 39.1);
    camera.position.set(cam.x + sx, cam.yy + sy, cam.z);
    camera.lookAt(cam.x * 1.15, cam.ly + sim.y * 0.2, cam.lz);
    // un peu d'élargissement avec la vitesse
    const f = baseFov + Math.max(0, sim.speed - CFG.SPEED_START) * 0.22;
    if (Math.abs(f - camera.fov) > 0.03) { camera.fov = f; camera.updateProjectionMatrix(); updatePointScale(); }
    sky.position.copy(camera.position);
  }

  // ---- mise à jour par image
  function setIM(im, i, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
    im.setMatrixAt(i, _m.compose(_p, _q, _s));
  }
  function flush(im, n) {
    im.count = n; im.visible = n > 0;
    if (n > 0) im.instanceMatrix.needsUpdate = true; // tampons petits (< 7 Ko) : envoi complet, sans allocation
  }

  function updateProps(dz) {
    for (let i = 0; i < houses.length; i++) {
      const hs = houses[i];
      hs.z += dz;
      if (hs.z > 30) { placeHouse(hs, i, hs.z - HOUSE_SPAN); wallsIM.instanceColor.needsUpdate = true; roofIM.instanceColor.needsUpdate = true; }
      setIM(wallsIM, i, hs.x, 0, hs.z, 0, hs.r, 0, hs.w, hs.h, hs.d);
      setIM(roofIM, i, hs.x, 0, hs.z, 0, hs.r, 0, hs.w, hs.h, hs.d);
    }
    flush(wallsIM, houses.length); flush(roofIM, houses.length);
    for (let g = 0; g < 2; g++) {
      const arr = g ? poplars : trees, im = g ? poplarIM : treeIM;
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        it.z += dz;
        if (it.z > 30) { it.z -= TREE_SPAN; it.x = (it.x < 0 ? -1 : 1) * (23 + Math.random() * 45); it.r = Math.random() * 6.28; }
        setIM(im, i, it.x, 0, it.z, 0, it.r, 0, it.s, it.s, it.s);
      }
      flush(im, arr.length);
    }
  }

  function updateEntities() {
    cnt.fill(0);
    let sc = 0, gc = 0;
    const ents = sim.ents;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.on) continue;
      const k = e.kind;
      const n = cnt[k];
      if (n >= caps[k]) continue;
      let y = e.y, rx = 0, ry = e.rot, rz = 0, s = e.v, zz = e.z;
      if (k === K.GRAPE || k === K.PRETZEL) {
        y += Math.sin(t * 3 + e.rot) * 0.08;
        ry = k === K.GRAPE ? t * 1.8 + e.rot : Math.sin(t * 2.2 + e.rot) * 0.7;
        s = k === K.GRAPE ? 1 : 1.05;
        if (e.hit) { const a = Math.min(1, e.t / 0.18); y += a * 0.7; s *= (1 + a * 0.5) * (1 - a) * (1 - a); } // cueillie : petit « pop » qui disparaît
        if (k === K.PRETZEL && gc < 3) setIM(glowIM, gc++, e.x, y, zz - 0.3, 0, 0, 0, s, s, s);
      } else if (k === K.PILE) { ry = 0; s = 1; }
      else if (k === K.MUD) { y = 0.015; s = 1; }
      else if (e.hit) { // obstacle percuté : il bascule un peu
        const a = Math.min(1, e.t * 6);
        rx = -a * 0.35; rz = (e.rot > 3.14 ? 1 : -1) * a * 0.2;
      }
      setIM(IM[k], n, e.x, y, zz, rx, ry, rz, s, s, s);
      cnt[k] = n + 1;
      if (k !== K.MUD && sc < 96) {
        const sw = SH[k][0] * s, sd = SH[k][1] * s;
        const fade = k >= K.GRAPE ? 0.8 : 1;
        setIM(shadowIM, sc++, e.x, 0.02, zz, 0, 0, 0, sw * fade, 1, sd * fade);
      }
    }
    for (let k = 0; k < 6; k++) flush(IM[k], cnt[k]);
    flush(shadowIM, sc); flush(glowIM, gc);
  }

  function updateQuad(dt) {
    const tx = (sim.lane - 1) * CFG.LANE_W, dx = tx - sim.x;
    const kk = 1 - Math.exp(-dt * 10);
    lean += (Math.max(-0.3, Math.min(0.3, -dx * 0.2)) - lean) * kk;
    const yaw = Math.max(-0.25, Math.min(0.25, -dx * 0.12));
    const pt = sim.air ? Math.max(-0.22, Math.min(0.2, sim.vy * 0.024)) : 0;
    pitch += (pt - pitch) * (1 - Math.exp(-dt * 12));
    const sp = Math.min(1, sim.speed / 15);
    let bob = sim.air ? 0 : (Math.sin(t * 23) * 0.012 + Math.sin(t * 37 + 1) * 0.008) * sp;
    let rz = lean, rx = pitch, y = sim.y + bob, z = 0;
    if (sim.bump > 0) rz += Math.sin(sim.bump * 40) * 0.07;
    if (sim.slowT > 0) rz += Math.sin(t * 31) * 0.035 * (sim.slowT / CFG.MUD_TIME);
    if (sim.mode === 'dead') {
      const a = Math.min(1, sim.deadT * 5), ea = 1 - (1 - a) * (1 - a);
      rx = -0.32 * ea; rz += 0.18 * ea * (sim.crashKind === K.ROCK ? -1 : 1);
      y = sim.y + Math.sin(Math.min(1, sim.deadT * 3.5) * Math.PI) * 0.35;
      z = 0.4 * ea;
    }
    quadRoot.position.set(sim.x, y, z);
    pivot.rotation.set(rx, yaw, rz);
    wheelA -= sim.dz / 0.34;
    for (let i = 0; i < 4; i++) wheels[i].rotation.x = wheelA;
    const sh = 1 - Math.min(0.5, sim.y * 0.28);
    qShadow.position.set(sim.x, 0.022, z + 0.05);
    qShadow.scale.set(1.9 * sh, 1, 2.7 * sh);
    matQShadow.opacity = 1 - Math.min(0.55, sim.y * 0.35);
  }

  function updateParticles(dt) {
    for (let i = 0; i < sim.fxN; i++) { const f = sim.fx[i]; burst(f.type, f.x, f.y, f.z); }
    if (sim.mode !== 'dead' && !sim.air && sim.speed > 1) {
      dustAcc += dt * (lowEnd ? 16 : 24) * Math.min(1.6, sim.speed / 14);
      while (dustAcc >= 1) {
        dustAcc -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        emit(sim.x + side * 0.6 + rs() * 0.2, 0.12, 0.78, side * Math.random() * 0.7, 0.5 + Math.random() * 0.9, 0.4 + Math.random(), 0.6 + Math.random() * 0.35, 0.32, 1.35, 0.3, -0.4, 0.92, Math.random() < 0.5 ? PC.dust : PC.dust2);
      }
    }
    if (sim.bonusT > 0) {
      sparkAcc += dt * 16;
      while (sparkAcc >= 1) { sparkAcc -= 1; emit(sim.x + rs() * 1.2, sim.y + 0.6 + Math.random() * 1.4, 0.4 + rs(), rs() * 0.6, 0.8, 1.5, 0.6, 0.16, 0.02, 1, 0, 0.3, PC.gold); }
    }
    const dz = sim.dz;
    for (let i = 0; i < PN; i++) {
      if (pLife[i] <= 0) { pSz[i] = 0; pAl[i] = 0; continue; }
      pLife[i] -= dt;
      const i3 = i * 3;
      pVel[i3 + 1] -= pG[i] * dt;
      const drag = 1 - Math.min(0.9, dt * 1.8);
      pVel[i3] *= drag; pVel[i3 + 2] *= drag;
      pPos[i3] += pVel[i3] * dt; pPos[i3 + 1] += pVel[i3 + 1] * dt; pPos[i3 + 2] += pVel[i3 + 2] * dt + dz * pAt[i];
      if (pPos[i3 + 1] < 0.03) { pPos[i3 + 1] = 0.03; pVel[i3 + 1] *= -0.25; }
      const a = 1 - Math.max(0, pLife[i]) / pMax[i];
      pSz[i] = pLife[i] > 0 ? pS0[i] + (pS1[i] - pS0[i]) * a : 0;
      pAl[i] = pA0[i] * Math.min(1, a * 8) * (1 - a) * (1 - a);
    }
    aPos.needsUpdate = true; aCol.needsUpdate = true; aAl.needsUpdate = true; aSz.needsUpdate = true;
  }

  function updateStorks(dt) {
    if (!flock.on) {
      flock.wait -= dt;
      if (flock.wait <= 0) {
        flock.on = true; flock.dir = Math.random() < 0.5 ? 1 : -1;
        flock.x = -flock.dir * 110; flock.y = 13 + Math.random() * 6; flock.z = -(58 + Math.random() * 30);
      }
    }
    for (let i = 0; i < storks.length; i++) {
      const st = storks[i];
      st.g.visible = flock.on;
      if (!flock.on) continue;
      st.glide -= dt;
      if (st.glide < -2.6) st.glide = 1.2 + Math.random() * 2;
      const flap = st.glide > 0 ? 0.08 : Math.sin(st.phase) * 0.55;
      if (st.glide <= 0) st.phase += dt * 5.2;
      st.wr.rotation.z = flap; st.wl.rotation.z = -flap;
      st.g.position.set(flock.x - flock.dir * i * 7, flock.y + i * 1.6 + Math.sin(t * 0.8 + i) * 0.6, flock.z - i * 5);
      st.g.rotation.set(0, flock.dir > 0 ? -Math.PI / 2 : Math.PI / 2, Math.sin(t * 0.8 + i) * 0.06);
    }
    if (flock.on) {
      flock.x += flock.dir * 8.5 * dt;
      if (Math.abs(flock.x) > 125) { flock.on = false; flock.wait = 6 + Math.random() * 10; }
    }
  }

  function frame(dt) {
    t += dt;
    shake *= Math.exp(-dt * 6);
    vines.position.z = sim.dist % VINE_PERIOD;
    dirt.offset.y = (sim.dist / TEX_LEN) % 1;
    updateProps(sim.dz);
    updateEntities();
    updateQuad(dt);
    updateParticles(dt);
    updateStorks(dt);
    placeCamera(dt);
    renderer.render(scene, camera);
  }
  function render() { renderer.render(scene, camera); }

  // compilation des shaders (asynchrone si possible), tout visible pour que rien ne compile en pleine partie
  for (const im of IM) { im.count = 1; im.visible = true; }
  shadowIM.count = 1; glowIM.count = 1;
  placeCamera(0);
  try {
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (_) { /* compile au premier rendu */ }
  updateProps(0); updateEntities(); updateQuad(0.016); updateStorks(0); placeCamera(0);

  function dispose() {
    scene.traverse((ob) => { if (ob.isInstancedMesh) ob.dispose(); });
    for (const x of keep) x.dispose && x.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (_) { /* rien */ }
  }

  return { frame, render, resize, dispose, renderer, scene, camera };
}

// ---------------------------------------------------------------- textures procédurales
function drawDirt(g, w, h) {
  const R = rng(42);
  const px = (m) => ((m + TRACK_W / 2) / TRACK_W) * w;
  g.fillStyle = '#b48a5c'; g.fillRect(0, 0, w, h);
  const wrap = (fn) => { fn(0); fn(-h); fn(h); };
  for (let i = 0; i < 1100; i++) {
    const x = R() * w, y = R() * h, r = 2 + R() * 10, dark = R() < 0.55, a = 0.04 + R() * 0.1;
    g.fillStyle = dark ? `rgba(105,74,45,${a})` : `rgba(226,196,146,${a})`;
    wrap((o) => { g.beginPath(); g.ellipse(x, y + o, r, r * (0.6 + R() * 0.6), 0, 0, 6.283); g.fill(); });
  }
  // ornières de chaque voie
  for (const lane of [-1, 0, 1]) {
    for (const side of [-1, 1]) {
      const cx = px(lane * 2.3 + side * 0.46);
      for (let y = 0; y < h; y += 2) {
        const wob = Math.sin((y / h) * Math.PI * 4 + lane * 1.7 + side) * 2.2 + Math.sin((y / h) * Math.PI * 10 + lane) * 0.8;
        g.fillStyle = 'rgba(92,62,38,0.2)'; g.fillRect(cx - 7 + wob, y, 14, 2);
        g.fillStyle = 'rgba(70,47,30,0.16)'; g.fillRect(cx - 3 + wob, y, 6, 2);
      }
    }
    // dos d'âne plus clair entre les ornières
    const c = px(lane * 2.3);
    const gr = g.createLinearGradient(c - 9, 0, c + 9, 0);
    gr.addColorStop(0, 'rgba(230,200,150,0)'); gr.addColorStop(0.5, 'rgba(230,200,150,0.18)'); gr.addColorStop(1, 'rgba(230,200,150,0)');
    g.fillStyle = gr; g.fillRect(c - 9, 0, 18, h);
  }
  // touffes entre les voies
  const tuft = (x, y, s, a) => {
    g.strokeStyle = `rgba(78,108,48,${a})`; g.lineWidth = 1.4;
    for (let k = -1; k <= 1; k++) {
      wrap((o) => { g.beginPath(); g.moveTo(x + k * 1.5, y + o); g.lineTo(x + k * 3 + (R() - 0.5) * 2, y + o - s); g.stroke(); });
    }
  };
  for (const b of [-1.15, 1.15]) for (let k = 0; k < 46; k++) tuft(px(b) + (R() - 0.5) * 12, R() * h, 4 + R() * 5, 0.35 + R() * 0.35);
  // bas-côtés herbeux
  for (const sgn of [-1, 1]) {
    const edge = px(sgn * 3.5), outer = sgn < 0 ? 0 : w;
    const gr = g.createLinearGradient(edge, 0, outer, 0);
    gr.addColorStop(0, 'rgba(82,106,56,0)'); gr.addColorStop(0.45, 'rgba(82,106,56,0.75)'); gr.addColorStop(1, 'rgba(68,90,51,1)');
    g.fillStyle = gr; g.fillRect(Math.min(edge, outer), 0, Math.abs(outer - edge), h);
    for (let k = 0; k < 150; k++) tuft(edge + sgn * R() * Math.abs(outer - edge) * 1.05, R() * h, 4 + R() * 7, 0.5 + R() * 0.4);
  }
  // cailloux
  for (let k = 0; k < 170; k++) {
    const x = px((R() - 0.5) * 6.8), y = R() * h, r = 0.8 + R() * 2.2;
    wrap((o) => {
      g.fillStyle = 'rgba(70,48,30,0.35)'; g.beginPath(); g.ellipse(x + 0.8, y + o + 0.8, r, r * 0.7, 0, 0, 6.283); g.fill();
      g.fillStyle = R() < 0.5 ? '#d9c4a2' : '#c2ab88'; g.beginPath(); g.ellipse(x, y + o, r, r * 0.7, 0, 0, 6.283); g.fill();
    });
  }
}

function drawTimber(g, w, h) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  const R = rng(7);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.04})`; g.fillRect(R() * w, R() * h, 2, 2); }
  // fenêtres + volets
  const win = (x, y, ww, hh) => {
    g.fillStyle = '#2d3a44'; g.fillRect(x, y, ww, hh);
    g.fillStyle = '#ffd98a'; g.globalAlpha = 0.35; g.fillRect(x + 2, y + 2, ww - 4, hh - 4); g.globalAlpha = 1;
    g.fillStyle = '#3d5f45'; g.fillRect(x - 7, y, 6, hh); g.fillRect(x + ww + 1, y, 6, hh);
  };
  win(18, 18, 16, 22); win(w - 34, 18, 16, 22); win(w / 2 - 8, 76, 16, 22);
  g.strokeStyle = '#4f3626'; g.lineCap = 'square';
  g.lineWidth = 7; g.strokeRect(3.5, 3.5, w - 7, h - 7);
  g.beginPath(); g.moveTo(0, h * 0.5); g.lineTo(w, h * 0.5); g.stroke();
  g.lineWidth = 5;
  for (const x of [w * 0.33, w * 0.67]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  g.beginPath();
  g.moveTo(4, h - 4); g.lineTo(w * 0.33, h * 0.5); g.moveTo(w * 0.33, h - 4); g.lineTo(4, h * 0.5);
  g.moveTo(w - 4, h - 4); g.lineTo(w * 0.67, h * 0.5); g.moveTo(w * 0.67, h - 4); g.lineTo(w - 4, h * 0.5);
  g.moveTo(w * 0.33, h * 0.5); g.lineTo(w * 0.5, 4); g.lineTo(w * 0.67, h * 0.5);
  g.stroke();
}
