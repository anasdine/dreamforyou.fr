// Dream Rider — logique pure du jeu (aucune dépendance, aucun rendu).
// Unités : mètres et secondes. Le quad reste en z = 0, le monde défile vers +z.
// Tous les réglages de difficulté sont ici, en tête de fichier.

export const CFG = {
  LANE_W: 2.3,           // largeur d'une voie (m)
  SPEED_START: 13,       // vitesse au départ (m/s, ~47 km/h)
  SPEED_MAX: 31,         // plafond (m/s)
  SPEED_TAU: 70,         // montée douce : 63 % de l'écart atteint après 70 s, 86 % après 140 s
  ATTRACT_SPEED: 7,      // vitesse de l'écran d'accueil
  JUMP_V: 8.4,           // impulsion du saut (m/s)
  GRAVITY: 25,           // -> sommet ~1,41 m, ~0,67 s en l'air
  DROP_V: 13,            // descente rapide (glisser vers le bas / flèche bas)
  JUMP_BUFFER: 0.15,     // un saut demandé juste avant l'atterrissage est gardé (s)
  LANE_RESP: 15,         // réactivité du changement de voie (1/s)
  MUD_SLOW: 0.55,        // la boue ramène la vitesse à 55 %…
  MUD_TIME: 1.3,         // …puis elle revient en 1,3 s
  BONUS_TIME: 7,         // bretzel : points ×2 pendant 7 s
  BONUS_MIN: 20,         // un bretzel apparaît toutes les 20 à 34 s
  BONUS_MAX: 34,
  GRAPE_PTS: 10,         // points par grappe
  DIST_PTS: 0.5,         // points par mètre parcouru
  SPAWN_Z: -110,         // distance d'apparition des rangées (m, dans le brouillard)
  DESPAWN_Z: 9,          // derrière la caméra
  GRACE: 46,             // le premier obstacle est à 46 m au départ (~3,5 s)
  GAP_MIN: 13,           // écart mini entre deux rangées (m)
  GAP_REACT: 0.95,       // … ou vitesse × 0,95 s si c'est plus grand
  GAP_RAND: 9,           // + aléa (m), réduit de moitié à vitesse max
  GRAPE_Y: 0.95,         // hauteur des grappes au sol
};

// Types d'objets
export const K = { BARREL: 0, PILE: 1, ROCK: 2, MUD: 3, GRAPE: 4, PRETZEL: 5 };
// Événements pour les effets visuels
export const FX = { GRAPE: 1, PRETZEL: 2, MUD: 3, CRASH: 4, LAND: 5, BUMP: 6, JUMP: 7 };

// Boîtes de collision par type d'obstacle (demi-largeur, demi-profondeur, hauteur)
const HW = [0.44, 0.96, 0.58, 0.9];
const HD = [0.44, 0.5, 0.5, 0.95];
const HT = [1.08, 99, 0.74, 0.12]; // 99 : pile de fûts, impossible à sauter
const Q_HW = 0.5, Q_HD = 0.82;     // quad
const MAX_ENTS = 80, MAX_FX = 24;

const rand = (a, b) => a + Math.random() * (b - a);
const randLane = () => (Math.random() * 3) | 0;

