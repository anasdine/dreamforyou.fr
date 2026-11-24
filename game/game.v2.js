// Dream Rider — la route des vignes. Mini-jeu de Dream For You (dreamforyou.fr).
// Module ES autonome : mountGame(container, opts) -> { start, pause, resume, destroy, setLang }.
// La 3D (world.js + Three.js) n'est chargée qu'à l'approche du jeu ou au premier start().
// Réglages de difficulté : en tête de sim.js.
import { createSim, CFG, K } from './sim.js';

const STORE_KEY = 'dfy-game-best';
const VISIBLE_MIN = 0.35;      // part visible minimale pour jouer (sinon pause auto)
const PRELOAD_MARGIN = '250px'; // la 3D se prépare quand le jeu arrive à 250 px de l'écran

const TEXTS = {
  fr: {
    tag: 'Mini-jeu · Dream For You', sub: 'La route des vignes',
    rulesTouch: 'Glisse pour changer de voie, touche pour sauter. Cueille les grappes, évite bottes de paille et rochers.',
    rulesKeys: '← → pour changer de voie, Espace pour sauter. Cueille les grappes, évite bottes de paille et rochers.',
    play: 'Jouer', loading: 'Préparation…', score: 'Score', best: 'Record', bonus: 'Bretzel ×2',
    pauseTag: 'Partie en pause', pause: 'Pause', resume: 'Reprendre', quit: 'Quitter', pauseA: 'Mettre en pause',
    overTag: 'Fin de la balade', crash: ['Aïe, une botte de paille !', 'Droit dans la paille !', 'Aïe, un rocher !'],
    pts: 'points', newBest: 'Nouveau record !', grapes: ['grappe', 'grappes'],
    replay: 'Rejouer', cta: 'Réserver la vraie balade en quad',
    hintTouch: 'Glisse ← →  ·  Touche pour sauter', hintKeys: '← →  changer de voie  ·  Espace  sauter  ·  Échap  pause',
    noGl: 'Ce jeu a besoin de WebGL, indisponible sur cet appareil.',
    canvas: 'Dream Rider : un quad roule entre les vignes au coucher du soleil.',
    live: 'Fin de la partie. Score : {s}. Record : {b}.',
  },
  en: {
    tag: 'Mini-game · Dream For You', sub: 'The vineyard trail',
    rulesTouch: 'Swipe to change lanes, tap to jump. Grab the grapes, dodge hay bales and rocks.',
    rulesKeys: '← → to change lanes, Space to jump. Grab the grapes, dodge hay bales and rocks.',
    play: 'Play', loading: 'Loading…', score: 'Score', best: 'Best', bonus: 'Pretzel ×2',
    pauseTag: 'Game paused', pause: 'Pause', resume: 'Resume', quit: 'Quit', pauseA: 'Pause the game',
    overTag: 'Ride over', crash: ['Ouch, a hay bale!', 'Straight into the hay!', 'Ouch, a rock!'],
    pts: 'points', newBest: 'New best!', grapes: ['bunch of grapes', 'bunches of grapes'],
    replay: 'Play again', cta: 'Book the real quad ride',
    hintTouch: 'Swipe ← →  ·  Tap to jump', hintKeys: '← →  change lanes  ·  Space  jump  ·  Esc  pause',
    noGl: 'This game needs WebGL, which is not available on this device.',
    canvas: 'Dream Rider: a quad rides between the vines at sunset.',
    live: 'Game over. Score: {s}. Best: {b}.',
  },
  de: {
    tag: 'Minispiel · Dream For You', sub: 'Der Rebenweg',
    rulesTouch: 'Wischen zum Spurwechsel, tippen zum Springen. Trauben sammeln, Strohballen und Felsen ausweichen.',
    rulesKeys: '← → zum Spurwechsel, Leertaste zum Springen. Trauben sammeln, Strohballen und Felsen ausweichen.',
    play: 'Spielen', loading: 'Wird geladen…', score: 'Punkte', best: 'Rekord', bonus: 'Brezel ×2',
    pauseTag: 'Spiel pausiert', pause: 'Pause', resume: 'Weiter', quit: 'Beenden', pauseA: 'Spiel pausieren',
    overTag: 'Fahrt beendet', crash: ['Autsch, ein Strohballen!', 'Mitten ins Stroh!', 'Autsch, ein Felsen!'],
    pts: 'Punkte', newBest: 'Neuer Rekord!', grapes: ['Traube', 'Trauben'],
    replay: 'Nochmal', cta: 'Die echte Quadtour buchen',
    hintTouch: 'Wischen ← →  ·  Tippen zum Springen', hintKeys: '← →  Spur wechseln  ·  Leertaste  springen  ·  Esc  Pause',
    noGl: 'Dieses Spiel benötigt WebGL, das auf diesem Gerät nicht verfügbar ist.',
    canvas: 'Dream Rider: ein Quad fährt bei Sonnenuntergang durch die Reben.',
    live: 'Spielende. Punkte: {s}. Rekord: {b}.',
  },
  es: {
    tag: 'Minijuego · Dream For You', sub: 'El camino de las viñas',
    rulesTouch: 'Desliza para cambiar de carril, toca para saltar. Recoge las uvas, esquiva balas de paja y rocas.',
    rulesKeys: '← → para cambiar de carril, Espacio para saltar. Recoge las uvas, esquiva balas de paja y rocas.',
    play: 'Jugar', loading: 'Cargando…', score: 'Puntos', best: 'Récord', bonus: 'Pretzel ×2',
    pauseTag: 'Partida en pausa', pause: 'Pausa', resume: 'Seguir', quit: 'Salir', pauseA: 'Pausar la partida',
    overTag: 'Fin del paseo', crash: ['¡Ay, una bala de paja!', '¡Directo a la paja!', '¡Ay, una roca!'],
    pts: 'puntos', newBest: '¡Nuevo récord!', grapes: ['racimo', 'racimos'],
    replay: 'Jugar otra vez', cta: 'Reservar el paseo en quad de verdad',
    hintTouch: 'Desliza ← →  ·  Toca para saltar', hintKeys: '← →  cambiar de carril  ·  Espacio  saltar  ·  Esc  pausa',
    noGl: 'Este juego necesita WebGL, que no está disponible en este dispositivo.',
    canvas: 'Dream Rider: un quad recorre los viñedos al atardecer.',
    live: 'Fin de la partida. Puntos: {s}. Récord: {b}.',
  },
};
const LOCALES = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE', es: 'es-ES' };

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l10.3-6.4a.8.8 0 0 0 0-1.4L9.2 4.9a.8.8 0 0 0-1.2.7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.3" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.3" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M4 4.5v4.3h4.3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
};

