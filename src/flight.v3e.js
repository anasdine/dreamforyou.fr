/* Dream For You — le vol (hero v3, film v3b, moteur v3c : vidéo H.264 décodée image par image, 2560 px accentués).
   Un film suit le défilement : balade en quad dans les vignes, la caméra s'élève jusqu'à l'hélicoptère,
   entrée dans la cabine par la vitre, survol des vignes, arrivée sur le Haut-Kœnigsbourg. La dernière image est la première de la vidéo de la bulle :
   l'écran entier se referme alors en bulle de verre (bubble.v2.js, setOpen) et le hero de la v1 apparaît.
   Le film est posé en « sticky » : aucune position n'est calculée en JS, seul le contenu de la toile change.

   Deux moteurs pour le même film :
   - « video » (WebCodecs) : toutes les images du vol (~3 fois plus que des fichiers image, pour le même poids),
     compressées en H.264 par petits groupes de 8. C'est lui qui donne la fluidité et la netteté.
   - « webp » : une image sur trois, en .webp. Repli automatique si le navigateur ne sait pas décoder.
   v3b (fluidité, retour du pilote sur Mac au trackpad) :
   - entre deux images, la toile fond l'une dans l'autre selon la position exacte : le mouvement reste continu
     même quand le défilement est lent (fin d'un geste au trackpad, vol automatique) ; à l'arrêt, une image entière ;
   - le décodage s'adapte à la vitesse (une image sur 2, 3, 4 quand ça défile vite, au lieu d'une sur 8) et à la
     machine (temps de décodage mesuré ; jeu 1920 si le 2560 est trop lourd pour elle) ;
   - une sonde (message « diag ») donne les mesures réelles depuis la page qui contient le site.
   v3c (mesuré sur le Mac du pilote : Intel 6 cœurs, écran 4K en double densité, 6 à 13 images/s) :
   - le filtre fin (bicubique) ne sert qu'à l'arrêt ; en mouvement, filtre simple, quatre fois moins cher ;
   - la toile rétrécit d'elle-même quand la cadence réelle tombe sous 24 images/s (jamais sous la taille de l'écran),
     et s'en souvient une semaine pour cet écran.
   v3d (brief du pilote : « plus fluide, aucun flou ») :
   - plus AUCUN fondu entre deux images : la toile montre toujours une image entière du film (fini le fantôme
     en mouvement) ; la fluidité vient du film lui-même (677 images à pas régulier, plans refaits plus lents) ;
   - film vol-v3d : plans S2/S3 régénérés sans flou de mouvement, coupes franches à la place des fondus de Kling,
     agrandi en 2560 sur PPOPKBK (RealESRGAN) ;
   - repli statique : 12 images fixes (coupe de l'une à l'autre) si petite machine
     (≤ 2 Go, ≤ 2 cœurs, économie de données) ou pas de WebCodecs.
   Chargé avant site.v3d.js (qui attend DFYFlight.ready dans le préchargeur). */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement;
  var hero = doc.getElementById('hero'), cv = doc.getElementById('flFilm');
  if (!hero || !cv) { window.DFYFlight = { ready: Promise.resolve() }; return; }
  var ctx = cv.getContext('2d', { alpha: false });

  /* ---- le film : changer `dir` à chaque nouveau rendu (cache de l'artefact) ; jeux l paysage, x grand écran, p portrait ----
     vidéo : <dir>v-<jeu>.json + v-<jeu>-NN.mp4 ; images : <dir><jeu>-NNN.webp */
  var FILM = {
    video: { dir: 'media/vol-v3d/', l: { w: 1920, h: 1080 }, x: { w: 2560, h: 1440 }, p: { w: 864, h: 1536 } },
    webp: { dir: 'media/vol-v3d/', n: 12, l: { w: 1920, h: 1080 }, p: { w: 864, h: 1536 } }
  };
  /* ---- partition du défilement du hero (0 = haut, 1 = le hero se détache) ---- */
  var P_FILM = 0.8555;  // 0 → P_FILM : le film (677 images sur 5,5 écrans de défilement)
  var P_SHUT = 0.968;   // P_FILM → P_SHUT : l'écran se referme en bulle
  var P_LAND = 0.912;   // au-delà : titre et boutons de la v1
  var COLMAR = [48.0794, 7.3585], HK = [48.2494, 7.3444], KM = 18.9;

  var elLat = doc.getElementById('flCoords'), elKm = doc.getElementById('flKm'), elBar = doc.getElementById('flBar');
  var cta = hero.querySelector('.hero-cta'), btnGo = doc.getElementById('flGo'), btnSkip = doc.getElementById('flSkip');

  /* ---------------------------------------------------------------- images du film
     `bmp` : les images décodées, une fenêtre glissante autour de la position. La toile ne dessine QUE du décodé :
     le décodage se fait à l'avance, hors du fil principal. Si le doigt va plus vite, le film saute des images au
     lieu de bloquer le défilement. */
  var canBitmap = typeof createImageBitmap === 'function', canResize = true;
  var fine = !window.matchMedia || matchMedia('(pointer:fine)').matches;
  var nav = navigator, conn = nav.connection || {};
  // v3e : « Réduire les animations » (réglage système) ne coupe plus le film : il ne bouge que sous le doigt de
  // l'utilisateur, et le repli à 12 images donnait un diaporama saccadé sur toutes les machines où ce réglage est actif.
  var weak = (nav.deviceMemory && nav.deviceMemory <= 2) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) || conn.saveData === true;
  var mode = (window.DFY_FILM !== 'webp' && !weak && canBitmap && 'VideoDecoder' in window && 'EncodedVideoChunk' in window) ? 'video' : 'webp';
  var N = 2;                                       // nombre d'images du film (lu dans l'index du moteur actif)
  var setName = null, firstDone = null;
  var bmp = new Map(), pending = new Map(), MAXBMP = 24, center = 0, dir = 1, speed = 0;
  var wLo = 0, wHi = 0;                            // images dont le moteur a besoin en ce moment (jamais retirées de la mémoire)
  var gen = 0, decW = 0, decH = 0;                 // génération : change quand le jeu ou la taille de décodage change
  var ready = new Promise(function (r) { firstDone = r; });
  var hz = 60, slow = false, light = false;        // cadence de l'écran (mesurée) ; machine trop lente pour le jeu 2560 ; mode allégé
  function blend() { return T.blend && !light; }
  var T = { blend: 0, stride: 1, adapt: 1, set: null, k: 0, full: 1 };   // v3d : blend 0 = jamais de fondu (aucun flou)   // réglages que la sonde peut changer (comparaisons sur place)
  // Taille de la toile : réduite par crans quand l'affichage ne suit pas (mesuré dans tick), retenue une semaine.
  var QF = [1, 0.8, 0.64, 0.5], qLevel = 0, qArea = 0, baseArea = 0, pace = [], strikes = 0, paceSkip = 0, calm = true;
  try { var sv = JSON.parse(localStorage.getItem('dfy-film-q') || 'null'); if (sv && sv.q > 0 && sv.q < QF.length && Date.now() - sv.t < 6048e5) { qLevel = sv.q; qArea = sv.a || 0; } } catch (e) {}
  function saveQ() { try { localStorage.setItem('dfy-film-q', JSON.stringify({ q: qLevel, a: qArea, t: Date.now() })); } catch (e) {} }
  function degrade() {
    var before = cw * ch;
    while (!light && qLevel < QF.length - 1) { qLevel++; qArea = baseArea; resize(); if (cw * ch < before * 0.95) { saveQ(); return; } }
    if (!light) { light = true; resize(); }        // la toile est déjà à la taille de l'écran : on retire le fondu
  }
  var S = null;                                    // mesures (voir stats)
  function resetStats() { S = { t0: performance.now(), ticks: 0, late: 0, late2: 0, maxDt: 0, pace: 0, drawn: 0, mix: 0, miss: 0, gap: 0, jobs: 0, frames: 0, kept: 0, jobMs: 0, decMs: 0 }; }
  resetStats();
  function bigScreen() { return mode === 'video' && fine && innerWidth * Math.min(window.devicePixelRatio || 1, 2) > 2050; }
  function pickSet() {
    // v3e : rapport mesuré sur la zone épinglée (100svh), pas sur la fenêtre : sur téléphone la barre d'adresse qui se
    // replie changeait innerHeight et faisait basculer de jeu (tout le film rechargé) en plein défilement.
    if ((cv.clientWidth || innerWidth) / (cv.clientHeight || innerHeight) <= 0.8) return 'p';
    if (T.set === 'l' || T.set === 'x') return mode === 'video' ? T.set : 'l';
    return bigScreen() && !slow ? 'x' : 'l';
  }
  function dropBitmaps() {
    gen++;
    bmp.forEach(function (b) { if (b.close) b.close(); }); bmp.clear(); pending.clear();
  }
  function put(i, b) {
    var old = bmp.get(i); if (old && old !== b && old.close) old.close();
    bmp.set(i, b);
    if (i === 0) firstDone();
    evict(); dirty = true; kick();
  }
  function evict() {
    while (bmp.size > MAXBMP) {
      var far = -1, fd = -1;                       // la plus lointaine, d'abord parmi celles dont on n'a plus besoin
      bmp.forEach(function (b, i) { var d = Math.abs(i - center) + (i < wLo || i > wHi ? 1e6 : 0); if (i !== 0 && i !== N - 1 && d > fd) { fd = d; far = i; } });
      if (far < 0) return;
      var b = bmp.get(far); bmp.delete(far); if (b.close) b.close();
    }
  }
  function nearest(has, i, span) {
    if (has(i)) return i;
    for (var d = 1; d <= span; d++) {
      if (i - d >= 0 && has(i - d)) return i - d;
      if (i + d < N && has(i + d)) return i + d;
    }
    return -1;
  }
  function hasBmp(i) { return bmp.has(i); }
  function loadSet() {
    var s = pickSet();
    if (s === setName) return;
    setName = s;
    dropBitmaps();
    if (mode === 'video') loadVideo(s); else loadWebp();
  }
  function want() { if (mode === 'video') wantV(); else wantW(); }

  /* ---------------------------------------------------------------- paquets vidéo
     Le film arrive en une vingtaine de petits fichiers .mp4 (de vrais MP4, lisibles tels quels) : un index (.json)
     donne la place et la taille de chaque image dans son fichier, on les découpe en mémoire.
     Le paquet de la position courante passe devant les autres. */
  var K = null;
  function loadPack(kind, set, onIndex) {
    var k = K = { kind: kind, parts: [], off: null, partOf: [], size: null, inflight: 0, ok: false };
    fetch(FILM.video.dir + kind + '-' + set + '.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (m) {
      if (k !== K) return;
      k.size = m.sizes; k.off = m.offs;
      m.parts.forEach(function (p, j) {
        for (var i = p[1]; i < p[1] + p[2]; i++) k.partOf[i] = j;
        k.parts.push({ file: p[0], buf: null, state: 0, tries: 0 });
      });
      return onIndex(m, k);
    }).then(function () { if (k === K) { k.ok = true; pumpK(); kick(); } }, function () { if (k === K) packFail(); });
  }
  function packFail() { useWebp(); }
  function got(k, i) { return k.ok && i >= 0 && i < N && k.parts[k.partOf[i]].state === 2; }
  function bytes(k, i) { return new Uint8Array(k.parts[k.partOf[i]].buf, k.off[i], k.size[i]); }
  function pumpK() {
    var k = K;
    if (!k || !k.ok) return;
    while (k.inflight < 2) {
      var c = Math.max(0, Math.min(N - 1, center)), a = Math.max(0, Math.min(N - 1, c + dir * 12));
      var first = [k.partOf[c], k.partOf[a], 0, k.parts.length - 1], j = -1;
      for (var q = 0; q < first.length && j < 0; q++) if (k.parts[first[q]].state === 0) j = first[q];
      for (var r = 0; r < k.parts.length && j < 0; r++) if (k.parts[r].state === 0) j = r;
      if (j < 0) return;
      (function (p) {
        p.state = 1; k.inflight++;
        fetch(FILM.video.dir + p.file).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (buf) {
          k.inflight--; if (k !== K) return;
          p.buf = buf; p.state = 2; wantV(); pumpK();
        }, function () {
          k.inflight--; if (k !== K) return;
          if (++p.tries < 4) setTimeout(function () { p.state = 0; pumpK(); }, 800 * p.tries);
          else if (!bmp.size) packFail();
        });
      })(k.parts[j]);
    }
  }

  /* ---------------------------------------------------------------- moteur « video » (WebCodecs)
     Le film est coupé en groupes de `gop` images (la 1re se décode seule, les suivantes s'appuient sur elle).
     On décode des groupes entiers autour de la position. Quand ça défile vite, l'écran ne peut montrer qu'une image
     du film sur 2, 3 ou 4 : on ne garde que celles-là (les autres sont décodées puis jetées). Si la machine ne suit
     pas, on ne décode que le début de chaque groupe ; au pire, sa 1re image. */
  var V = null;
  function closeDec() { if (V && V.dec) { try { V.dec.close(); } catch (e) {} V.dec = null; } }
  function loadVideo(set) {
    closeDec(); V = null;
    loadPack('v', set, function (m, k) {
      var raw = atob(m.desc), desc = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) desc[i] = raw.charCodeAt(i);
      var v = { k: k, set: set, gop: m.gop, busy: 0, job: 0, jobGen: 0, pend: 0, errs: 0, dec: null, t0: 0,
        js: 1, jk: m.gop, jn: 0, jt: 0, out: 0, tDec: 0, full: 0, meas: 0, mpf: 0, best: 0,     // tâche en cours et temps mesurés
        cfg: { codec: m.codec, codedWidth: m.w, codedHeight: m.h, description: desc, optimizeForLatency: true } };
      return VideoDecoder.isConfigSupported(v.cfg).then(function (s) {
        if (k !== K) return;
        if (!s || !s.supported) throw 0;
        V = v; N = m.n; MAXBMP = (v.gop > 8 ? 3 : 4) * v.gop + 3; shown = -1;
      });
    });
  }
  function decErr(v) {
    if (v !== V) return;
    v.busy = 0; v.pend = 0; v.jt = 0;
    closeDec();
    if (++v.errs > 3 || !bmp.size) useWebp();       // jamais rien décodé, ou erreurs à répétition : repli sur les images
    else setTimeout(wantV, 80);                     // décodeur repris par le navigateur (onglet en fond) : on le recrée
  }
  function keep(v, i) { var r = i % v.gop; return r < v.jk && r % v.js === 0; }
  function jobDone(v) {                             // tout est décodé et converti : on mesure, puis on enchaîne
    var now = performance.now();
    if (v.jt && v.jn) {
      var ms = now - v.jt, per = ms / v.jn;
      S.jobs++; S.frames += v.jn; S.jobMs += ms; S.decMs += (v.tDec || now) - v.jt;
      // v3e : toute tâche sans saut d'image mesure la machine, pas seulement les groupes entiers. Avant, une 1re mesure
      // lente (démarrage à froid, page en cours de chargement) allégeait le décodage, qui ne mesurait alors plus rien et
      // restait allégé : 2 images sur 8 jamais montrées. Les 2 premières tâches ne comptent pas ; on redescend vite.
      if (v.js === 1 && v.jk >= 2 && v.jn >= 2 && ++v.meas > 2) v.mpf = v.mpf ? v.mpf + (per - v.mpf) * (per < v.mpf ? 0.5 : 0.2) : per;
      if (v.js === 1 && v.jk === v.gop && v.jn === v.gop) {     // groupe entier : c'est lui qui dit ce que vaut la machine
        v.full++;
        if (v.full > 2) v.best = v.best ? Math.min(v.best, per) : per;
        // le jeu 2560 demande plus de 9 ms par image même au mieux (décodage logiciel, petite carte) : jeu 1920
        if (T.adapt && !slow && v.set === 'x' && v.full >= 10 && v.best > 9) { v.jt = 0; slow = true; resize(); return; }
        // même le jeu courant dépasse 25 ms par image : pas d'accélération graphique du tout. Toile à la taille de l'écran, sans fondu.
        if (T.adapt && !light && v.set !== 'x' && v.full >= 8 && v.best > 25) { light = true; resize(); }
      }
    }
    v.jt = 0;
    wantV();
  }
  function decoder(v) {
    if (v.dec && v.dec.state === 'configured') return v.dec;
    try {
      var d = new VideoDecoder({
        output: function (f) {
          var i = Math.round(f.timestamp / 1000), g = gen;
          if (v !== V || g !== v.jobGen) { f.close(); return; }
          if (++v.out === v.jn) v.tDec = performance.now();
          if (!keep(v, i)) { f.close(); return; }
          v.pend++; S.kept++;
          createImageBitmap(f).then(function (b) {
            f.close(); if (v !== V) { b.close(); return; }
            v.pend--;
            if (g === gen) put(i, b); else b.close();
            if (!v.busy && !v.pend) jobDone(v);
          }, function () { f.close(); decErr(v); });
        },
        error: function () { decErr(v); }
      });
      d.configure(v.cfg);
      v.dec = d; return d;
    } catch (e) { decErr(v); return null; }
  }
  // dernière image à décoder dans un groupe, pour en garder une sur `s` parmi les `k` premières
  function lastOf(v, g, s, k) { var a = g * v.gop, n = Math.min(N - a, k); return a + Math.floor((n - 1) / s) * s; }
  function gopReady(v, g, s, k) {
    for (var i = g * v.gop, b = lastOf(v, g, s, k); i <= b; i += s) if (!bmp.has(i)) return false;
    return true;
  }
  function runJob(v, gs, s, k) {
    var d = decoder(v); if (!d) return;
    var job = ++v.job, n = 0;
    v.busy = job; v.jobGen = gen; v.js = s; v.jk = k; v.out = 0; v.tDec = 0; v.jn = 0; v.jt = performance.now();
    if (!v.t0) { v.t0 = 1; setTimeout(function () { if (v === V && !bmp.size) useWebp(); }, 4000); }   // rien en 4 s : repli
    try {
      for (var q = 0; q < gs.length; q++) {
        var a = gs[q] * v.gop, b = lastOf(v, gs[q], s, k);
        for (var i = a; i <= b; i++, n++) d.decode(new EncodedVideoChunk({ type: i === a ? 'key' : 'delta', timestamp: i * 1000, data: bytes(v.k, i) }));
      }
      v.jn = n;
      d.flush().then(function () { if (v === V && v.busy === job) { v.busy = 0; if (!v.pend) jobDone(v); } },
                     function () { if (v === V && v.busy === job) v.busy = 0; });
    } catch (e) { decErr(v); }
  }
  function wantV() {
    var v = V;
    if (!v || v.busy || v.pend) return;
    var G = v.gop, last = Math.floor((N - 1) / G), gc = Math.floor(Math.max(0, Math.min(N - 1, center)) / G);
    var s = 1, k = G;
    if (T.stride) {
      var per = speed / hz;                          // images du film par image d'écran
      s = per <= 1.35 ? 1 : per <= 2.7 ? 2 : per <= 4.2 ? 3 : per <= 6 ? 4 : G;
      var cost = speed * (v.mpf || 4);               // ms de décodage par seconde s'il fallait tout décoder
      // v3e : tant que la machine suit largement, on décode TOUT : chaque écran montre exactement l'image visée.
      // (Une image sur deux, à ces vitesses, laissait un écran sur quatre sans nouvelle image : saccade visible.)
      if (T.full && s === 2 && cost <= 500) s = 1;
      if (cost > 1000) k = Math.max(1, Math.floor(G * 1000 / cost));
      if (s >= k) { s = 1; k = 1; }                  // une image par groupe
    } else if (speed > 110) k = 1;                   // ancien réglage (v3a) : au-delà de 110 images/s, une par groupe
    var per1 = Math.ceil(k / s), slowMove = s === 1 && k === G;
    var room = Math.floor((MAXBMP - 2) / per1) - (slowMove ? 2 : 1);
    var ahead = Math.max(slowMove ? 2 : 1, Math.min(room, Math.ceil(speed * 0.25 / G)));
    var g0 = gc - (slowMove ? dir : 0), g1 = gc + ahead * dir;
    wLo = Math.max(0, Math.min(g0, g1)) * G; wHi = Math.min(N - 1, (Math.max(g0, g1) + 1) * G - 1);
    var list = [];
    for (var q = 0; q <= ahead; q++) list.push(gc + q * dir);
    if (slowMove) list.push(gc - dir);
    if (!bmp.has(N - 1)) list.push('fin');           // la dernière image reste en mémoire pour le passage de relais à la bulle
    var gs = [];
    for (var j = 0; j < list.length; j++) {
      var g = list[j], tail = g === 'fin';
      if (tail) { if (gs.length) break; g = last; }
      if (g < 0 || g > last) continue;
      var ss = tail ? 1 : s, kk = tail ? G : k;
      if (!tail && gopReady(v, g, ss, kk)) continue;
      if (!got(v.k, g * G) || !got(v.k, lastOf(v, g, ss, kk))) continue;
      if (tail || k > 1) { runJob(v, [g], ss, kk); return; }
      gs.push(g); if (gs.length >= 3) break;        // une image par groupe : trois groupes d'un coup
    }
    if (gs.length) runJob(v, gs, 1, 1);
  }
  function useWebp() {
    if (mode === 'webp') return;
    closeDec(); V = null; mode = 'webp'; setName = null; shown = -1;
    resize();
  }

  /* ---------------------------------------------------------------- moteur « webp » (repli)
     Une image sur trois du film, un fichier .webp par image : téléchargées en blob (du plus grossier au plus fin),
     décodées par createImageBitmap (sur une <img>, il bloquerait la page), à la taille de la toile, pas plus. */
  var frames = [], queue = [], inflight = 0, MAXPAR = 6, MAXDEC = 4;
  function url(i) { return FILM.webp.dir + setName + '-' + String(i).padStart(3, '0') + '.webp'; }
  function order(n) {
    var seen = {}, out = [];
    [0, 1, 2, 3, n - 1].forEach(function (i) { seen[i] = 1; out.push(i); });
    for (var step = 32; step >= 1; step >>= 1) for (var i = 0; i < n; i += step) if (!seen[i]) { seen[i] = 1; out.push(i); }
    return out;
  }
  function pump() {
    while (inflight < MAXPAR && queue.length) {
      (function (i, set) {
        inflight++;
        var done = function (blob) {
          inflight--;
          if (set !== setName || mode !== 'webp') { pump(); return; }
          if (blob) { frames[i] = blob; wantW(); } else if (i === 0) firstDone();
          pump();
        };
        fetch(url(i)).then(function (r) { return r.ok ? r.blob() : null; }).then(done, function () { done(null); });
      })(queue.shift(), setName);
    }
  }
  function loadWebp() { K = null; N = FILM.webp.n; shown = -1; wLo = wHi = 0; frames = new Array(N); queue = order(N); pump(); }
  function hasFile(i) { return !!frames[i]; }
  function decode(i) {
    var blob = frames[i], g = gen;
    pending.set(i, 1);
    var ok = function (b) {
      if (g !== gen) { if (b && b.close) b.close(); return; }
      pending.delete(i);
      put(i, b); wantW();
    };
    var ko = function () { if (g === gen) pending.delete(i); if (i === 0) firstDone(); };
    var viaImg = function () {                     // vieux navigateurs : une <img> décodée à l'avance
      var im = new Image(), u = URL.createObjectURL(blob);
      im.onload = function () { (im.decode ? im.decode() : Promise.resolve()).then(function () { ok(im); }, function () { ok(im); }); };
      im.onerror = function () { URL.revokeObjectURL(u); ko(); };
      im.src = u;
    };
    if (!canBitmap) { viaImg(); return; }
    var plain = function () { createImageBitmap(blob).then(ok, viaImg); };
    if (canResize && decW) createImageBitmap(blob, { resizeWidth: decW, resizeHeight: decH, resizeQuality: 'high' }).then(ok, function () { canResize = false; plain(); });
    else plain();
  }
  // demande le décodage autour de la position : d'abord l'image visée, puis devant (sens du défilement), puis derrière
  function wantW() {
    if (mode !== 'webp') return;
    var c = center, list = [c, c + 1];
    for (var q = 1; q <= 12; q++) { list.push(c + dir * q + (dir > 0 ? 1 : 0)); if (q <= 4) list.push(c - dir * q); }
    for (var j = 0; j < list.length && pending.size < MAXDEC; j++) {
      var i = list[j];
      if (i >= 0 && i < N && frames[i] && !bmp.has(i) && !pending.has(i)) decode(i);
    }
    // rien de téléchargé près de la position (réseau lent, saut direct) : l'image téléchargée la plus proche
    if (!pending.size && nearest(hasBmp, c, 6) < 0) { var n = nearest(hasFile, c, N); if (n >= 0 && !bmp.has(n)) decode(n); }
  }

  /* ---------------------------------------------------------------- toile */
  var cw = 0, ch = 0, dirty = true;
  function resize() {
    loadSet();
    var f = FILM[mode][setName], w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var fh = setName === 'l' && bigScreen() ? FILM.video.x.h : f.h; // même toile si le moteur redescend du 2560 au 1920 (pas d'éclair noir)
    var k0 = light ? 1 : Math.min(dpr, Math.max(1, (fh * 1.25) / h));  // inutile de dépasser de beaucoup la définition du film
    baseArea = w * h * k0 * k0;
    if (qLevel && baseArea < qArea * 0.8) qLevel = 0;                  // fenêtre plus petite que celle qui avait posé problème
    var k = T.k || Math.max(1, k0 * QF[qLevel]), sized = false;
    cw = Math.round(w * k); ch = Math.round(h * k);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; sized = true; }
    if (mode === 'webp') {
      // taille de décodage : celle du cadrage « cover » sur la toile, plafonnée à la définition du film
      var s = Math.min(1, Math.max(cw / f.w, ch / f.h));
      var dw = Math.round(f.w * s), dh = Math.round(f.h * s);
      if (dw !== decW || dh !== decH) { decW = dw; decH = dh; dropBitmaps(); want(); }
      MAXBMP = Math.max(18, Math.min(30, Math.floor(190e6 / (dw * dh * 4))));   // ~190 Mo d'images décodées au plus
    }
    dirty = true;
    if (sized && bmp.size && shown >= 0) paint(shown);                 // une toile redimensionnée est vide : on la repeint tout de suite
    kick();
  }
  function cover(im, alpha) {
    var iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight, s = Math.max(cw / iw, ch / ih);
    var dw = iw * s, dh = ih * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }
  var lastKey = '', lastPos = 0;
  /* Entre deux images, la toile fond la suivante sur la précédente selon la position exacte : le mouvement reste
     continu quelle que soit la vitesse du défilement et la cadence de l'écran. S'il manque des images (défilement
     rapide), le fondu se fait entre les deux plus proches de part et d'autre. À l'arrêt, `tick` pose une image entière. */
  function paint(pos) {
    if (pos !== lastPos) { dir = pos > lastPos ? 1 : -1; lastPos = pos; }
    var i0 = Math.round(pos), lo = Math.floor(pos), fr = pos - lo, a = -1, b = -1, w = 0, d;
    if (i0 !== center) { center = i0; want(); }
    if (blend() && fr > 0.03 && fr < 0.97) {
      for (d = 0; d < 9 && a < 0; d++) if (bmp.has(lo - d)) a = lo - d;
      for (d = 1; d < 10 && b < 0; d++) if (bmp.has(lo + d)) b = lo + d;
      if (a >= 0 && b >= 0) { w = (pos - a) / (b - a); if (w < 0.03) b = -1; else if (w > 0.97) { a = b; b = -1; } }
      else a = b = -1;
    }
    if (a < 0) { a = nearest(hasBmp, i0, N); b = -1; }
    if (a < 0) { want(); return; }
    var hq = calm && !light;                         // filtre fin à l'arrêt seulement : en mouvement il coûte cher et ne se voit pas
    var key = a + ':' + b + ':' + (b < 0 ? 0 : Math.round(w * 60)) + ':' + cw + 'x' + ch + ':' + gen + (hq ? 'h' : '');
    if (key === lastKey && !dirty) return;
    if (key !== lastKey) {
      S.drawn++; if (b >= 0) S.mix++;
      var hole = b >= 0 ? b - a - 1 : Math.abs(a - i0);          // images du film qui manquaient à cet instant
      if (hole > 0) { S.miss++; S.gap += hole; }
    }
    lastKey = key; dirty = false;
    ctx.imageSmoothingQuality = hq ? 'high' : light ? 'low' : 'medium';
    cover(bmp.get(a), 1);
    if (b >= 0) cover(bmp.get(b), w);
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------- défilement → état */
  function progress() {
    var r = hero.getBoundingClientRect(), span = r.height - innerHeight;
    return span > 0 ? Math.max(0, Math.min(1, -r.top / span)) : 1;
  }
  var sp = -1, raf = 0, lastT = 0, onScreen = true, handed = null, landed = null, lastHud = '';
  var idleA = 0, idleT = 0, IDLE_ZOOM = 0.028, IDLE_PERIOD = 11;   // en haut de page l'image respire (zoom lent, toujours nette)
  var shown = -1, lastMove = 0, lastRaw = 0;                       // position affichée dans le film, en images
  var dts = [], rawT = 0;                                          // intervalles entre deux passages (cadence de l'écran)
  function lang() { return html.lang || 'fr'; }
  function hud(fp) {
    var lat = COLMAR[0] + (HK[0] - COLMAR[0]) * fp, lon = COLMAR[1] + (HK[1] - COLMAR[1]) * fp;
    var km = KM * (1 - fp);
    var key = lat.toFixed(4) + lon.toFixed(4) + lang();
    if (key === lastHud) return;
    lastHud = key;
    if (elLat) elLat.textContent = lat.toFixed(4) + '° N — ' + lon.toFixed(4) + '° E';
    if (elKm) elKm.textContent = km.toLocaleString(lang(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
    if (elBar) elBar.style.transform = 'scaleX(' + fp.toFixed(4) + ')';
  }
  var vars = {};
  function cssVar(k, v) { if (vars[k] !== v) { vars[k] = v; hero.style.setProperty(k, v); } }
  function setHanded(v) {
    if (v === handed) return;
    handed = v;
    hero.classList.toggle('fl-handed', v);
    if (window.DFY && window.DFY.heroGate) window.DFY.heroGate(v);
  }
  function setLanded(v) {
    if (v === landed) return;
    landed = v;
    hero.classList.toggle('landed', v);
    if (cta) { if (v) cta.removeAttribute('inert'); else cta.setAttribute('inert', ''); }
  }
  function apply() {
    var fp = Math.min(1, sp / P_FILM);
    paint(shown < 0 ? fp * (N - 1) : shown);
    cssVar('--fl-zoom', (idleA * IDLE_ZOOM * (0.5 - 0.5 * Math.cos(idleT * 6.2832 / IDLE_PERIOD))).toFixed(4));
    hud(fp);
    cssVar('--fl-dawn', Math.max(0, 1 - sp / 0.09).toFixed(3));                   // le voile de l'aube se lève au décollage
    var past = sp >= P_FILM - 0.0005;
    setHanded(past && bmp.has(N - 1));
    var o = Math.pow(1 - Math.max(0, Math.min(1, (sp - P_FILM) / (P_SHUT - P_FILM))), 1.25);   // part vite, se pose en douceur
    var b = window.DFY && window.DFY.bubble;
    if (b && b.setOpen && handed) b.setOpen(o);            // hors du hero, site.v2.js remet la bulle à 0
    cssVar('--fl-open', o.toFixed(3));
    setLanded(landed ? sp > P_LAND - 0.03 : sp >= P_LAND);
  }
  function tick(now) {
    raf = 0;
    var p = progress();
    var gapT = rawT ? now - rawT : 0; rawT = now;
    var dt = Math.min(0.1, Math.max(0.001, (now - lastT) / 1000)); lastT = now;
    if (sp < 0 || Math.abs(p - sp) > 0.35) sp = p;            // premier passage ou saut (ancre, rechargement) : pas de rattrapage
    else sp += (p - sp) * (1 - Math.exp(-dt * 13));
    if (Math.abs(p - sp) < 0.00004) sp = p;
    var raw = Math.min(1, sp / P_FILM) * (N - 1);
    speed += (Math.abs(raw - lastRaw) / dt - speed) * 0.3; lastRaw = raw;
    if (sp !== p) lastMove = now;
    // En mouvement : la position exacte (fondu entre deux images voisines, glisse même lentement).
    // À l'arrêt : on se pose sur UNE image entière, sinon deux images superposées donnent un flou fantôme.
    var still = now - lastMove > 140, goal = still || !blend() ? Math.round(raw) : raw;
    if (mode === 'webp') {                                   // images espacées : on lisse un peu plus
      if (shown < 0 || Math.abs(goal - shown) > 3) shown = goal;
      else shown += (goal - shown) * (1 - Math.exp(-dt * (still ? 9 : 40)));
      if (Math.abs(goal - shown) < 0.004) shown = goal;
    } else if (!still || !blend() || shown < 0 || Math.abs(goal - shown) > 1) shown = goal;
    else { shown += (goal - shown) * (1 - Math.exp(-dt * 10)); if (Math.abs(goal - shown) < 0.03) shown = goal; }
    // cadence de l'écran et passages en retard, tant que le film bouge
    if (gapT > 0 && gapT < 200 && (sp !== p || shown !== goal || auto)) {
      dts.push(gapT);
      if (dts.length >= 40) { dts.sort(function (x, y) { return x - y; }); hz = Math.max(30, Math.min(240, 1000 / dts[12])); dts = []; }
      S.ticks++; if (gapT > 1600 / hz) S.late++; if (gapT > 2600 / hz) S.late2++; if (gapT > S.maxDt) S.maxDt = gapT;
    }
    // l'affichage suit-il ? Médiane de 12 passages au-dessus de 42 ms (moins de 24 images/s), deux fois de suite : toile plus petite.
    // (Un cadre bridé à 30 images/s par la page qui le contient reste à 33 ms : pas concerné.)
    if (T.adapt && gapT > 0 && gapT < 1000 && sp !== p && !doc.hidden && html.classList.contains('ready')) {
      if (paceSkip > 0) paceSkip--;
      else {
        pace.push(gapT);
        if (pace.length >= 12) {
          pace.sort(function (x, y) { return x - y; }); S.pace = pace[6]; pace = [];
          strikes = S.pace > 42 ? strikes + 1 : 0;
          if (strikes >= 2) { strikes = 0; paceSkip = 10; degrade(); }
        }
      }
    }
    calm = still && shown === goal && !auto;
    // en haut de page, avant tout geste : l'image respire
    var rest = p < 0.003 && !auto && html.classList.contains('ready') && !html.classList.contains('is-paused') && !doc.hidden;
    idleA += ((rest ? 1 : 0) - idleA) * (1 - Math.exp(-dt * (rest ? 0.9 : 5)));
    if (idleA < 0.002 && !rest) { idleA = 0; idleT = 0; } else idleT += dt;
    apply();
    if (auto && !auto.lenis) autoStep(dt);
    if (onScreen && (sp !== p || shown !== goal || !still || (auto && !auto.lenis) || rest || idleA > 0)) kick();
  }
  function kick() { if (!raf && onScreen) { raf = requestAnimationFrame(tick); } }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', resize);
  new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; if (onScreen) { lastT = performance.now(); kick(); } }, { rootMargin: '20% 0px' }).observe(hero);
  new MutationObserver(function () { lastHud = ''; kick(); }).observe(html, { attributes: true, attributeFilter: ['lang', 'class'] });
  doc.addEventListener('visibilitychange', function () { lastT = performance.now(); kick(); });

  /* ---------------------------------------------------------------- « Décoller » : le vol joue tout seul ; « Passer » : droit au château */
  var auto = null;
  function lenis() { return window.DFY && window.DFY.lenis; }
  function endY() { return hero.getBoundingClientRect().top + scrollY + hero.offsetHeight - innerHeight; }
  // départ et arrivée en douceur, vitesse constante entre les deux
  function ramp(x) { var a = 0.12, v = 1 / (1 - a); return x < a ? v * x * x / (2 * a) : x > 1 - a ? 1 - v * (1 - x) * (1 - x) / (2 * a) : v * (x - a / 2); }
  function clearAuto() { auto = null; hero.classList.remove('fl-auto'); }
  function stopAuto(hard) {
    if (!auto) return;
    var l = auto.lenis && lenis();
    clearAuto();
    if (l && hard) l.scrollTo(scrollY, { immediate: true });     // à la molette, Lenis reprend la main tout seul
  }
  function startAuto(seconds) {
    var to = endY(), from = scrollY;
    if (to - from < 4) return;
    var l = lenis(), dur = seconds * (to - from) / Math.max(1, to) + 0.6;
    auto = { from: from, to: to, t: 0, dur: dur, lenis: !!l };
    hero.classList.add('fl-auto');
    // avec Lenis (souris), c'est lui qui anime ; au doigt, défilement natif image par image
    if (l) l.scrollTo(to, { duration: dur, easing: ramp, onComplete: clearAuto });
    else { lastT = performance.now(); kick(); }
  }
  function autoStep(dt) {
    if (html.classList.contains('is-paused')) return;
    auto.t += dt;
    var x = Math.min(1, auto.t / auto.dur);
    scrollTo(0, auto.from + (auto.to - auto.from) * ramp(x));
    if (x >= 1) clearAuto();
  }
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (ev) {
    addEventListener(ev, function (e) {
      if (auto && !(e.target && e.target.closest && e.target.closest('#flGo'))) stopAuto(ev === 'pointerdown' || ev === 'keydown');
    }, { passive: true });
  });
  if (btnGo) btnGo.addEventListener('click', function () { if (auto) stopAuto(true); else startAuto(16); });
  if (btnSkip) btnSkip.addEventListener('click', function () {
    clearAuto();
    var l = lenis(), y = endY();
    if (l) l.scrollTo(y, { duration: 1.8 }); else startAuto(1.6);
  });

  /* ---------------------------------------------------------------- sonde
     La page qui contient le site (onglet de l'artefact, banc de test) envoie {dfy:'diag', …} et reçoit les mesures :
     moteur, jeu, cadence de l'écran, temps de décodage, passages en retard, images manquantes. Elle peut aussi placer
     le défilement (`go`, 0 à 1 dans le hero), lancer le vol (`fly`, secondes), faire glisser à vitesse constante
     (`glide` {to, s}) et changer un réglage (`set`) pour comparer sur place. */
  var gpuName = null, glideId = 0;
  function gpu() {
    if (gpuName === null) {
      gpuName = '';
      try { var g = doc.createElement('canvas').getContext('webgl'), x = g && g.getExtension('WEBGL_debug_renderer_info'); if (x) gpuName = String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)).slice(0, 90); } catch (e) {}
    }
    return gpuName;
  }
  function r1(x) { return Math.round(x * 10) / 10; }
  function stats() {
    var o = { mode: mode, set: setName, n: N, gop: V ? V.gop : 0, hz: r1(hz), dpr: window.devicePixelRatio, vw: innerWidth, vh: innerHeight, cv: cw + 'x' + ch,
      lenis: !!lenis(), auto: !!auto, y: Math.round(scrollY), sp: +sp.toFixed(4), pos: r1(shown), speed: Math.round(speed), decoded: bmp.size,
      errs: V ? V.errs : 0, mpf: V ? r1(V.mpf) : 0, best: V ? r1(V.best) : 0, slow: slow, light: light, q: qLevel, T: T, s: r1((performance.now() - S.t0) / 1000),
      ready: html.classList.contains('ready'), vis: doc.visibilityState, cls: hero.className, gpu: gpu(), ua: navigator.userAgent };
    for (var k in S) if (k !== 't0') o[k] = r1(S[k]);
    return o;
  }
  function place(y) { var l = lenis(); if (l) l.scrollTo(y, { immediate: true }); else scrollTo(0, y); }
  addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.dfy !== 'diag') return;
    if (d.set) { for (var k in d.set) if (k in T) T[k] = d.set[k]; if ('set' in d.set || 'k' in d.set) resize(); dirty = true; kick(); }
    if (d.go != null) { glideId++; stopAuto(true); place(hero.offsetTop + (hero.offsetHeight - innerHeight) * d.go); }
    if (d.reset) resetStats();
    if (d.fly) { glideId++; resetStats(); startAuto(d.fly); }
    if (d.glide) {
      var id = ++glideId, y0 = scrollY, y1 = hero.offsetTop + (hero.offsetHeight - innerHeight) * d.glide.to, t0 = performance.now(), dur = d.glide.s * 1000;
      stopAuto(true); resetStats();
      (function step(now) { if (id !== glideId) return; var x = Math.min(1, (now - t0) / dur); place(y0 + (y1 - y0) * x); if (x < 1) requestAnimationFrame(step); })(t0);
    }
    try { (e.source || parent).postMessage({ dfy: 'stats', id: d.id, stats: stats() }, '*'); } catch (x) {}
  });

  if (cta) cta.setAttribute('inert', '');
  if (/swiftshader|llvmpipe|softpipe|basic render/i.test(gpu())) light = true;   // pas d'accélération graphique : pas de fondu, toile à la taille de l'écran
  resize();
  window.DFYFlight = { ready: ready, refresh: function () { dirty = true; kick(); }, stop: function () { stopAuto(true); }, stats: stats,
    info: function () { return { mode: mode, set: setName, n: N, decoded: bmp.size, center: center, errs: V ? V.errs : 0 }; } };
})();
