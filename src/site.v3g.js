/* Dream For You — orchestration du site (v3e : nom de l'expérience juste en défilement rapide) v2 (v1 + le vol du hero, voir flight.v2.js) : préchargeur, menu, langues, défilement, bulle, avis, jeu.
   Rien n'est positionné en JS au rythme du défilement (iframe iPhone bridée à 30 i/s) : la bulle vit dans
   des scènes « sticky » et ne réagit qu'à des seuils (changement d'expérience) avec des animations au temps réel. */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var fine = matchMedia('(pointer:fine)').matches;
  var small = function () { return innerWidth < 700; };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* pas de stockage : sans effet */ } }
  };

  /* ---------------------------------------------------------------- langues */
  var I18N = window.DFY_I18N || { fr: {} };
  var FR = I18N.fr;
  $$('[data-i18n]').forEach(function (el) { var k = el.getAttribute('data-i18n'); if (!(k in FR)) FR[k] = el.textContent.trim(); });
  $$('[data-i18n-attr]').forEach(function (el) {
    el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
      var p = pair.split(':'); if (!(p[1] in FR)) FR[p[1]] = el.getAttribute(p[0]) || '';
    });
  });
  var lang = 'fr';
  function t(k) { var d = I18N[lang] || {}; return (k in d) ? d[k] : (k in FR ? FR[k] : k); }

  function splitChars(el) {
    var txt = el.textContent;
    el.setAttribute('aria-label', txt);
    el.innerHTML = '';
    // un bloc insécable par mot : la ligne ne se coupe qu'aux espaces, jamais entre deux lettres
    var word = null;
    Array.prototype.forEach.call(txt, function (ch, i) {
      if (ch === ' ') { el.appendChild(doc.createTextNode(' ')); word = null; return; }
      if (!word) { word = doc.createElement('span'); word.className = 'wd'; el.appendChild(word); }
      var s = doc.createElement('span'); s.className = 'ch'; s.setAttribute('aria-hidden', 'true');
      s.textContent = ch; s.style.transitionDelay = (0.08 + i * 0.045) + 's'; word.appendChild(s);
    });
  }
  function splitWords(el) {
    var words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(function (w) { return '<span class="w">' + w.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>'; }).join(' ');
  }

  var onLang = [];
  function applyLang(l, quiet) {
    lang = I18N[l] || l === 'fr' ? l : 'fr';
    html.lang = lang;
    $$('[data-i18n]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n'));
      if (el.textContent !== v) el.textContent = v;
      if (el.hasAttribute('data-split')) splitChars(el);
    });
    $$('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) { var p = pair.split(':'); el.setAttribute(p[0], t(p[1])); });
    });
    var mt = $('#manifText'); if (mt) splitWords(mt);
    $$('.langs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    if (!quiet) store.set('dfy-lang', lang);
    onLang.forEach(function (fn) { fn(lang); });
  }
  $$('.langs button').forEach(function (b) {
    b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
  });
  var saved = store.get('dfy-lang');
  applyLang(saved && (I18N[saved] || saved === 'fr') ? saved : 'fr', true);

  /* ---------------------------------------------------------------- défilement (molette seulement) */
  var lenis = null;
  if (fine && window.Lenis) {
    try {
      lenis = new window.Lenis({ autoRaf: true, anchors: false, respectReducedMotion: false, lerp: 0.094, wheelMultiplier: 1, syncTouch: false });
    } catch (e) { lenis = null; }
  }
  function go(target) {
    if (!target) return;
    if (lenis) lenis.scrollTo(target, { duration: 1.4 });
    else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  doc.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    var el = id ? doc.getElementById(id) : null;
    if (!el) return;
    e.preventDefault();
    closeSheet();
    go(el);
  });

  /* ---------------------------------------------------------------- menu téléphone */
  var sheet = $('#sheet'), burger = $('#burger');
  var navBefore = null;
  function burgerLabel() { var o = sheet.classList.contains('open'); burger.setAttribute('data-i18n', o ? 'nav.close' : 'nav.menu'); burger.textContent = t(o ? 'nav.close' : 'nav.menu'); }
  function openSheet() {
    sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false'); burger.setAttribute('aria-expanded', 'true');
    navBefore = html.getAttribute('data-nav'); html.setAttribute('data-nav', 'night'); burgerLabel();
    html.style.overflow = 'hidden'; if (lenis) lenis.stop();
  }
  function closeSheet() {
    if (!sheet.classList.contains('open')) return;
    sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); burger.setAttribute('aria-expanded', 'false');
    if (navBefore) html.setAttribute('data-nav', navBefore); burgerLabel();
    html.style.overflow = ''; if (lenis) lenis.start();
  }
  burger.addEventListener('click', function () { sheet.classList.contains('open') ? closeSheet() : openSheet(); });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  /* ---------------------------------------------------------------- couleur du menu selon la scène */
  var nav = $('#nav');
  var navLinks = $$('.nav-links a');
  var navIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      html.setAttribute('data-nav', e.target.getAttribute('data-theme'));
      var id = e.target.id;
      navLinks.forEach(function (a) { a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + id)); });
    });
  }, { rootMargin: '-28px 0px -96% 0px' });
  $$('[data-theme]').forEach(function (s) { navIO.observe(s); });
  html.setAttribute('data-nav', 'night');
  var scrolled = false;
  addEventListener('scroll', function () {
    var s = scrollY > 40; if (s !== scrolled) { scrolled = s; nav.classList.toggle('scrolled', s); }
  }, { passive: true });

  /* ---------------------------------------------------------------- texte « décodé » (étiquettes) */
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+·—';
  function scramble(el, dur) {
    var final = el.getAttribute('data-final') || el.textContent;
    if (el._scr) clearInterval(el._scr);
    el.setAttribute('data-final', final);
    var n = final.length, start = performance.now(); dur = dur || 650;
    el._scr = setInterval(function () {
      var p = Math.min(1, (performance.now() - start) / dur), out = '';
      var shown = Math.floor(p * n);
      for (var i = 0; i < n; i++) {
        var c = final[i];
        out += (i < shown || c === ' ') ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p >= 1) { clearInterval(el._scr); el._scr = 0; el.textContent = final; el.removeAttribute('data-final'); }
    }, 34);
  }
  var scrIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { scrIO.unobserve(e.target); if (!html.classList.contains('is-paused')) scramble(e.target); } });
  }, { threshold: 0.6 });
  $$('[data-scramble]').forEach(function (el) { if (!el.closest('#hero')) scrIO.observe(el); });
  if (fine) $$('.nav-links a').forEach(function (a) { a.addEventListener('mouseenter', function () { scramble(a, 420); }); });
  onLang.push(function () { $$('[data-scramble]').forEach(function (el) { if (el._scr) { clearInterval(el._scr); el._scr = 0; el.removeAttribute('data-final'); } }); });

  /* ---------------------------------------------------------------- apparitions sans animations liées au défilement */
  if (!(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()'))) {
    var riseIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); riseIO.unobserve(e.target); } });
    }, { threshold: 0.15 });
    $$('.io-rise').forEach(function (el) { riseIO.observe(el); });
  }

  /* ---------------------------------------------------------------- compteurs */
  var cntIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      cntIO.unobserve(e.target);
      var node = e.target.firstChild, to = +e.target.getAttribute('data-count'), t0 = performance.now();
      if (!node || node.nodeType !== 3) return;
      var iv = setInterval(function () {
        var p = Math.min(1, (performance.now() - t0) / 1400), v = Math.round(to * (1 - Math.pow(1 - p, 3)));
        node.nodeValue = String(v); if (p >= 1) clearInterval(iv);
      }, 30);
    });
  }, { threshold: 0.6 });
  $$('[data-count]').forEach(function (el) { cntIO.observe(el); });

  /* ---------------------------------------------------------------- avis */
  var row = $('#revRow');
  $$('[data-rev]').forEach(function (b) {
    b.addEventListener('click', function () {
      var card = row.querySelector('.rev'); var step = card ? card.getBoundingClientRect().width + 18 : 320;
      row.scrollBy({ left: step * +b.getAttribute('data-rev'), behavior: 'smooth' });
    });
  });
  $$('.rev .more').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.closest('.rev'); var open = f.classList.toggle('open');
      b.textContent = open ? t('rev.less') : t('rev.more');
    });
  });
  onLang.push(function () { $$('.rev .more').forEach(function (b) { b.textContent = b.closest('.rev').classList.contains('open') ? t('rev.less') : t('rev.more'); }); });

  /* ---------------------------------------------------------------- copier */
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var el = doc.getElementById(b.getAttribute('data-copy')); if (!el) return;
      var txt = el.textContent.trim();
      var done = function (ok) {
        b.textContent = t(ok ? 'ui.copied' : 'ui.copyfail'); b.classList.add('ok');
        setTimeout(function () { b.textContent = t('ui.copy'); b.classList.remove('ok'); }, 1600);
      };
      var sel = function () { var r = doc.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); done(false); };
      try { navigator.clipboard.writeText(txt).then(function () { done(true); }, sel); } catch (e) { sel(); }
    });
  });

  /* ---------------------------------------------------------------- bulle WebGL et scènes */
  var bubble = window.DFYBubble ? window.DFYBubble.create() : null;
  if (bubble) {
    html.classList.add('gl');
    bubble.onlost = function () { html.classList.remove('gl'); };
  }
  var hiRes = function () { return innerWidth * Math.min(devicePixelRatio || 1, 2) >= 1100; };
  function posterImg(src) { var i = new Image(); i.decoding = 'async'; i.src = src; return i; }
  function prepVideo(v) {
    if (!v || v.getAttribute('src')) return v;
    v.src = v.getAttribute(small() ? 'data-src-s' : 'data-src-l');
    v.load();
    return v;
  }
  var heroVid = $('#heroVideo'), bookVid = $('#bookVideo');
  var stages = {
    hero: { el: $('#hero-stage'), layout: 'hero', poster: posterImg('media/chateau-poster-v2.jpg'), video: heroVid, ratio: 0 },
    book: { el: $('[data-stage="book"]'), layout: 'book', poster: posterImg('media/colmar-poster-v1.jpg'), video: bookVid, ratio: 0 }
  };
  var expIdx = 0, current = null;
  function sourceFor(name) {
    var s = stages[name];
    if (s.video && s.video.readyState >= 2 && !s.video.paused) return s.video;
    return s.poster;
  }
  function wireVideo(s) {
    if (!s.video) return;
    s.video.addEventListener('playing', function () { if (bubble && current === s) bubble.show(s.video, true); });
  }
  wireVideo(stages.hero); wireVideo(stages.book);
  function playVid(s, on) {
    if (!s || !s.video) return;
    if (on) { prepVideo(s.video); var p = s.video.play(); if (p && p.catch) p.catch(function () {}); }
    else s.video.pause();
  }
  function pickStage() {
    var best = null, br = 0;
    Object.keys(stages).forEach(function (k) { if (stages[k].ratio > br) { br = stages[k].ratio; best = k; } });
    var s = best ? stages[best] : null;
    var gated = s === stages.hero && !heroOpen;       // pendant le vol, le film couvre la scène : bulle et vidéo attendent
    Object.keys(stages).forEach(function (k) { playVid(stages[k], stages[k] === s && !gated && !html.classList.contains('is-paused')); });
    if (gated && heroVid) { try { if (heroVid.currentTime > 0.04) heroVid.currentTime = 0; } catch (e) { /* pas encore chargée */ } }
    if (!bubble) { current = s; return; }
    if (!s || doc.hidden) { bubble.setActive(false); current = s; return; }
    if (current !== s) {
      current = s;
      bubble.attach(s.el.querySelector('.stage-gl'), s.layout);
      if (s !== stages.hero) bubble.setOpen(0);
      bubble.show(sourceFor(best), true);
    }
    bubble.setActive(!gated);
  }
  // Le vol (flight.v2.js) ouvre la porte quand sa dernière image est à l'écran : la bulle prend le relais, plein écran,
  // sur la même image, puis la vidéo démarre de sa première image.
  var heroOpen = false;
  function heroGate(open) { if (open === heroOpen) return; heroOpen = open; pickStage(); }
  var stIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      Object.keys(stages).forEach(function (k) { if (stages[k].el === e.target) stages[k].ratio = e.isIntersecting ? Math.max(e.intersectionRatio, 0.001) : 0; });
    });
    pickStage();
  }, { threshold: [0, 0.05, 0.2, 0.4, 0.6, 0.8, 1] });
  Object.keys(stages).forEach(function (k) { if (stages[k].el) stIO.observe(stages[k].el); });
  doc.addEventListener('visibilitychange', pickStage);

  // expérience active : bande centrale de lecture
  // v3d : la section 03 est un film (scenes.v3d.js, hors de la bulle) ; il annonce chaque changement de plan (dfy:scene)
  var hudIdx = $('#hudIdx'), hudName = $('#hudName'), dots = $$('#dots i');
  function setExp(i) {
    if (i === expIdx && hudName.textContent) return;
    expIdx = i;
    // v3e : arrêter le décodage en cours avant de changer de nom. Sinon scramble() reprenait le nom visé par l'animation
    // précédente (data-final) : en défilant vite, le compteur disait « 02 / 06 » mais le nom restait « Quad ».
    if (hudName._scr) { clearInterval(hudName._scr); hudName._scr = 0; }
    hudName.removeAttribute('data-final');
    hudIdx.textContent = String(i + 1).padStart(2, '0') + ' / 06';
    hudName.textContent = t('hud.' + i);
    if (!html.classList.contains('is-paused')) scramble(hudName, 480);
    dots.forEach(function (d, j) { d.classList.toggle('on', j === i); });
  }
  hudName.textContent = t('hud.0');
  onLang.push(function () { hudName.textContent = t('hud.' + expIdx); });
  doc.addEventListener('dfy:scene', function (e) { setExp(e.detail.i); });

  // pointeur : la bulle suit légèrement la souris
  if (fine && bubble) {
    addEventListener('pointermove', function (e) {
      if (!current) return;
      bubble.pointer((e.clientX / innerWidth - 0.5) * 2, -(e.clientY / innerHeight - 0.5) * 2);
    }, { passive: true });
  }

  /* ---------------------------------------------------------------- pause des animations */
  var pauseBtn = $('#pauseBtn');
  function setPaused(p, quiet) {
    html.classList.toggle('is-paused', p);
    pauseBtn.setAttribute('aria-pressed', String(p));
    pauseBtn.setAttribute('data-i18n-attr', 'aria-label:' + (p ? 'ui.play' : 'ui.pause'));
    pauseBtn.setAttribute('aria-label', t(p ? 'ui.play' : 'ui.pause'));
    if (bubble) bubble.setPaused(p);
    if (!quiet) store.set('dfy-paused', p ? '1' : '0');
    pickStage();
  }
  pauseBtn.addEventListener('click', function () { setPaused(!html.classList.contains('is-paused')); });
  if (store.get('dfy-paused') === '1') setPaused(true, true);

  /* ---------------------------------------------------------------- jeu (chargé à l'approche) */
  var game = null, gameSlot = $('#gameSlot');
  onLang.push(function (l) { if (game && game.setLang) game.setLang(l); });
  var gameIO = new IntersectionObserver(function (es) {
    if (!es.some(function (e) { return e.isIntersecting; })) return;
    gameIO.disconnect();
    import(new URL('game/game.v2.js', doc.baseURI).href).then(function (m) {
      gameSlot.innerHTML = '';
      game = m.mountGame(gameSlot, {
        lang: lang,
        onCta: function () {
          var q = doc.getElementById('exp-quad'); go(q);
          var b = q && q.querySelector('.btn'); if (b) { b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 700, iterations: 3, delay: 900 }); }
        }
      });
    }).catch(function () {
      var w = gameSlot.querySelector('.game-wait'); if (w) { w.setAttribute('data-i18n', 'game.error'); w.textContent = t('game.error'); }
    });
  }, { rootMargin: '120% 0px' });
  gameIO.observe($('#jeu'));

  /* ---------------------------------------------------------------- préchargeur */
  var pre = $('#pre'), cnt = $('#preCount'), bar = $('#preBar'), skip = $('#preSkip');
  var T0 = performance.now(), MIN = 1700, MAX = 3300, shown = 0, finished = false;
  var waits = [doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve(), stages.hero.poster, $('.pre-logo'),
    window.DFYFlight ? window.DFYFlight.ready : Promise.resolve()].map(function (x) {
    if (x instanceof HTMLImageElement) return new Promise(function (r) { if (x.complete) r(); else { x.onload = x.onerror = r; } });
    return x;
  });
  var loaded = 0;
  waits.forEach(function (p) { Promise.resolve(p).then(function () { loaded++; }, function () { loaded++; }); });
  prepVideo(heroVid);
  html.style.overflow = 'hidden'; if (lenis) lenis.stop();
  function finish() {
    if (finished) return; finished = true;
    clearInterval(preIv);
    cnt.textContent = '100'; bar.style.transform = 'scaleX(1)';
    pre.classList.add('out');
    html.classList.add('ready');
    html.style.overflow = ''; if (lenis) lenis.start();
    $$('#hero [data-scramble]').forEach(function (el) { scramble(el, 900); });
    setTimeout(function () { pre.classList.add('gone'); }, 1150);
  }
  var preIv = setInterval(function () {
    var el = performance.now() - T0;
    var real = loaded / waits.length;
    var timeP = Math.min(1, el / MIN);
    var target = Math.min(timeP, 0.35 + real * 0.65);
    shown += (target - shown) * 0.25;
    var v = Math.round(shown * 100);
    cnt.textContent = String(v).padStart(3, '0');
    bar.style.transform = 'scaleX(' + shown.toFixed(3) + ')';
    if ((real >= 1 && el >= MIN && shown > 0.985) || el > MAX) finish();
  }, 40);
  ['pointerup', 'keydown', 'wheel'].forEach(function (ev) { pre.addEventListener(ev, finish, { passive: true }); });
  addEventListener('keydown', function k() { finish(); removeEventListener('keydown', k); });
  skip.addEventListener('click', finish);



  /* ---------------------------------------------------------------- curseur et glisser à la souris */
  if (fine) {
    var cur = doc.createElement('div'); cur.className = 'cur'; cur.setAttribute('aria-hidden', 'true');
    var curLbl = doc.createElement('span'); curLbl.textContent = t('gal.hint'); cur.appendChild(curLbl);
    doc.body.appendChild(cur);
    onLang.push(function () { curLbl.textContent = t('gal.hint'); });
    var cx = -100, cy = -100, tx = -100, ty = -100, craf = 0;
    var cloop = function () {
      cx += (tx - cx) * 0.24; cy += (ty - cy) * 0.24;
      cur.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
      craf = (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.3) ? requestAnimationFrame(cloop) : 0;
    };
    addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      var el = e.target && e.target.closest ? e.target : null;
      var inGame = el && el.closest('.game-slot');
      var drag = el && el.closest('.gal,.rev-row');
      var link = el && !drag && el.closest('a,button');
      cur.classList.toggle('on', !inGame);
      cur.classList.toggle('drag', !!drag);
      cur.classList.toggle('link', !!link);
      if (!craf) craf = requestAnimationFrame(cloop);
    }, { passive: true });
    doc.addEventListener('mouseleave', function () { cur.classList.remove('on'); });

    $$('.gal,.rev-row').forEach(function (el) {
      var down = false, sx = 0, sl = 0, moved = false;
      el.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = true; moved = false; sx = e.clientX; sl = el.scrollLeft; });
      addEventListener('pointermove', function (e) {
        if (!down) return;
        var dx = e.clientX - sx;
        if (!moved && Math.abs(dx) > 5) { moved = true; el.classList.add('grabbing'); }
        if (moved) el.scrollLeft = sl - dx;
      });
      addEventListener('pointerup', function () { if (!down) return; down = false; el.classList.remove('grabbing'); });
      el.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
      el.addEventListener('dragstart', function (e) { e.preventDefault(); });
    });
  }

  window.DFY = { bubble: bubble, lenis: lenis, setLang: applyLang, go: go, heroGate: heroGate };
  if (window.DFYFlight && window.DFYFlight.refresh) window.DFYFlight.refresh();
})();