const CSS = `
.dfyg-root{position:relative;display:block;width:100%;container-type:inline-size;font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.45;color:#fff;text-align:left;-webkit-tap-highlight-color:transparent}
.dfyg-root *,.dfyg-root *::before,.dfyg-root *::after{box-sizing:border-box}
.dfyg-root [hidden]{display:none!important}
.dfyg-root p,.dfyg-root h2,.dfyg-root h3{margin:0;padding:0;border:0;background:none;color:inherit}
.dfyg-root .dfyg-stage{position:relative;width:100%;aspect-ratio:16/9;max-height:80vh;max-height:80svh;overflow:hidden;border-radius:20px;background:#233A2C linear-gradient(180deg,#1c2747 0%,#6c4a6e 24%,#c97a6c 40%,#f0a262 52%,#4a5636 54%,#2b432f 64%,#233A2C 100%);touch-action:pan-y;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;isolation:isolate;contain:layout paint}
.dfyg-root.dfyg-narrow .dfyg-stage{aspect-ratio:4/5;border-radius:16px}
.dfyg-root.dfyg-capture .dfyg-stage,.dfyg-root.dfyg-capture .dfyg-canvas{touch-action:none}
.dfyg-root .dfyg-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;opacity:0;transition:opacity .8s ease;outline:none}
.dfyg-root.dfyg-ready .dfyg-canvas{opacity:1}
.dfyg-root .dfyg-label{font-family:'Titillium Web',sans-serif;font-weight:700;font-size:12px;line-height:1.2;letter-spacing:.14em;text-transform:uppercase}
.dfyg-root .dfyg-title{font-family:'Outfit',system-ui,sans-serif;font-weight:600;font-size:52px;font-size:clamp(38px,6.2cqw,80px);line-height:.95;letter-spacing:-.02em;text-transform:none;color:#fff}
.dfyg-root .dfyg-sub{font-family:'Outfit',system-ui,sans-serif;font-weight:600;font-size:22px;font-size:clamp(18px,2.1cqw,26px);line-height:1.15;color:#ffd5aa;margin-top:8px}
.dfyg-root .dfyg-rules{font-size:15px;font-size:clamp(14px,1.25cqw,16px);color:rgba(255,255,255,.88);max-width:34em;margin-top:14px}
.dfyg-root .dfyg-msg{margin-top:14px;max-width:30em;padding:10px 14px;border-radius:12px;background:rgba(13,20,26,.6);font-size:14px}
.dfyg-root .dfyg-screen{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column}
.dfyg-root .dfyg-home{justify-content:space-between;padding:44px 48px;padding:clamp(20px,3.6cqw,52px)}
.dfyg-root .dfyg-home::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(180deg,rgba(13,20,26,.74) 0%,rgba(13,20,26,.34) 30%,rgba(13,20,26,0) 52%,rgba(13,20,26,0) 68%,rgba(13,20,26,.6) 100%)}
.dfyg-root .dfyg-home-top{max-width:640px}
.dfyg-root .dfyg-tag{color:rgba(255,255,255,.82)}
.dfyg-root .dfyg-home .dfyg-title{margin-top:12px}
.dfyg-root .dfyg-home-bottom{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.dfyg-root .dfyg-home-best{display:inline-flex;align-items:baseline;gap:8px;font-size:15px;color:rgba(255,255,255,.9)}
.dfyg-root .dfyg-home-best b{font-family:'Outfit',system-ui,sans-serif;font-weight:600;font-size:20px;font-variant-numeric:tabular-nums}
.dfyg-root .dfyg-btn{position:relative;appearance:none;-webkit-appearance:none;margin:0;border:0;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 26px;border-radius:999px;font-family:'Outfit',system-ui,sans-serif;font-weight:600;font-size:16px;line-height:1;letter-spacing:.01em;text-transform:none;text-decoration:none;white-space:nowrap;cursor:pointer;color:#fff;background:transparent;box-shadow:none;transition:transform .18s ease,background-color .2s ease,box-shadow .2s ease;touch-action:manipulation}
.dfyg-root .dfyg-btn svg{width:18px;height:18px;flex:none}
.dfyg-root .dfyg-btn--primary{background:#D42A30;box-shadow:0 12px 30px -12px rgba(212,42,48,.85)}
.dfyg-root .dfyg-btn--primary:hover{background:#c0242a}
.dfyg-root .dfyg-btn--ghost{box-shadow:inset 0 0 0 1.5px #fff}
.dfyg-root .dfyg-btn--ghost:hover{background:rgba(255,255,255,.12)}
.dfyg-root .dfyg-btn:active{transform:scale(.97)}
.dfyg-root .dfyg-btn:focus-visible{outline:2px solid #fff;outline-offset:3px}
.dfyg-root .dfyg-btn--lg{min-height:56px;padding:0 34px;font-size:18px}
.dfyg-root .dfyg-btn--sm{min-height:40px;padding:0 16px 0 12px;gap:6px;font-size:14px;background:rgba(13,20,26,.38)}
.dfyg-root .dfyg-btn--icon{width:40px;min-height:40px;padding:0;background:rgba(13,20,26,.38);box-shadow:inset 0 0 0 1.5px #fff}
.dfyg-root .dfyg-home .dfyg-btn--primary::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;animation:dfyg-pulse 2.6s ease-out infinite}
.dfyg-root .dfyg-btn[aria-busy="true"] svg{display:none}
.dfyg-root .dfyg-btn[aria-busy="true"]::before{content:"";width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:dfyg-spin .8s linear infinite}
.dfyg-root .dfyg-hud{position:absolute;inset:0;z-index:2;display:none;pointer-events:none}
.dfyg-root.dfyg-ingame .dfyg-hud{display:block}
.dfyg-root .dfyg-hud::before{content:"";position:absolute;left:0;right:0;top:0;height:120px;background:linear-gradient(180deg,rgba(13,20,26,.45),rgba(13,20,26,0));pointer-events:none}
.dfyg-root .dfyg-hud-score{position:absolute;left:24px;top:20px;display:flex;flex-direction:column;gap:3px;text-shadow:0 2px 12px rgba(13,20,26,.5)}
.dfyg-root .dfyg-score{font-family:'Outfit',system-ui,sans-serif;font-weight:600;font-size:40px;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.dfyg-root .dfyg-hud-best{font-size:13px;color:rgba(255,255,255,.86)}
.dfyg-root .dfyg-hud-best b{font-weight:500;font-variant-numeric:tabular-nums}
.dfyg-root .dfyg-hud-btns{position:absolute;right:20px;top:20px;display:flex;gap:8px;pointer-events:auto}
.dfyg-root .dfyg-bonus{position:absolute;left:50%;top:22px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:9px 16px 8px;border-radius:999px;background:#D42A30;box-shadow:0 10px 26px -12px rgba(212,42,48,.9);opacity:0;transform:translate(-50%,-10px);transition:opacity .25s ease,transform .25s ease}
.dfyg-root .dfyg-bonus .dfyg-label{font-size:12px}
.dfyg-root .dfyg-bonus-bar{display:block;width:76px;height:3px;border-radius:2px;background:#fff;transform-origin:left center}
.dfyg-root.dfyg-bonus-on .dfyg-bonus{opacity:1;transform:translate(-50%,0)}
.dfyg-root.dfyg-bonus-on .dfyg-bonus-bar{animation:dfyg-shrink linear both}
.dfyg-root.dfyg-frozen .dfyg-bonus-bar{animation-play-state:paused}
.dfyg-root .dfyg-hint{position:absolute;left:50%;bottom:28px;z-index:2;transform:translate(-50%,8px);padding:10px 18px;border-radius:999px;background:rgba(13,20,26,.62);font-size:14px;line-height:1.3;white-space:nowrap;text-align:center;opacity:0;pointer-events:none;transition:opacity .45s ease,transform .45s ease}
.dfyg-root.dfyg-hint-on .dfyg-hint{opacity:1;transform:translate(-50%,0)}
.dfyg-root .dfyg-pause,.dfyg-root .dfyg-over{align-items:center;justify-content:center;text-align:center;padding:24px;background:rgba(13,20,26,.6);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);animation:dfyg-fade .35s ease both}
.dfyg-root .dfyg-card{display:flex;flex-direction:column;align-items:center;max-width:600px;width:100%}
.dfyg-root .dfyg-card .dfyg-label{color:rgba(255,255,255,.8)}
.dfyg-root .dfyg-title--md{font-size:44px;font-size:clamp(36px,5cqw,60px);margin-top:10px}
.dfyg-root .dfyg-over-title{font-family:'Outfit',system-ui,sans-serif;font-weight:600;font-size:24px;font-size:clamp(20px,2.4cqw,28px);line-height:1.15;margin-top:10px;color:#ffd5aa}
.dfyg-root .dfyg-final{display:flex;align-items:baseline;gap:10px;margin-top:10px}
.dfyg-root .dfyg-final-v{font-family:'Outfit',system-ui,sans-serif;font-weight:600;font-size:88px;font-size:clamp(64px,9cqw,116px);line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.dfyg-root .dfyg-newbest{display:inline-block;margin-top:12px;padding:6px 14px;border-radius:999px;background:#fff;color:#0D141A;font-family:'Titillium Web',sans-serif;font-weight:700;font-size:12px;letter-spacing:.14em;text-transform:uppercase}
.dfyg-root .dfyg-stats{margin-top:12px;font-size:15px;color:rgba(255,255,255,.86)}
.dfyg-root .dfyg-actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:26px}
.dfyg-root .dfyg-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
.dfyg-root.dfyg-narrow .dfyg-home{padding:22px 20px 22px}
.dfyg-root.dfyg-narrow .dfyg-title{font-size:42px}
.dfyg-root.dfyg-narrow .dfyg-sub{font-size:19px}
.dfyg-root.dfyg-narrow .dfyg-rules{font-size:14px;margin-top:10px}
.dfyg-root.dfyg-narrow .dfyg-home-bottom{justify-content:space-between}
.dfyg-root.dfyg-narrow .dfyg-hud-score{left:16px;top:14px}
.dfyg-root.dfyg-narrow .dfyg-score{font-size:32px}
.dfyg-root.dfyg-narrow .dfyg-hud-btns{right:14px;top:14px}
.dfyg-root.dfyg-narrow .dfyg-bonus{top:72px}
.dfyg-root.dfyg-narrow .dfyg-hint{bottom:18px;white-space:normal;width:max-content;max-width:calc(100% - 32px)}
.dfyg-root.dfyg-narrow .dfyg-over .dfyg-actions{flex-direction:column;align-items:stretch;width:100%;max-width:340px}
.dfyg-root.dfyg-narrow .dfyg-final-v{font-size:72px}
@keyframes dfyg-pulse{0%{box-shadow:0 0 0 0 rgba(212,42,48,.55)}70%,100%{box-shadow:0 0 0 16px rgba(212,42,48,0)}}
@keyframes dfyg-spin{to{transform:rotate(360deg)}}
@keyframes dfyg-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@keyframes dfyg-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.dfyg-root .dfyg-home .dfyg-btn--primary::after{animation:none}.dfyg-root .dfyg-canvas{transition:none}.dfyg-root .dfyg-pause,.dfyg-root .dfyg-over{animation:none}}
`;

