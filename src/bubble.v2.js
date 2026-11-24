/* Dream For You — la bulle de rêve, v2 (WebGL 1, un seul shader plein cadre).
   v2 : setOpen(0..1). À 1 la bulle couvre tout l'écran et montre sa source à plat (cadrage « cover », identique
   au film du vol) ; en revenant vers 0 le bord de verre entre dans l'écran et l'image se referme en bulle.
   Une seule toile, déplacée de scène en scène (héros, expériences, réservation) :
   un seul contexte WebGL pour tout le site. Le temps est réel (delta borné) : juste à 30 i/s comme à 120.
   API : const b = DFYBubble.create(); b.attach(stageEl, layout); b.show(sourceEl); b.setPaused(bool); b.setActive(bool); b.setOpen(0..1) */
(function () {
  'use strict';

  var VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  var FS = [
    'precision highp float;',
    'uniform vec2 uC;uniform float uR;uniform float uTime;',
    'uniform sampler2D uTexA;uniform sampler2D uTexB;uniform vec2 uAspA;uniform vec2 uAspB;',
    'uniform float uMix;uniform vec2 uPtr;uniform float uSeed;uniform float uWob;uniform float uDim;uniform float uZoom;uniform float uHalo;uniform float uSat;uniform float uSoft;uniform vec2 uRes;uniform vec2 uTc;uniform float uTr;uniform float uOpen;uniform float uFlat;',
    'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
    ' return mix(mix(h21(i),h21(i+vec2(1.,0.)),u.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),u.x),u.y);}',
    'float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}',
    'float shape(float a,float t){',
    ' float r=1.;',
    ' r+=.050*sin(2.*a+t*.55+uSeed);',
    ' r+=.034*sin(3.*a-t*.70+uSeed*1.9);',
    ' r+=.020*sin(5.*a+t*1.1+uSeed*3.1);',
    ' r+=uWob*(.045*sin(4.*a-t*2.6)+.025*sin(7.*a+t*3.4));',
    ' return r;}',
    // bulle principale + trois gouttelettes en orbite lente, fondues par smooth-min (métaballes)
    // gouttelette réduite à zéro près du bord du canevas : jamais coupée net
    'float fit(vec2 c,float rs){vec2 q=uC+c*uR;float e=min(min(q.x,q.y),min(uRes.x-q.x,uRes.y-q.y));return rs*smoothstep(rs*uR*1.3,rs*uR*3.2,e);}',
    'float sm(float d,vec2 p,vec2 c,float rs,float k){float r=fit(c,rs);return r>.004?smin(d,length(p-c)-r,k):d;}',
    'float sdf(vec2 p,float t){',
    ' float d=length(p)-shape(atan(p.y,p.x),t);',
    ' if(uSat>0.){',
    '  vec2 c1=vec2(cos(t*.17+uSeed),sin(t*.17+uSeed))*(1.42+.16*sin(t*.31+uSeed*2.));',
    '  vec2 c2=vec2(cos(-t*.12+uSeed*2.1+2.4),sin(-t*.12+uSeed*2.1+2.4))*(1.36+.14*sin(t*.23+uSeed));',
    '  vec2 c3=vec2(cos(t*.09+uSeed*.4+4.),sin(t*.09+uSeed*.4+4.))*(1.58+.1*sin(t*.4));',
    '  d=sm(d,p,c1,.085*uSat,.16);',
    '  d=sm(d,p,c2,.06*uSat,.14);',
    '  d=sm(d,p,c3,.04*uSat,.1);',
    ' }',
    ' return d;}',
    'vec3 tx(sampler2D s,vec2 asp,vec2 uv,vec2 off,float ca){',
    ' vec2 b=(uv-.5)*asp+.5;',
    ' float r=texture2D(s,b+off*(1.+ca)).r;',
    ' float g=texture2D(s,b+off).g;',
    ' float bl=texture2D(s,b+off*(1.-ca)).b;',
    ' return vec3(r,g,bl);}',
    'void main(){',
    ' vec2 p=(gl_FragCoord.xy-uC)/uR;',
    ' float t=uTime;',
    ' float sd=sdf(p,t);',
    ' float aa=1.6/uR;',
    ' float ins=1.-smoothstep(-aa,aa,sd);',
    ' float halo=exp(-max(sd,0.)*7.)*uHalo*(1.-ins);',
    ' if(ins<=0.){gl_FragColor=vec4(vec3(halo),halo);return;}',
    ' vec2 e=vec2(.006,0.);',
    ' vec2 g=vec2(sdf(p+e.xy,t)-sd,sdf(p+e.yx,t)-sd);',
    ' g=g/max(length(g),1e-5);',
    ' float depth=mix(clamp(-sd/.62,0.,1.),1.,uFlat);',
    ' float z=sqrt(1.-(1.-depth)*(1.-depth));',
    ' float q=1.-depth;',
    ' vec2 pt=(gl_FragCoord.xy-uTc)/uTr;',
    ' vec2 uv=pt*.5*(.86+.14*z)/uZoom+.5;',
    ' uv+=(vec2(sin(t*.06),cos(t*.045))*.016+uPtr*.03)*(1.-uOpen);',
    ' vec2 off=-g*pow(1.-z,1.6)*.15;',
    ' float ca=.12*q*q;',
    ' vec3 col=tx(uTexA,uAspA,uv,off,ca);',
    ' float front=0.;',
    ' if(uMix>0.){',
    '  vec3 cb=tx(uTexB,uAspB,uv,off,ca);',
    '  float n=vn(p*2.2+t*.15)*.65+vn(p*5.-t*.2)*.35;',
    '  float f=min(length(p),1.6)*.6+n*.35;',
    '  float th=uMix*1.35;',
    '  float m=1.-smoothstep(th-.07,th+.07,f);',
    '  m=mix(m,uMix,uSoft);',
    '  col=mix(col,cb,m);',
    '  front=(1.-smoothstep(0.,.05,abs(f-th)))*step(.001,uMix)*step(uMix,.999)*(1.-uSoft);',
    ' }',
    ' col*=mix(uDim,1.,uOpen);',
    ' col*=.78+.22*z;',
    ' col=mix(col,vec3(1.),pow(q,7.)*.26);',
    ' col+=smoothstep(.55,.985,q)*pow(max(dot(g,normalize(vec2(-.55,.83))),0.),3.)*.42;',
    ' vec2 sv=p-vec2(-.36,.44);',
    ' col+=exp(-dot(sv,sv)*22.)*.14*(1.-uOpen);',
    ' col+=vec3(.83,.16,.19)*smoothstep(.55,1.,q)*max(dot(g,vec2(.3,-.95)),0.)*.12;',
    ' col+=front*vec3(1.,.96,.92)*.55;',
    ' col+=(h21(gl_FragCoord.xy+fract(t*7.)*61.)-.5)*.035;',
    ' col=mix(col,vec3(1.),(1.-smoothstep(0.,aa*2.2,abs(sd)))*.32);',
    ' col=clamp(col,0.,1.);',
    ' gl_FragColor=vec4(col*ins+vec3(1.)*halo,max(ins,halo));',
    '}'
  ].join('\n');

  // Gabarits de placement par scène (fractions de la toile ; r en fraction du plus petit côté sauf indication)
  var LAYOUTS = {
    hero: function (w, h) {
      var m = w < 700;
      return { cx: m ? 0.5 : 0.64, cy: m ? 0.56 : 0.52, r: m ? Math.min(w * 0.38, h * 0.25) : Math.min(w * 0.24, h * 0.32), dim: 0.96, halo: 0.10, seed: 1.3, sat: 1 };
    },
    exp: function (w, h) {
      var m = w < 700;
      return { cx: 0.5, cy: m ? 0.47 : 0.5, r: m ? Math.min(w * 0.33, h * 0.34) : Math.min(w, h) * 0.33, dim: 1.0, halo: 0.08, seed: 4.2, sat: 1 };
    },
    book: function (w, h) {
      return { cx: 0.5, cy: 0.5, r: Math.max(w, h) * 0.47, rFrom: Math.min(w, h) * 0.30, dim: 0.6, halo: 0.0, seed: 7.7, sat: 0 };
    }
  };

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }

  function Bubble() {
    var c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    var gl = c.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('webgl');
    var pr = gl.createProgram();
    gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(pr);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ['uC', 'uR', 'uTime', 'uTexA', 'uTexB', 'uAspA', 'uAspB', 'uMix', 'uPtr', 'uSeed', 'uWob', 'uDim', 'uZoom', 'uHalo', 'uSat', 'uSoft', 'uRes', 'uTc', 'uTr', 'uOpen', 'uFlat'].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
    gl.uniform1i(U.uTexA, 0);
    gl.uniform1i(U.uTexB, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.clearColor(0, 0, 0, 0);

    this.c = c; this.gl = gl; this.U = U;
    this.cache = new Map();
    this.cur = null; this.next = null; this.trans = 0; this.transDur = 1.05; this.soft = 0;
    this.t = Math.random() * 20; this.last = 0; this.raf = 0;
    this.active = false; this.paused = false; this.lost = false;
    this.wob = 0.6; this.ptr = [0, 0]; this.ptrT = [0, 0];
    this.layoutName = 'exp'; this.L = null; this.r = 0; this.rT = 0; this.dim = 1; this.dimT = 1;
    this.w = 1; this.h = 1; this.dpr = 1; this.open = 0;
    var self = this;
    this.loop = function (now) { self.frame(now); };
    this.ro = new ResizeObserver(function () { self.resize(); });
    c.addEventListener('webglcontextlost', function (e) { e.preventDefault(); self.lost = true; self.stop(); if (self.onlost) self.onlost(); });
  }

  Bubble.prototype.attach = function (container, layoutName) {
    if (this.host === container && this.layoutName === layoutName) return;
    if (this.host) this.ro.unobserve(this.host);
    this.host = container;
    this.layoutName = layoutName;
    container.appendChild(this.c);
    this.ro.observe(container);
    this.resize(true);
    if (layoutName === 'book' && this.L && this.L.rFrom) { this.r = this.L.rFrom; } // grandit vers le plein écran
    this.wob = 1;
  };

  Bubble.prototype.resize = function (snap) {
    if (!this.host) return;
    var w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (w * h * dpr * dpr > 2.4e6) dpr = Math.sqrt(2.4e6 / (w * h));
    this.w = w; this.h = h; this.dpr = dpr;
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (this.c.width !== W || this.c.height !== H) { this.c.width = W; this.c.height = H; }
    this.L = LAYOUTS[this.layoutName](w, h);
    this.rT = this.L.r;
    this.dimT = this.L.dim;
    if (snap || !this.r) { this.r = this.rT; this.dim = this.dimT; }
    this.gl.viewport(0, 0, W, H);
    if (!this.raf) this.draw();
  };

  Bubble.prototype.tex = function (el) {
    var gl = this.gl, e = this.cache.get(el);
    if (e) return e;
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([19, 33, 26, 255]));
    e = { t: t, el: el, video: el.tagName === 'VIDEO', ready: false, aw: 1, ah: 1, lastT: -1 };
    this.cache.set(el, e);
    return e;
  };

  Bubble.prototype.upload = function (e) {
    var el = e.el, gl = this.gl;
    if (e.video) {
      if (el.readyState < 2 || !el.videoWidth) return;
      if (e.ready && el.currentTime === e.lastT) return;
      e.lastT = el.currentTime;
      e.aw = el.videoWidth; e.ah = el.videoHeight;
    } else {
      if (e.ready) return;
      if (!el.complete || !el.naturalWidth) return;
      e.aw = el.naturalWidth; e.ah = el.naturalHeight;
    }
    gl.bindTexture(gl.TEXTURE_2D, e.t);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el); e.ready = true; } catch (err) { /* vidéo pas encore décodable */ }
  };

  function asp(e) { var ta = e.aw / e.ah; return ta > 1 ? [1 / ta, 1] : [1, ta]; }

  // Montre une source (img ou video). La première s'affiche directement, les suivantes par une vague liquide.
  Bubble.prototype.show = function (el, instant) {
    if (!el) return;
    var e = this.tex(el);
    if (this.cur === e && !this.next) return;
    this.soft = 0; this.transDur = 1.05;
    if (!this.cur || instant) { this.cur = e; this.next = null; this.trans = 0; this.wob = 1; this.kick(); return; }
    if (this.next === e) return;
    if (this.next) { this.cur = this.next; }
    this.next = e; this.trans = 0.0001; this.kick();
  };

  // Remplace la source visee sans vague (ex. l'image fixe par sa video, dont la 1re image est identique).
  // Pendant une vague, la vidéo prend la place de la cible ; sinon fondu doux de 0,6 s (pas de vague).
  Bubble.prototype.swap = function (el) {
    var e = this.tex(el);
    if (this.cur === e && !this.next) return;
    if (this.next) { if (!this.soft) { this.next = e; this.kick(); return; } this.cur = this.next; }
    this.next = e; this.soft = 1; this.transDur = 0.6; this.trans = 0.0001; this.kick();
  };

  Bubble.prototype.pointer = function (x, y) { this.ptrT[0] = x; this.ptrT[1] = y; this.kick(); };
  Bubble.prototype.setPaused = function (p) { this.paused = p; this.kick(); };
  // 0 = bulle normale ; 1 = plein écran, image à plat. Piloté par le vol du hero (flight.v2.js).
  Bubble.prototype.setOpen = function (v) { v = Math.max(0, Math.min(1, v)); if (v === this.open) return; this.open = v; if (this.raf) return; if (this.active) this.kick(); else this.draw(); };
  Bubble.prototype.setActive = function (a) { this.active = a; if (a) this.kick(); else this.stop(); };
  Bubble.prototype.kick = function () {
    if (this.lost || !this.active || this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  };
  Bubble.prototype.stop = function () { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; };

  Bubble.prototype.frame = function (now) {
    this.raf = 0;
    if (!this.active || this.lost) return;
    var dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    var moving = false;
    if (!this.paused) { this.t += dt; moving = true; }
    if (this.next) {
      this.trans = Math.min(1, this.trans + dt / this.transDur);
      if (this.trans >= 1) { this.cur = this.next; this.next = null; this.trans = 0; this.soft = 0; this.transDur = 1.05; }
      moving = true;
    }
    var wobT = this.next && !this.soft ? 1 : 0;
    this.wob += (wobT - this.wob) * (1 - Math.exp(-dt * (this.next ? 6 : 1.6)));
    var k = 1 - Math.exp(-dt * 2.2);
    if (Math.abs(this.rT - this.r) > 0.5) { this.r += (this.rT - this.r) * k; moving = true; } else this.r = this.rT;
    this.dim += (this.dimT - this.dim) * k;
    var kp = 1 - Math.exp(-dt * 3);
    this.ptr[0] += (this.ptrT[0] - this.ptr[0]) * kp;
    this.ptr[1] += (this.ptrT[1] - this.ptr[1]) * kp;
    if (Math.abs(this.ptrT[0] - this.ptr[0]) + Math.abs(this.ptrT[1] - this.ptr[1]) > 0.002) moving = true;
    if (this.cur && this.cur.video && !this.cur.el.paused) moving = true;
    this.draw();
    if (moving) this.raf = requestAnimationFrame(this.loop);
  };

  Bubble.prototype.draw = function () {
    var gl = this.gl, U = this.U, L = this.L;
    if (!L || this.lost) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.cur) return;
    this.upload(this.cur);
    if (this.next) this.upload(this.next);
    if (!this.cur.ready) return;
    var d = this.dpr, W = this.c.width, H = this.c.height;
    var cx = this.w * L.cx * d, cy = this.h * (1 - L.cy) * d;
    var rD = this.r * d, zoom = 1.07 + 0.035 * Math.sin(this.t * 0.11);
    var tcx = cx, tcy = cy, tr = rD, ow = 0, flat = 0, o = this.open;
    if (o > 0.0005) {
      // rayon plein écran : le bord est juste hors champ, il entre dès que la bulle se referme ; `flat` éteint la lentille
      var far = Math.sqrt(Math.pow(Math.max(cx, W - cx), 2) + Math.pow(Math.max(cy, H - cy), 2));
      rD = rD * Math.pow((far * 1.04) / rD, o);
      flat = Math.max(0, Math.min(1, (o - 0.76) / 0.24)); flat *= flat;
      var ta = this.cur.aw / this.cur.ah;
      var eFlat = (ta >= 1 ? Math.max(H, W / ta) : Math.max(W, H * ta)) / 2;   // demi petit côté de la source en « cover »
      var rB = eFlat / zoom;                                                 // en dessous : cadrage de bulle
      ow = Math.max(0, Math.min(1, (rD - rB) / (0.8 * rB))); ow = ow * ow * (3 - 2 * ow);
      zoom = zoom + (1 - zoom) * ow;
      tr = Math.min(eFlat, rD * zoom) / zoom;
      tcx = cx + (W / 2 - cx) * ow; tcy = cy + (H / 2 - cy) * ow;
    }
    var late = 1 - Math.min(1, o / 0.25);
    gl.uniform2f(U.uC, cx, cy);
    gl.uniform1f(U.uR, rD);
    gl.uniform2f(U.uTc, tcx, tcy);
    gl.uniform1f(U.uTr, tr);
    gl.uniform1f(U.uOpen, ow);
    gl.uniform1f(U.uFlat, flat);
    gl.uniform1f(U.uTime, this.t);
    gl.uniform1f(U.uSeed, L.seed);
    gl.uniform1f(U.uWob, this.wob);
    gl.uniform1f(U.uDim, this.dim);
    gl.uniform1f(U.uHalo, L.halo * (1 - ow));
    gl.uniform1f(U.uSat, L.sat * late * late);
    gl.uniform1f(U.uSoft, this.soft);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uZoom, zoom);
    gl.uniform2f(U.uPtr, this.ptr[0], this.ptr[1]);
    var a = asp(this.cur);
    gl.uniform2f(U.uAspA, a[0], a[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cur.t);
    var mix = 0;
    if (this.next && this.next.ready) {
      var b = asp(this.next);
      gl.uniform2f(U.uAspB, b[0], b[1]);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.next.t);
      var x = this.trans; mix = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    } else if (this.next) { this.trans = 0.0001; }
    gl.uniform1f(U.uMix, mix);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  window.DFYBubble = {
    create: function () { try { return new Bubble(); } catch (e) { return null; } }
  };
})();
