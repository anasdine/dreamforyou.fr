/* Dream For You — le film des expériences (v3d). Section 03 : un plan par expérience (quad, hélicoptère, cheval, spa,
   vélo, dégustation), piloté par le défilement. Chaque fiche (.exp-item) fait avancer SON plan ; entre deux fiches,
   coupe franche (jamais de fondu, jamais deux images superposées).
   Même format de film que le vol (montage-scenes.py) : H.264 par groupes de 8 images, paquets .mp4 + index .json,
   décodé image par image par WebCodecs, gardé en ImageBitmap autour de la position. La toile ne montre que des
   images entières : nette à chaque instant du défilement.
   Préchargement : à l'approche de la section, l'index et le 1er paquet ; pendant un plan, le début du plan suivant
   (et la fin du précédent) passent avant le reste.
   Repli statique (une image fixe par plan, changée en coupe) : petite machine
   (≤ 2 Go ou ≤ 2 cœurs, économie de données), pas de WebCodecs, ou rien de décodé en 5 s.
   Événement `dfy:scene` (detail.i) à chaque changement de plan : site.v3d.js met à jour le compteur et les points.
   API : window.DFYScenes = { stats(), reset(), info() }. */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement;
  var sec = doc.getElementById('experiences'), cv = doc.getElementById('expFilm');
  if (!sec || !cv) { window.DFYScenes = {}; return; }
  var items = [].slice.call(sec.querySelectorAll('.exp-item'));
  var ctx = cv.getContext('2d', { alpha: false });
  var DIR = 'media/scenes-v3d/', SHOTS = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'];

  var mm = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
  var nav = navigator, conn = nav.connection || {};
  var weak = (nav.deviceMemory && nav.deviceMemory <= 2) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) || conn.saveData === true;
  var canVideo = typeof createImageBitmap === 'function' && 'VideoDecoder' in window && 'EncodedVideoChunk' in window;
  var mode = (weak || !canVideo || window.DFY_FILM === 'webp' || window.DFY_SCENES === 'still') ? 'still' : 'video';
  html.classList.toggle('exp-still', mode === 'still');

  /* ---------------------------------------------------------------- affiches (repli, et image d'attente nette) */
  var posters = SHOTS.map(function (s) { var i = new Image(); i.decoding = 'async'; i._s = s; return i; });
  function poster(i) { var im = posters[i]; if (!im.src) im.src = DIR + 'a-' + SHOTS[i] + '.jpg'; return im; }
  posters.forEach(function (im) { im.onload = function () { dirty = true; kick(); }; });

  /* ---------------------------------------------------------------- état */
  var N = 0, RANGES = null, setName = null, gen = 0;
  var bmp = new Map(), MAXBMP = 35, center = 0, dir = 1, speed = 0, hz = 60;
  var wLo = 0, wHi = 0, keepLo = -1, keepHi = -1;     // fenêtre utile ; début du plan suivant gardé en mémoire
  var shot = 0, shotF = 0, shown = -1, lastKey = '', dirty = true, near = false, onScreen = false;
  var S;
  function resetStats() { S = { t0: performance.now(), ticks: 0, late: 0, maxDt: 0, drawn: 0, miss: 0, gap: 0, poster: 0, cuts: 0, jobs: 0, frames: 0, jobMs: 0 }; }
  resetStats();
  var startT = 0;

  function small() { return innerWidth < 900; }
  function pickSet() { var w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight; return w / h < 1.3 ? 'm' : 'l'; }

  /* ---------------------------------------------------------------- paquets (même format que le vol) */
  var K = null, V = null;
  function loadSet() {
    if (mode !== 'video') return;
    var s = pickSet();
    if (s === setName) return;
    setName = s; gen++;
    bmp.forEach(function (b) { b.close(); }); bmp.clear();
    closeDec(); V = null;
    var k = K = { parts: [], off: null, size: null, partOf: [], inflight: 0, ok: false };
    fetch(DIR + 's-' + s + '.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (m) {
      if (k !== K) return;
      k.size = m.sizes; k.off = m.offs; N = m.n; RANGES = m.shots;
      m.parts.forEach(function (p, j) { for (var i = p[1]; i < p[1] + p[2]; i++) k.partOf[i] = j; k.parts.push({ file: p[0], buf: null, state: 0, tries: 0 }); });
      var raw = atob(m.desc), desc = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) desc[i] = raw.charCodeAt(i);
      var v = { gop: m.gop, busy: 0, job: 0, jobGen: 0, pend: 0, errs: 0, dec: null, js: 1, jk: m.gop, jn: 0, jt: 0, mpf: 0, meas: 0,
        cfg: { codec: m.codec, codedWidth: m.w, codedHeight: m.h, description: desc, optimizeForLatency: true } };
      return VideoDecoder.isConfigSupported(v.cfg).then(function (r) {
        if (k !== K) return;
        if (!r || !r.supported) throw 0;
        V = v; MAXBMP = 5 * v.gop + 3; k.ok = true;   // v3e : 4 groupes autour de la position + le 1er du plan suivant (voir want)
         locate(); pump(); kick();
      });
    }).catch(function () { if (k === K) toStill(); });
  }
  function toStill() {
    if (mode === 'still') return;
    mode = 'still'; html.classList.add('exp-still'); closeDec(); V = null; K = null; gen++;
    bmp.forEach(function (b) { b.close(); }); bmp.clear(); dirty = true; kick();
  }
  function got(i) { var k = K; return k && k.ok && i >= 0 && i < N && k.parts[k.partOf[i]].state === 2; }
  function bytes(i) { var k = K; return new Uint8Array(k.parts[k.partOf[i]].buf, k.off[i], k.size[i]); }
  function shotStart(j) { return RANGES[Math.max(0, Math.min(RANGES.length - 1, j))][0]; }
  function pump() {
    var k = K;
    if (!k || !k.ok || !near) return;
    while (k.inflight < 2) {
      var c = Math.max(0, Math.min(N - 1, center)), a = Math.max(0, Math.min(N - 1, c + dir * 16));
      // d'abord la position, puis devant, puis le début du plan suivant et la fin du précédent (coupe sans attente)
      var first = [k.partOf[c], k.partOf[a], k.partOf[shotStart(shot + 1)], k.partOf[Math.max(0, shotStart(shot) - 1)]], j = -1;
      for (var q = 0; q < first.length && j < 0; q++) if (k.parts[first[q]].state === 0) j = first[q];
      for (var r = 0; r < k.parts.length && j < 0; r++) if (k.parts[r].state === 0) j = r;
      if (j < 0) return;
      (function (p) {
        p.state = 1; k.inflight++;
        fetch(DIR + p.file).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (buf) {
          k.inflight--; if (k !== K) return; p.buf = buf; p.state = 2; want(); pump();
        }, function () {
          k.inflight--; if (k !== K) return;
          if (++p.tries < 4) setTimeout(function () { p.state = 0; pump(); }, 800 * p.tries); else if (!bmp.size) toStill();
        });
      })(k.parts[j]);
    }
  }

  /* ---------------------------------------------------------------- décodage (WebCodecs) */
  function closeDec() { if (V && V.dec) { try { V.dec.close(); } catch (e) {} V.dec = null; } }
  function decErr(v) {
    if (v !== V) return;
    v.busy = 0; v.pend = 0; closeDec();
    if (++v.errs > 3) toStill(); else setTimeout(want, 80);
  }
  function keepI(v, i) { var r = i % v.gop; return r < v.jk && r % v.js === 0; }
  function put(i, b) {
    var o = bmp.get(i); if (o && o !== b) o.close();
    bmp.set(i, b);
    while (bmp.size > MAXBMP) {
      var far = -1, fd = -1;
      bmp.forEach(function (x, j) {
        var kept = (j >= wLo && j <= wHi) || (j >= keepLo && j <= keepHi);
        var d = Math.abs(j - center) + (kept ? 0 : 1e6); if (d > fd) { fd = d; far = j; }
      });
      if (far < 0) break;
      bmp.get(far).close(); bmp.delete(far);
    }
    kick();                                          // la toile ne se repeint que si l'image à montrer change
  }
  function decoder(v) {
    if (v.dec && v.dec.state === 'configured') return v.dec;
    try {
      var d = new VideoDecoder({
        output: function (f) {
          var i = Math.round(f.timestamp / 1000), g = gen;
          if (v !== V || g !== v.jobGen || !keepI(v, i)) { f.close(); return; }
          v.pend++;
          createImageBitmap(f).then(function (b) {
            f.close(); v.pend--;
            if (v === V && g === gen) put(i, b); else b.close();
            if (!v.busy && !v.pend) done(v);
          }, function () { f.close(); decErr(v); });
        },
        error: function () { decErr(v); }
      });
      d.configure(v.cfg); v.dec = d; return d;
    } catch (e) { decErr(v); return null; }
  }
  function done(v) {
    if (v.jt && v.jn) {
      var ms = performance.now() - v.jt; S.jobs++; S.frames += v.jn; S.jobMs += ms;
      // v3e : même correctif que le vol (toute tâche sans saut mesure la machine ; les 2 premières ne comptent pas)
      var per1 = ms / v.jn;
      if (v.js === 1 && v.jk >= 2 && v.jn >= 2 && ++v.meas > 2) v.mpf = v.mpf ? v.mpf + (per1 - v.mpf) * (per1 < v.mpf ? 0.5 : 0.2) : per1;
    }
    v.jt = 0; want();
  }
  function lastOf(v, g, s, k) { var a = g * v.gop, n = Math.min(N - a, k); return a + Math.floor((n - 1) / s) * s; }
  function ready(v, g, s, k) { for (var i = g * v.gop, b = lastOf(v, g, s, k); i <= b; i += s) if (!bmp.has(i)) return false; return true; }
  function run(v, gs, s, k) {
    var d = decoder(v); if (!d) return;
    var job = ++v.job, n = 0;
    v.busy = job; v.jobGen = gen; v.js = s; v.jk = k; v.jn = 0; v.jt = performance.now();
    try {
      for (var q = 0; q < gs.length; q++) {
        var a = gs[q] * v.gop, b = lastOf(v, gs[q], s, k);
        for (var i = a; i <= b; i++, n++) d.decode(new EncodedVideoChunk({ type: i === a ? 'key' : 'delta', timestamp: i * 1000, data: bytes(i) }));
      }
      v.jn = n;
      d.flush().then(function () { if (v === V && v.busy === job) { v.busy = 0; if (!v.pend) done(v); } }, function () { if (v === V && v.busy === job) v.busy = 0; });
    } catch (e) { decErr(v); }
  }
  // Groupes à décoder : celui de la position, devant (selon la vitesse), un derrière à l'arrêt, puis le 1er groupe du
  // plan suivant (ou la fin du précédent en remontant) pour que la coupe montre tout de suite une image nette.
  function want() {
    var v = V;
    if (!v || v.busy || v.pend || !near || !RANGES) return;
    var G = v.gop, last = Math.floor((N - 1) / G), gc = Math.floor(Math.max(0, Math.min(N - 1, center)) / G);
    var per = speed / hz, s = per <= 1.35 ? 1 : per <= 2.7 ? 2 : per <= 4.2 ? 3 : per <= 6 ? 4 : G, k = G;
    var cost = speed * (v.mpf || 4);
    if (s === 2 && cost <= 500) s = 1;                // v3e : la machine suit largement, on décode tout (voir le vol)
    if (cost > 1000) k = Math.max(1, Math.floor(G * 1000 / cost));
    if (s >= k) { s = 1; k = 1; }
    var r = RANGES[shot], g0 = Math.floor(r[0] / G), g1 = Math.floor(r[1] / G);
    // v3e : en décodage complet, 2 groupes d'avance au plus. Avec le groupe gardé du plan suivant, la mémoire était trop
    // petite d'un groupe : les images étaient jetées puis redécodées sans fin, même à l'arrêt (≈ 2 000 images/s pour rien).
    var slowMove = s === 1 && k === G, ahead = slowMove ? 2 : Math.max(1, Math.min(4, Math.ceil(speed * 0.25 / G)));
    var list = [];
    for (var q = 0; q <= ahead; q++) { var g = gc + q * dir; if (g >= g0 && g <= g1) list.push(g); }
    if (slowMove && gc - dir >= g0 && gc - dir <= g1) list.push(gc - dir);
    wLo = Math.min.apply(null, list.concat([gc])) * G; wHi = (Math.max.apply(null, list.concat([gc])) + 1) * G - 1;
    var nx = dir > 0 ? (shot + 1 < RANGES.length ? Math.floor(RANGES[shot + 1][0] / G) : -1) : (shot > 0 ? Math.floor(RANGES[shot - 1][1] / G) : -1);
    if (nx >= 0) { keepLo = nx * G; keepHi = keepLo + G - 1; }
    for (var j = 0; j < list.length; j++) {
      var gg = list[j];
      if (gg < 0 || gg > last || ready(v, gg, s, k)) continue;
      if (!got(gg * G) || !got(lastOf(v, gg, s, k))) continue;
      run(v, [gg], s, k); return;
    }
    if (nx >= 0 && slowMove && !ready(v, nx, 1, G) && got(nx * G) && got(lastOf(v, nx, 1, G))) run(v, [nx], 1, G);
  }

  /* ---------------------------------------------------------------- toile */
  var cw = 0, chh = 0, qk = 1;
  function resize() {
    loadSet();
    var w = cv.clientWidth || 1, h = cv.clientHeight || 1, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var fh = setName === 'm' ? 1080 : 1080;
    var k = Math.max(1, Math.min(dpr, (fh * 1.25) / h)) * qk;
    cw = Math.max(2, Math.round(w * k)); chh = Math.max(2, Math.round(h * k));
    if (cv.width !== cw || cv.height !== chh) { cv.width = cw; cv.height = chh; lastKey = ''; }
    dirty = true; kick();
  }
  function cover(im) {
    var iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight, s = Math.max(cw / iw, chh / ih);
    ctx.drawImage(im, (cw - iw * s) / 2, (chh - ih * s) / 2, iw * s, ih * s);
  }
  function paint(still) {
    var key, im;
    if (mode === 'video' && RANGES) {
      var r = RANGES[shot], i0 = Math.round(r[0] + shotF * (r[1] - r[0])), a = -1;
      if (i0 !== center) { dir = i0 > center ? 1 : -1; center = i0; want(); pump(); }
      // l'image la plus proche, DANS le plan courant seulement (jamais une image d'un autre plan)
      for (var d = 0; d <= 12 && a < 0; d++) {
        if (i0 - d >= r[0] && bmp.has(i0 - d)) a = i0 - d; else if (i0 + d <= r[1] && bmp.has(i0 + d)) a = i0 + d;
      }
      if (a >= 0) { im = bmp.get(a); key = 'f' + a; if (a !== i0) { S.miss++; S.gap += Math.abs(a - i0); } }
    }
    if (!im) { im = poster(shot); if (!im.complete || !im.naturalWidth) return; key = 'p' + shot; }
    key += ':' + cw + 'x' + chh + (still ? 'h' : '');
    if (key === lastKey && !dirty) return;
    if (key.charAt(0) === 'p') S.poster++;
    lastKey = key; dirty = false; S.drawn++;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = still ? 'high' : 'medium';
    cover(im);
  }

  /* ---------------------------------------------------------------- défilement → plan et position */
  function readLine() { return innerHeight * (small() ? 0.7 : 0.5); }
  function locate() {
    var y = readLine(), n = items.length, j = 0, f = 0;
    var r0 = items[0].getBoundingClientRect(), rl = items[n - 1].getBoundingClientRect();
    if (y < r0.top) { j = 0; f = 0; }
    else if (y >= rl.bottom) { j = n - 1; f = 1; }
    else for (var i = 0; i < n; i++) { var r = items[i].getBoundingClientRect(); if (y >= r.top && y < r.bottom) { j = i; f = (y - r.top) / r.height; break; } }
    if (j !== shot) { shot = j; S.cuts++; lastKey = ''; doc.dispatchEvent(new CustomEvent('dfy:scene', { detail: { i: j } })); want(); }
    shotF = Math.max(0, Math.min(1, f));
  }
  var raf = 0, lastT = 0, lastF = -1, lastMove = 0, pace = [], strikes = 0;
  function tick(now) {
    raf = 0;
    if (!onScreen) return;
    var gapT = lastT ? now - lastT : 0, dt = Math.min(0.1, Math.max(0.001, gapT / 1000)); lastT = now;
    var prevShot = shot; locate();
    var pos = RANGES ? RANGES[shot][0] + shotF * (RANGES[shot][1] - RANGES[shot][0]) : shotF * 119;
    var moved = shot !== prevShot || Math.abs(pos - lastF) > 0.01;
    speed += ((prevShot === shot && lastF >= 0 ? Math.abs(pos - lastF) / dt : 0) - speed) * 0.3; lastF = pos;
    if (moved) lastMove = now;
    var still = now - lastMove > 140;
    if (gapT > 0 && gapT < 200 && !still) {
      S.ticks++; if (gapT > 25) S.late++; if (gapT > S.maxDt) S.maxDt = gapT;
      pace.push(gapT);
      if (pace.length >= 12) {
        pace.sort(function (a, b) { return a - b; }); var med = pace[6]; pace = [];
        if (med < 40) hz = Math.max(30, Math.min(240, 1000 / med));
        strikes = med > 42 ? strikes + 1 : 0;
        if (strikes >= 2 && qk > 0.6) { strikes = 0; qk *= 0.8; resize(); }      // l'affichage ne suit pas : toile plus petite
      }
    }
    if (mode === 'video' && V && !bmp.size && startT && now - startT > 5000) toStill();
    paint(still);
    if (!still || dirty) kick();
  }
  function kick() { if (!raf && onScreen) raf = requestAnimationFrame(tick); }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', function () { resize(); locate(); });
  new IntersectionObserver(function (es) {
    near = es[0].isIntersecting;
    if (near) { if (!startT) startT = performance.now(); loadSet(); pump(); want(); }
  }, { rootMargin: '120% 0px' }).observe(sec);
  new IntersectionObserver(function (es) {
    onScreen = es[0].isIntersecting;
    if (onScreen) { lastT = 0; dirty = true; resize(); kick(); }
  }).observe(cv);
  doc.addEventListener('visibilitychange', function () { lastT = 0; kick(); });

  window.DFYScenes = {
    stats: function () {
      var o = { mode: mode, set: setName, n: N, shot: shot, pos: center, decoded: bmp.size, hz: Math.round(hz), cv: cw + 'x' + chh, q: qk, mpf: V ? Math.round(V.mpf * 10) / 10 : 0, errs: V ? V.errs : 0 };
      for (var k in S) if (k !== 't0') o[k] = Math.round(S[k] * 10) / 10;
      o.s = Math.round((performance.now() - S.t0) / 100) / 10; return o;
    },
    reset: resetStats,
    info: function () { return { mode: mode, set: setName, n: N, shot: shot, decoded: bmp.size }; }
  };
  resize();
})();