let styleRefs = 0, styleEl = null;
function addStyle() {
  if (styleRefs++ === 0) {
    styleEl = document.createElement('style');
    styleEl.setAttribute('data-dfyg', '');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }
}
function removeStyle() {
  if (--styleRefs === 0 && styleEl) { styleEl.remove(); styleEl = null; }
}
function readBest() {
  try { const v = parseInt(window.localStorage.getItem(STORE_KEY) || '0', 10); return Number.isFinite(v) && v > 0 ? v : 0; } catch (_) { return 0; }
}
function writeBest(v) {
  try { window.localStorage.setItem(STORE_KEY, String(v)); } catch (_) { /* pas de stockage : tant pis */ }
}
const mq = (q) => { try { return window.matchMedia(q); } catch (_) { return null; } };

export function mountGame(container, opts = {}) {
  if (!container) throw new Error('mountGame : conteneur manquant');
  addStyle();

  let lang = TEXTS[opts.lang] ? opts.lang : 'fr';
  let T = TEXTS[lang];
  let fmt = new Intl.NumberFormat(LOCALES[lang]);
  let state = 'idle'; // idle | playing | paused | dying | over
  let world = null, worldPromise = null, failed = false, pendingStart = false, destroyed = false;
  let rafId = 0, last = 0, acc = 0, ratio = 0;
  let best = readBest(), shownScore = -1, shownBest = -1, lastBonus = 0, runStart = 0, games = 0;
  let lastInput = 'pointer', lastOver = null;
  const sim = createSim();
  const mqReduce = mq('(prefers-reduced-motion: reduce)');
  const mqTouch = mq('(hover: none) and (pointer: coarse)');
  let reduced = !!(mqReduce && mqReduce.matches);
  const touchy = !!(mqTouch && mqTouch.matches);
  const stats = { frames: 0, work: 0, t0: 0, raf: 0 };

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.className = 'dfyg-root';
  root.innerHTML = `
<div class="dfyg-stage">
  <canvas class="dfyg-canvas" role="img"></canvas>
  <div class="dfyg-hud">
    <div class="dfyg-hud-score" aria-hidden="true">
      <span class="dfyg-label" data-t="score"></span>
      <strong class="dfyg-score">0</strong>
      <span class="dfyg-hud-best"><span data-t="best"></span> <b data-k="hudBest">0</b></span>
    </div>
    <div class="dfyg-bonus" aria-hidden="true"><span class="dfyg-label" data-t="bonus"></span><i class="dfyg-bonus-bar"></i></div>
    <div class="dfyg-hud-btns">
      <button type="button" class="dfyg-btn dfyg-btn--icon" data-act="pause" data-ta="pauseA">${ICON.pause}</button>
      <button type="button" class="dfyg-btn dfyg-btn--sm dfyg-btn--ghost" data-act="quit">${ICON.close}<span data-t="quit"></span></button>
    </div>
  </div>
  <div class="dfyg-hint" aria-hidden="true"></div>
  <div class="dfyg-screen dfyg-home">
    <div class="dfyg-home-top">
      <p class="dfyg-label dfyg-tag" data-t="tag"></p>
      <h2 class="dfyg-title">Dream Rider</h2>
      <p class="dfyg-sub" data-t="sub"></p>
      <p class="dfyg-rules" data-k="rules"></p>
      <p class="dfyg-msg" data-k="msg" hidden></p>
    </div>
    <div class="dfyg-home-bottom">
      <button type="button" class="dfyg-btn dfyg-btn--primary dfyg-btn--lg" data-act="play">${ICON.play}<span data-k="playTxt"></span></button>
      <span class="dfyg-home-best" data-k="homeBestWrap" hidden><span class="dfyg-label" data-t="best"></span><b data-k="homeBest"></b></span>
    </div>
  </div>
  <div class="dfyg-screen dfyg-pause" hidden>
    <div class="dfyg-card">
      <p class="dfyg-label" data-t="pauseTag"></p>
      <h3 class="dfyg-title dfyg-title--md" data-t="pause"></h3>
      <div class="dfyg-actions">
        <button type="button" class="dfyg-btn dfyg-btn--primary" data-act="resume">${ICON.play}<span data-t="resume"></span></button>
        <button type="button" class="dfyg-btn dfyg-btn--ghost" data-act="quit">${ICON.close}<span data-t="quit"></span></button>
      </div>
    </div>
  </div>
  <div class="dfyg-screen dfyg-over" hidden>
    <div class="dfyg-card">
      <p class="dfyg-label" data-t="overTag"></p>
      <h3 class="dfyg-over-title" data-k="overTitle"></h3>
      <div class="dfyg-final"><span class="dfyg-final-v" data-k="final">0</span><span class="dfyg-label" data-t="pts"></span></div>
      <p class="dfyg-newbest" data-k="newBest" data-t="newBest" hidden></p>
      <p class="dfyg-stats" data-k="stats"></p>
      <div class="dfyg-actions">
        <button type="button" class="dfyg-btn dfyg-btn--primary" data-act="cta"><span data-t="cta"></span>${ICON.arrow}</button>
        <button type="button" class="dfyg-btn dfyg-btn--ghost" data-act="replay">${ICON.replay}<span data-t="replay"></span></button>
      </div>
    </div>
  </div>
  <p class="dfyg-sr" aria-live="polite" data-k="live"></p>
</div>`;
  container.appendChild(root);
  const $ = (sel) => root.querySelector(sel);
  const el = {};
  root.querySelectorAll('[data-k]').forEach((n) => { el[n.getAttribute('data-k')] = n; });
  const stage = $('.dfyg-stage'), canvas = $('.dfyg-canvas'), scoreEl = $('.dfyg-score'), hintEl = $('.dfyg-hint');
  const bonusBar = $('.dfyg-bonus-bar');
  bonusBar.style.animationDuration = CFG.BONUS_TIME + 's';
  const screens = { home: $('.dfyg-home'), pause: $('.dfyg-pause'), over: $('.dfyg-over') };
  const playBtn = root.querySelector('[data-act="play"]');

  // ---------------------------------------------------------------- textes
  function applyLang() {
    T = TEXTS[lang]; fmt = new Intl.NumberFormat(LOCALES[lang]);
    root.setAttribute('lang', lang);
    root.querySelectorAll('[data-t]').forEach((n) => { n.textContent = T[n.getAttribute('data-t')]; });
    root.querySelectorAll('[data-ta]').forEach((n) => { n.setAttribute('aria-label', T[n.getAttribute('data-ta')]); });
    el.rules.textContent = touchy ? T.rulesTouch : T.rulesKeys;
    hintEl.textContent = touchy ? T.hintTouch : T.hintKeys;
    el.playTxt.textContent = pendingStart ? T.loading : T.play;
    el.msg.textContent = T.noGl;
    canvas.setAttribute('aria-label', T.canvas);
    shownScore = -1; shownBest = -1;
    scoreEl.textContent = fmt.format(Math.max(0, sim.score));
    el.hudBest.textContent = fmt.format(Math.max(best, state === 'idle' ? 0 : sim.score));
    showBest();
    if (lastOver) fillOver();
  }
  function showBest() {
    el.homeBestWrap.hidden = best <= 0;
    el.homeBest.textContent = fmt.format(best);
  }
  function fillOver() {
    const o = lastOver;
    el.overTitle.textContent = T.crash[o.kind === K.PILE ? 1 : o.kind === K.ROCK ? 2 : 0];
    el.final.textContent = fmt.format(o.score);
    el.newBest.hidden = !o.isNew;
    const d = o.dist >= 1000
      ? new Intl.NumberFormat(LOCALES[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(o.dist / 1000) + ' km'
      : fmt.format(Math.round(o.dist)) + ' m';
    el.stats.textContent = fmt.format(o.grapes) + ' ' + T.grapes[o.grapes === 1 ? 0 : 1] + '  ·  ' + d;
  }

  // ---------------------------------------------------------------- écrans
  function show(name) {
    for (const k in screens) screens[k].hidden = k !== name;
  }
  function setClasses() {
    const ingame = state === 'playing' || state === 'paused' || state === 'dying';
    root.classList.toggle('dfyg-ingame', ingame);
    root.classList.toggle('dfyg-capture', state === 'playing' || state === 'dying');
    root.classList.toggle('dfyg-frozen', state !== 'playing');
    if (!ingame) root.classList.remove('dfyg-bonus-on', 'dfyg-hint-on');
  }
  function blurInside() {
    const a = document.activeElement;
    if (a && a !== document.body && root.contains(a) && a.blur) a.blur();
  }
  function setLoading(on) {
    pendingStart = on;
    playBtn.setAttribute('aria-busy', on ? 'true' : 'false');
    el.playTxt.textContent = on ? T.loading : T.play;
  }

  // ---------------------------------------------------------------- 3D à la demande
  function ensureWorld() {
    if (worldPromise || destroyed) return worldPromise;
    worldPromise = import('./world.v2.js')
      .then((mod) => {
        if (destroyed) return null;
        const narrow = root.clientWidth <= 640;
        return mod.createWorld(canvas, sim, { antialias: !touchy && !narrow, lowEnd: touchy || narrow });
      })
      .then((w) => {
        if (!w) return null;
        if (destroyed) { w.dispose(); return null; }
        world = w;
        canvas.addEventListener('webglcontextlost', onContextLost);
        layout();
        world.render();
        root.classList.add('dfyg-ready');
        if (pendingStart) start(); else kick();
        return w;
      })
      .catch((err) => {
        failed = true; setLoading(false);
        playBtn.hidden = true; el.msg.hidden = false;
        if (typeof console !== 'undefined') console.warn('[Dream Rider] 3D indisponible :', err && err.message ? err.message : err);
      });
    return worldPromise;
  }
  function onContextLost() { if (state === 'playing') pause(); }

  // ---------------------------------------------------------------- boucle
  function visibleEnough() { return ratio >= VISIBLE_MIN && !document.hidden; }
  function wantLoop() {
    if (!world || destroyed || document.hidden || ratio <= 0) return false;
    if (state === 'playing' || state === 'dying') return true;
    return state === 'idle' && !reduced;
  }
  function kick() {
    if (rafId || !wantLoop()) return;
    last = performance.now(); acc = 0;
    rafId = requestAnimationFrame(tick);
  }
  function stop() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

  function tick(now) {
    rafId = 0;
    if (!wantLoop()) return;
    stats.raf++;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; else if (dt < 0) dt = 0;
    if (state === 'idle' && touchy) { // écran d'accueil à 30 i/s sur mobile
      acc += dt;
      if (acc < 1 / 31) { rafId = requestAnimationFrame(tick); return; }
      dt = Math.min(0.05, acc); acc = 0;
    }
    const w0 = performance.now();
    sim.step(dt);
    world.frame(dt);
    stats.work += performance.now() - w0; stats.frames++;
    if (state === 'playing') {
      hud();
      if (sim.mode === 'dead') { state = 'dying'; setClasses(); }
    }
    if (state === 'dying' && sim.deadT >= 0.9) { gameOver(); return; }
    rafId = requestAnimationFrame(tick);
  }

  function hud() {
    if (sim.score !== shownScore) { shownScore = sim.score; scoreEl.textContent = fmt.format(shownScore); }
    const b = Math.max(best, sim.score);
    if (b !== shownBest) { shownBest = b; el.hudBest.textContent = fmt.format(b); }
    if (sim.bonusT > lastBonus + 0.05) { // nouveau bretzel : on relance la jauge
      root.classList.remove('dfyg-bonus-on'); void bonusBar.offsetWidth; root.classList.add('dfyg-bonus-on');
    } else if (sim.bonusT <= 0 && lastBonus > 0) root.classList.remove('dfyg-bonus-on');
    lastBonus = sim.bonusT;
    if (sim.time > 3.4 && root.classList.contains('dfyg-hint-on')) root.classList.remove('dfyg-hint-on');
  }

  // ---------------------------------------------------------------- états
  function start() {
    if (destroyed || failed) return;
    if (!world) { setLoading(true); ensureWorld(); return; }
    setLoading(false);
    stop();
    sim.reset('run');
    runStart = sim.dist; shownScore = -1; shownBest = -1; lastBonus = 0; lastOver = null;
    state = 'playing';
    setClasses(); show(null); hud();
    root.classList.remove('dfyg-bonus-on');
    if (games++ < 2) root.classList.add('dfyg-hint-on');
    blurInside();
    if (!visibleEnough()) { pause(); return; }
    kick();
  }
  function pause() {
    if (state !== 'playing') return;
    state = 'paused'; stop(); setClasses(); show('pause');
  }
  function resume() {
    if (state !== 'paused' || !visibleEnough()) return;
    state = 'playing'; setClasses(); show(null); blurInside(); kick();
  }
  function quit() {
    if (state === 'idle') return;
    stop(); state = 'idle'; lastOver = null;
    sim.reset('attract');
    setClasses(); show('home'); showBest();
    if (world) world.render();
    kick();
  }
  function gameOver() {
    stop();
    state = 'over';
    const score = sim.score;
    const isNew = score > best && score > 0;
    if (isNew) { best = score; writeBest(best); }
    lastOver = { score, isNew, kind: sim.crashKind, grapes: sim.grapes, dist: sim.dist - runStart };
    fillOver(); showBest();
    setClasses(); show('over');
    el.live.textContent = T.live.replace('{s}', fmt.format(score)).replace('{b}', fmt.format(best));
    if (lastInput === 'key') { const r = root.querySelector('[data-act="replay"]'); try { r.focus({ preventScroll: true }); } catch (_) { /* rien */ } }
    if (typeof opts.onScore === 'function') { try { opts.onScore(score, best); } catch (_) { /* rien */ } }
  }

  // ---------------------------------------------------------------- entrées
  function onClick(e) {
    const b = e.target.closest && e.target.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    const act = b.getAttribute('data-act');
    if (e.detail === 0) lastInput = 'key';
    if (act === 'play' || act === 'replay') { if (!pendingStart) start(); }
    else if (act === 'pause') pause();
    else if (act === 'resume') resume();
    else if (act === 'quit') quit();
    else if (act === 'cta') { if (typeof opts.onCta === 'function') opts.onCta(); }
  }
  let gId = -1, gx = 0, gy = 0, gt = 0;
  function onDown(e) {
    if (state !== 'playing') return;
    if (e.target.closest && e.target.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gId !== -1) return;
    gId = e.pointerId; gx = e.clientX; gy = e.clientY; gt = e.timeStamp;
    lastInput = 'pointer';
    try { stage.setPointerCapture(gId); } catch (_) { /* rien */ }
  }
  function onUp(e) {
    if (e.pointerId !== gId) return;
    gId = -1;
    if (state !== 'playing') return;
    const dx = e.clientX - gx, dy = e.clientY - gy, dt = e.timeStamp - gt;
    if (dt > 600) return;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < 24 && ay < 24) { sim.jump(); return; }
    if (ax > ay) { if (dx < 0) sim.left(); else sim.right(); }
    else if (dy < 0) sim.jump();
    else sim.drop();
  }
  function onCancel(e) { if (e.pointerId === gId) gId = -1; }
  function onMenu(e) { if (state === 'playing' || state === 'dying') e.preventDefault(); }

  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (state !== 'playing' && state !== 'paused' && state !== 'dying') return;
    if (!visibleEnough()) return;
    const tg = e.target;
    if (tg && tg !== document.body && !root.contains(tg) && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
    const k = e.key;
    let handled = true;
    if (state === 'paused') {
      if (k === 'Escape' || k === 'p' || k === 'P') resume(); else handled = false;
    } else if (state === 'dying') {
      handled = k === ' ' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight';
    } else {
      switch (k) {
        case 'ArrowLeft': case 'a': case 'A': case 'q': case 'Q': if (!e.repeat) sim.left(); break;
        case 'ArrowRight': case 'd': case 'D': if (!e.repeat) sim.right(); break;
        case 'ArrowUp': case ' ': case 'Spacebar': case 'w': case 'W': case 'z': case 'Z': if (!e.repeat) sim.jump(); break;
        case 'ArrowDown': case 's': case 'S': sim.drop(); break;
        case 'Escape': case 'p': case 'P': pause(); break;
        default: handled = false;
      }
    }
    if (handled) { e.preventDefault(); lastInput = 'key'; }
  }
  function onKeyUp(e) {
    if ((state === 'playing' || state === 'dying') && e.key === ' ' && visibleEnough()) e.preventDefault();
  }
  function onDocVis() {
    if (document.hidden && state === 'playing') pause();
    if (document.hidden) stop(); else kick();
  }
  function onReduce() { reduced = !!(mqReduce && mqReduce.matches); if (reduced && state === 'idle') stop(); kick(); }

  // ---------------------------------------------------------------- taille et visibilité
  function layout() {
    const narrow = root.clientWidth <= 640;
    root.classList.toggle('dfyg-narrow', narrow);
    if (!world) return;
    const r = stage.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    world.resize(r.width, r.height, narrow ? 1.25 : 1.5);
    if (!rafId) world.render();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(layout) : null;
  if (ro) { ro.observe(root); ro.observe(stage); } else window.addEventListener('resize', layout);

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) ratio = en.isIntersecting ? en.intersectionRatio : 0;
    if (state === 'playing' && !visibleEnough()) pause();
    if (ratio <= 0) stop(); else kick();
  }, { threshold: [0, 0.01, 0.2, VISIBLE_MIN, 0.5, 0.75, 1] });
  io.observe(stage);
  const ioNear = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { ioNear.disconnect(); ensureWorld(); }
  }, { rootMargin: PRELOAD_MARGIN + ' 0px' });
  ioNear.observe(stage);

  root.addEventListener('click', onClick);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onCancel);
  stage.addEventListener('contextmenu', onMenu);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onDocVis);
  if (mqReduce) mqReduce.addEventListener ? mqReduce.addEventListener('change', onReduce) : mqReduce.addListener(onReduce);

  applyLang(); show('home'); setClasses(); layout();

  if (opts.debug) {
    container.__dfygDebug = {
      sim, CFG,
      state: () => state, ratio: () => ratio, world: () => world, rafRunning: () => rafId !== 0,
      stats: () => ({ frames: stats.frames, raf: stats.raf, workMs: stats.frames ? stats.work / stats.frames : 0 }),
      resetStats: () => { stats.frames = 0; stats.work = 0; stats.raf = 0; },
      ready: () => ensureWorld(),
    };
  }

  // ---------------------------------------------------------------- API
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    io.disconnect(); ioNear.disconnect();
    if (ro) ro.disconnect(); else window.removeEventListener('resize', layout);
    root.removeEventListener('click', onClick);
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointerup', onUp);
    stage.removeEventListener('pointercancel', onCancel);
    stage.removeEventListener('contextmenu', onMenu);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('visibilitychange', onDocVis);
    if (mqReduce) mqReduce.removeEventListener ? mqReduce.removeEventListener('change', onReduce) : mqReduce.removeListener(onReduce);
    if (world) { world.dispose(); world = null; }
    root.remove();
    removeStyle();
    if (container.__dfygDebug) delete container.__dfygDebug;
  }
  function setLang(l) {
    if (!TEXTS[l] || destroyed) return;
    lang = l; applyLang();
  }

  return { start, pause, resume, destroy, setLang };
}