export function createSim() {
  const ents = new Array(MAX_ENTS);
  for (let i = 0; i < MAX_ENTS; i++) ents[i] = { on: false, kind: 0, x: 0, y: 0, z: 0, rot: 0, v: 1, hit: false, t: 0 };
  const fx = new Array(MAX_FX);
  for (let i = 0; i < MAX_FX; i++) fx[i] = { type: 0, x: 0, y: 0, z: 0 };
  const W = new Float32Array(8);

  const s = {
    mode: 'attract', // 'attract' | 'run' | 'dead'
    time: 0, dist: 0, dz: 0, speed: CFG.ATTRACT_SPEED,
    pts: 0, score: 0, grapes: 0,
    lane: 1, x: 0, y: 0, vy: 0, air: false, jumpBuf: 0,
    slowT: 0, bonusT: 0, bump: 0, deadT: 0, crashKind: -1,
    toSpawn: 0, nextBonus: 0, lastPattern: -1, autoT: 3,
    ents, fx, fxN: 0, invincible: false, jumps: 0, laneChanges: 0,
    reset, step, left, right, jump, drop,
  };

  function emit(type, x, y, z) {
    if (s.fxN >= MAX_FX) return;
    const f = fx[s.fxN++]; f.type = type; f.x = x; f.y = y; f.z = z;
  }

  function reset(mode) {
    for (let i = 0; i < MAX_ENTS; i++) ents[i].on = false;
    s.mode = mode; s.time = 0; s.dz = 0;
    s.speed = mode === 'run' ? CFG.SPEED_START : CFG.ATTRACT_SPEED;
    s.pts = 0; s.score = 0; s.grapes = 0; s.lane = 1; s.y = 0; s.vy = 0; s.air = false;
    s.jumpBuf = 0; s.slowT = 0; s.bonusT = 0; s.bump = 0; s.deadT = 0; s.crashKind = -1;
    s.nextBonus = rand(CFG.BONUS_MIN, CFG.BONUS_MAX) * 0.6;
    s.lastPattern = -1; s.autoT = 3; s.fxN = 0; s.jumps = 0; s.laneChanges = 0;
    s.toSpawn = 0;
    if (mode === 'run') {
      // la route est déjà garnie au départ : rangées de -GRACE jusqu'au point d'apparition
      let z = -CFG.GRACE;
      while (z > CFG.SPAWN_Z) z -= spawnRow(z);
      s.toSpawn = CFG.SPAWN_Z - z;
    }
  }

  // ---- commandes
  function left() { move(-1); }
  function right() { move(1); }
  function move(d) {
    if (s.mode !== 'run') return;
    const n = s.lane + d;
    if (n < 0 || n > 2) { s.bump = 0.25; emit(FX.BUMP, s.x, 0, 0); return; }
    s.lane = n; s.laneChanges++;
  }
  function doJump() { s.vy = CFG.JUMP_V; s.air = true; s.jumpBuf = 0; s.jumps++; emit(FX.JUMP, s.x, 0, 0); }
  function jump() {
    if (s.mode !== 'run') return;
    if (!s.air) doJump(); else s.jumpBuf = CFG.JUMP_BUFFER;
  }
  function drop() {
    if (s.mode !== 'run' || !s.air) return;
    if (s.vy > -CFG.DROP_V) s.vy = -CFG.DROP_V;
  }

  // ---- apparition des rangées
  function add(kind, lane, z, y) {
    for (let i = 0; i < MAX_ENTS; i++) {
      const e = ents[i];
      if (e.on) continue;
      e.on = true; e.kind = kind; e.x = (lane - 1) * CFG.LANE_W; e.z = z; e.y = y;
      e.rot = Math.random() * 6.2832; e.v = rand(0.92, 1.12); e.hit = false; e.t = 0;
      return e;
    }
    return null;
  }
  function grapes(lane, z, n, step) {
    const z0 = z + (n - 1) * step * 0.5;
    for (let k = 0; k < n; k++) add(K.GRAPE, lane, z0 - k * step, CFG.GRAPE_Y);
  }
  function obstacle(allowPile, allowMud) {
    const r = Math.random();
    if (allowPile && r < 0.18) return K.PILE;
    if (allowMud && r > 0.8) return K.MUD;
    return Math.random() < 0.5 ? K.BARREL : K.ROCK;
  }
  function otherLane(a) { return (a + 1 + ((Math.random() * 2) | 0)) % 3; }

  // place une rangée en z et renvoie l'écart jusqu'à la suivante
  function spawnRow(z) {
    const d = Math.min(1, Math.max(0, (s.speed - CFG.SPEED_START) / (CFG.SPEED_MAX - CFG.SPEED_START)));
    let gap = Math.max(CFG.GAP_MIN, s.speed * CFG.GAP_REACT) + Math.random() * CFG.GAP_RAND * (1 - 0.5 * d);

    if (s.time >= s.nextBonus && s.bonusT <= 0) {
      // bretzel : bonus ×2, avec un obstacle dans une autre voie
      const L = randLane();
      add(K.PRETZEL, L, z, 1.05);
      add(Math.random() < 0.5 ? K.BARREL : K.ROCK, otherLane(L), z, 0);
      s.nextBonus = s.time + rand(CFG.BONUS_MIN, CFG.BONUS_MAX);
      return gap;
    }

    W[0] = s.time === 0 && z > -50 ? 99 : 3 - d; // la toute première rangée : un seul obstacle
    W[1] = 1.4 + 2 * d;                    // deux obstacles
    W[2] = s.time > 10 ? 0.8 + d : 0;      // mur bas : il faut sauter
    W[3] = 1.2;                            // pile de fûts
    W[4] = 1.6 - 0.6 * d;                  // serpent de grappes
    W[5] = 0.8;                            // boue
    W[6] = d > 0.3 ? 1.6 * d : 0;          // slalom
    if (s.lastPattern >= 0) W[s.lastPattern] *= 0.3;
    let sum = 0; for (let i = 0; i < 7; i++) sum += W[i];
    let r = Math.random() * sum, p = 0;
    for (; p < 6; p++) { r -= W[p]; if (r <= 0) break; }
    s.lastPattern = p;

    switch (p) {
      case 0: {
        const L = randLane();
        add(obstacle(false, true), L, z, 0);
        if (Math.random() < 0.65) grapes(otherLane(L), z, 4, 2.6);
        break;
      }
      case 1: {
        const free = randLane();
        let piles = 0;
        for (let l = 0; l < 3; l++) {
          if (l === free) continue;
          let k = obstacle(piles === 0, true);
          if (k === K.PILE) piles++;
          add(k, l, z, 0);
        }
        if (Math.random() < 0.6) grapes(free, z, 3, 2.6);
        break;
      }
      case 2: {
        for (let l = 0; l < 3; l++) {
          const r2 = Math.random();
          add(r2 < 0.45 ? K.ROCK : r2 < 0.8 ? K.BARREL : K.MUD, l, z, 0);
        }
        const L = randLane();
        add(K.GRAPE, L, z + 2.2, 1.55);
        add(K.GRAPE, L, z, 2.05);
        add(K.GRAPE, L, z - 2.2, 1.55);
        break;
      }
      case 3: {
        const L = randLane();
        add(K.PILE, L, z, 0);
        const L2 = otherLane(L);
        if (Math.random() < 0.5) add(Math.random() < 0.5 ? K.ROCK : K.BARREL, L2, z, 0);
        if (Math.random() < 0.6) grapes(3 - L - L2, z, 4, 2.6);
        break;
      }
      case 4: {
        let L = randLane();
        for (let k = 0; k < 7; k++) {
          add(K.GRAPE, L, z - k * 2.8, CFG.GRAPE_Y);
          if (k % 2 === 1 && Math.random() < 0.7) L = Math.max(0, Math.min(2, L + (Math.random() < 0.5 ? -1 : 1)));
        }
        gap += 10;
        break;
      }
      case 5: {
        const a = Math.random() < 0.5 ? 0 : 1;
        add(K.MUD, a, z, 0); add(K.MUD, a + 1, z, 0);
        if (Math.random() < 0.7) grapes(a === 0 ? 2 : 0, z, 3, 2.6);
        break;
      }
      case 6: {
        const sep = Math.max(10, s.speed * 0.75);
        const A = randLane();
        const B = A === 1 ? (Math.random() < 0.5 ? 0 : 2) : 1;
        for (let l = 0; l < 3; l++) if (l !== A) add(Math.random() < 0.5 ? K.ROCK : K.BARREL, l, z, 0);
        for (let l = 0; l < 3; l++) if (l !== B) add(Math.random() < 0.5 ? K.ROCK : K.BARREL, l, z - sep, 0);
        add(K.GRAPE, A, z, CFG.GRAPE_Y);
        add(K.GRAPE, B, z - sep, CFG.GRAPE_Y);
        gap += sep;
        break;
      }
    }
    return gap;
  }

  function crash(e) {
    s.mode = 'dead'; s.deadT = 0; s.crashKind = e.kind; s.speed = 0; s.dz = 0;
    e.hit = true; e.t = 0;
    // si on l'a pris de face, on recolle l'obstacle contre le pare-chocs
    if (Math.abs(s.x - e.x) < 0.7 && e.z > -1.6 && e.z < 0.4) e.z = -(Q_HD + HD[e.kind]) + 0.08;
    emit(FX.CRASH, (s.x + e.x) * 0.5, 0.7, -Q_HD);
  }

  // ---- pas de simulation (dt borné par l'appelant)
  function step(dt) {
    s.fxN = 0;
    if (s.mode === 'run') {
      s.time += dt;
      const base = CFG.SPEED_START + (CFG.SPEED_MAX - CFG.SPEED_START) * (1 - Math.exp(-s.time / CFG.SPEED_TAU));
      if (s.slowT > 0) s.slowT = Math.max(0, s.slowT - dt);
      s.speed = base * (1 - (1 - CFG.MUD_SLOW) * (s.slowT / CFG.MUD_TIME));
      if (s.bonusT > 0) s.bonusT = Math.max(0, s.bonusT - dt);
    } else if (s.mode === 'dead') {
      s.deadT += dt; s.speed = 0;
    } else {
      s.time += dt; s.speed = CFG.ATTRACT_SPEED;
      s.autoT -= dt;
      if (s.autoT <= 0) { // l'écran d'accueil se balade tout seul
        s.autoT = rand(2.5, 5);
        s.lane = s.lane === 1 ? (Math.random() < 0.5 ? 0 : 2) : 1;
      }
    }

    const dz = s.speed * dt;
    s.dz = dz; s.dist += dz;

    if (s.mode !== 'dead') {
      const tx = (s.lane - 1) * CFG.LANE_W;
      s.x += (tx - s.x) * (1 - Math.exp(-dt * CFG.LANE_RESP));
    }
    if (s.air) {
      s.vy -= CFG.GRAVITY * dt; s.y += s.vy * dt;
      if (s.y <= 0) {
        s.y = 0; s.vy = 0; s.air = false;
        emit(FX.LAND, s.x, 0, 0);
        if (s.jumpBuf > 0 && s.mode === 'run') doJump();
      }
    }
    if (s.jumpBuf > 0) s.jumpBuf -= dt;
    if (s.bump > 0) s.bump = Math.max(0, s.bump - dt);

    const mult = s.bonusT > 0 ? 2 : 1;
    if (s.mode === 'run') s.pts += dz * CFG.DIST_PTS * mult;

    for (let i = 0; i < MAX_ENTS; i++) {
      const e = ents[i];
      if (!e.on) continue;
      const z0 = e.z;
      e.z += dz;
      if (e.hit) e.t += dt;
      if (e.kind >= K.GRAPE) {
        if (e.hit) { if (e.t > 0.2) e.on = false; continue; }
        if (e.z > CFG.DESPAWN_Z) { e.on = false; continue; }
        if (s.mode !== 'run') continue;
        if (z0 < 1.0 && e.z > -1.0 && Math.abs(s.x - e.x) < 1.0 && Math.abs(s.y + 0.7 - e.y) < 1.05) {
          e.hit = true; e.t = 0;
          if (e.kind === K.GRAPE) {
            s.pts += CFG.GRAPE_PTS * mult; s.grapes++;
            emit(FX.GRAPE, e.x, e.y, e.z);
          } else {
            s.bonusT = CFG.BONUS_TIME;
            emit(FX.PRETZEL, e.x, e.y, e.z);
          }
        }
        continue;
      }
      if (e.z > CFG.DESPAWN_Z) { e.on = false; continue; }
      if (s.mode !== 'run' || e.hit) continue;
      const k = e.kind;
      if (e.z + HD[k] > -Q_HD && z0 - HD[k] < Q_HD && Math.abs(s.x - e.x) < Q_HW + HW[k] && s.y < HT[k]) {
        if (k === K.MUD) {
          e.hit = true; e.t = 0; s.slowT = CFG.MUD_TIME;
          emit(FX.MUD, s.x, 0, 0);
        } else if (!s.invincible) {
          crash(e);
          break;
        }
      }
    }

    if (s.mode === 'run') {
      s.toSpawn -= dz;
      while (s.toSpawn <= 0) s.toSpawn += spawnRow(CFG.SPAWN_Z + s.toSpawn); // garde l'écart exact
    }
    s.score = Math.floor(s.pts);
  }

  reset('attract');
  return s;
}
