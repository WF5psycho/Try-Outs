// App wiring: parameters, UI, sun/sky model, main loop, screenshot API.
'use strict';

const VIEWS = {
  exterior:   { label: 'Exterior · north-west', pos: [-40, 1.6, -36], target: [-4, 5.5, -8], fly: false },
  approach:   { label: 'Exterior · front drive', pos: [-24, 1.1, 40], target: [0, 5.5, 4], fly: false },
  aerial:     { label: 'Exterior · aerial', pos: [-46, 30, -40], target: [0, 4, 0], fly: true },
  greathall:  { label: 'Great hall · fireplace', pos: [2.6, 1.62, -7.6], target: [-14.5, 1.6, -4.4], fly: false },
  greathall2: { label: 'Great hall · windows', pos: [-12.6, 1.62, -0.9], target: [0, 3.0, -9.5], fly: false },
  library:    { label: 'Library', pos: [5.0, 1.62, -1.2], target: [14.5, 1.2, -8.5], fly: false },
  kitchen:    { label: 'Kitchen', pos: [-4.1, 1.62, 9.45], target: [-14.5, 1.0, 3.0], fly: false },
  entrance:   { label: 'Entrance hall', pos: [1.5, 1.62, 9.5], target: [1.5, 1.4, 0], fly: false },
  bedroom:    { label: 'Bedroom', pos: [6.9, 1.62, 9.4], target: [14.6, 0.9, 3.4], fly: false },
};

const DEFAULTS = {
  time: 16.2, sunRot: 330, season: 0.55,
  cloud: 0.3, cloudDrift: 0.0, rain: 0.0, haze: 0.12, dust: 0.35,
  warmth: 2700, lampI: 1.0, fireI: 1.0,
  ev: 0.0, debug: 0, bounces: 3, resScale: 0.6, denoise: 1.0, fov: 68, bloom: 0.035, grain: 0.01, animate: 0,
};

const SLIDERS = [
  ['Sun & sky', [
    ['time', 'Time of day', 4, 22, 0.05, v => { const h = Math.floor(v), m = Math.round((v - h) * 60); return `${h}:${String(m).padStart(2, '0')}`; }],
    ['sunRot', 'Sun azimuth (orientation)', 0, 360, 1, v => `${v.toFixed(0)}°`],
    ['season', 'Season (winter → summer)', 0, 1, 0.01, v => ['Winter', 'Early spring', 'Spring', 'Summer'][Math.min(3, Math.floor(v * 4))]],
  ]],
  ['Weather', [
    ['cloud', 'Cloud cover', 0, 1, 0.01, v => `${Math.round(v * 100)}%`],
    ['cloudDrift', 'Cloud drift', 0, 10, 0.01, v => v.toFixed(2)],
    ['rain', 'Rain / wetness', 0, 1, 0.01, v => `${Math.round(v * 100)}%`],
    ['haze', 'Fog / haze', 0, 1, 0.01, v => `${Math.round(v * 100)}%`],
    ['dust', 'Interior dust (light shafts)', 0, 2, 0.01, v => v.toFixed(2)],
  ]],
  ['Interior lighting', [
    ['warmth', 'Lamp warmth', 1800, 4500, 10, v => `${v.toFixed(0)} K`],
    ['lampI', 'Lamp & candle intensity', 0, 3, 0.01, v => `${Math.round(v * 100)}%`],
    ['fireI', 'Fireplace intensity', 0, 3, 0.01, v => `${Math.round(v * 100)}%`],
  ]],
  ['Camera & quality', [
    ['ev', 'Exposure compensation', -3, 3, 0.05, v => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`],
    ['fov', 'Field of view', 35, 100, 1, v => `${v.toFixed(0)}°`],
    ['bounces', 'Light bounces (GI depth)', 1, 6, 1, v => v.toFixed(0)],
    ['resScale', 'Render resolution', 0.25, 1, 0.05, v => `${Math.round(v * 100)}%`],
    ['denoise', 'Denoiser strength', 0, 2, 0.05, v => v === 0 ? 'off' : v.toFixed(2)],
    ['bloom', 'Lens bloom', 0, 0.2, 0.005, v => v.toFixed(3)],
    ['animate', 'Animate fire & clouds', 0, 1, 1, v => v ? 'on' : 'off'],
  ]],
];

const P = Object.assign({}, DEFAULTS);

// ---------------------------------------------------------------- sun + sky model
const ATM = { Rg: 6371e3, Ra: 6471e3, bR: [5.8e-6, 13.5e-6, 33.1e-6] };
function sunDirection(time, season, rotDeg) {
  const lat = 51.5 * Math.PI / 180;
  const decl = (season * 2 - 1) * 23.44 * Math.PI / 180;
  const H = (time - 12) * 15 * Math.PI / 180;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(sinEl);
  let cosAz = (Math.sin(decl) - sinEl * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat));
  cosAz = Math.max(-1, Math.min(1, cosAz));
  let az = Math.acos(cosAz);
  if (H > 0) az = 2 * Math.PI - az;
  const a = az + rotDeg * Math.PI / 180;
  return [Math.cos(el) * Math.sin(a), Math.sin(el), Math.cos(el) * Math.cos(a)];
}
function sunTransmittance(dir, haze) {
  const bM = 21e-6 * (1 + haze * 6), Hm = 1200 * (1 + haze * 0.6);
  const r0 = [0, ATM.Rg + 2, 0];
  const b = 2 * V.dot(dir, r0), c = V.dot(r0, r0) - ATM.Ra * ATM.Ra;
  const t = (-b + Math.sqrt(b * b - 4 * c)) / 2;
  // blocked by planet?
  const cg = V.dot(r0, r0) - ATM.Rg * ATM.Rg;
  const dg = b * b - 4 * cg;
  if (dg > 0 && (-b - Math.sqrt(dg)) / 2 > 0) return [0, 0, 0];
  const N = 64; let odR = 0, odM = 0;
  for (let i = 0; i < N; i++) {
    const x = V.add(r0, V.mul(dir, (i + 0.5) * t / N));
    const h = V.len(x) - ATM.Rg;
    odR += Math.exp(-h / 8000) * t / N; odM += Math.exp(-h / Hm) * t / N;
  }
  return ATM.bR.map(br => Math.exp(-(br * odR + bM * 1.1 * odM)));
}

function computeSky() {
  const sunDir = sunDirection(P.time, P.season, P.sunRot);
  const E0 = 11.5;
  const Tr = sunTransmittance(sunDir, P.haze);
  // sun below horizon fades smoothly (penumbra of the solar disc)
  const fade = Math.max(0, Math.min(1, (sunDir[1] + 0.01) / 0.02));
  const sunEClear = Tr.map(t => t * E0 * fade);
  const lumSun = 0.2126 * sunEClear[0] + 0.7152 * sunEClear[1] + 0.0722 * sunEClear[2];
  const twilight = 0.03 * Math.max(0, Math.min(1, (sunDir[1] + 0.12) / 0.2));
  const Eoc = 0.32 * lumSun * Math.max(sunDir[1], 0) + twilight + 0.0004;
  const Lz = Eoc * 9 / (7 * Math.PI);
  const cloudDim = 1 - 0.25 * P.cloud;
  return {
    sunDir, E0, sunEClear, sunE: sunEClear.map(v => v * cloudDim), Lz,
    sunCos: Math.cos(0.0047 * (1 + P.haze * 2)),
    cloud: P.cloud, haze: P.haze,
  };
}

function buildLightUniforms(lights, t) {
  const lamp = kelvinRGB(P.warmth), candle = kelvinRGB(1850), fire = kelvinRGB(1750);
  const pos = new Float32Array(48 * 4), col = new Float32Array(48 * 4);
  let n = 0;
  lights.forEach((L, i) => {
    if (n >= 48) return;
    let c, s;
    if (L.group === 'fire') {
      c = fire; s = P.fireI;
      if (P.animate) s *= 0.8 + 0.2 * Math.sin(t * 9 + i * 1.7) * Math.sin(t * 5.3 + i);
    } else if (L.group === 'candle') { c = candle; s = P.lampI; }
    else { c = lamp; s = P.lampI; }
    const pw = L.power * s;
    if (pw <= 0) return;
    pos.set([L.p[0], L.p[1], L.p[2], L.r], n * 4);
    col.set([c[0] * pw, c[1] * pw, c[2] * pw, pw], n * 4);
    n++;
  });
  return { pos, col, n, lamp, candle, fire };
}

// ---------------------------------------------------------------- app
const App = {
  init() {
    this.canvas = document.getElementById('view');
    this.status = document.getElementById('status');
    this.qs = new URLSearchParams(location.search);
    this.shot = this.qs.has('shot');
    try {
      const t0 = performance.now();
      const scene = buildScene();
      const bvh = buildBVH(scene.prims);
      this.scene = scene;
      const pd = new Float32Array(48 * 4); let np = 0;
      for (const pt of scene.portals.slice(0, 16)) {
        const area = 4 * V.len(pt.u) * V.len(pt.v);
        const nn = V.norm(V.cross(pt.u, pt.v));
        const sgn = V.dot(nn, pt.n) >= 0 ? 1 : -1;
        pd.set([...pt.c, area, ...pt.u, sgn, ...pt.v, 0], np * 12);
        np++;
      }
      this.portalData = { n: np, data: pd };
      this.renderer = new Renderer(this.canvas);
      this.renderer.init();
      this.renderer.setScene(bvh);
      this.controls = new Controls(this.canvas, scene.prims);
      this.controls.onMode = () => this.updateModeLabel();
      console.log(`scene: ${scene.prims.length} prims, ${scene.lights.length} lights, ${bvh.nodeCount} nodes, built in ${(performance.now() - t0).toFixed(0)} ms`);
      this.info = `${scene.prims.length} primitives · ${scene.lights.length} lights`;
    } catch (e) {
      console.error(e);
      document.getElementById('error').textContent = String(e.message || e);
      document.getElementById('error').style.display = 'block';
      window.__castleError = String(e.message || e);
      return;
    }
    for (const [k, v] of this.qs) if (k in P) P[k] = parseFloat(v);
    this.buildUI();
    this.controls.setView(VIEWS[this.qs.get('view') || 'exterior'] || VIEWS.exterior);
    this.skyDirty = true;
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 0;
    window.addEventListener('resize', () => this.resize());
    this.resize();
    window.castleAPI = this.api();
    if (!this.shot) requestAnimationFrame((t) => this.loop(t));
    window.__castleReady = true;
  },

  resize() {
    const dpr = this.shot ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    this.canvas.width = w; this.canvas.height = h;
    this.renderer.resize(w * P.resScale, h * P.resScale);
  },

  buildUI() {
    const panel = document.getElementById('sliders');
    this.inputs = {};
    for (const [group, items] of SLIDERS) {
      const g = document.createElement('fieldset');
      const lg = document.createElement('legend'); lg.textContent = group; g.appendChild(lg);
      for (const [key, label, mn, mx, st, fmt] of items) {
        const row = document.createElement('label'); row.className = 'row';
        const name = document.createElement('span'); name.textContent = label;
        const val = document.createElement('output');
        const inp = document.createElement('input');
        inp.type = 'range'; inp.min = mn; inp.max = mx; inp.step = st; inp.value = P[key];
        val.textContent = fmt(P[key]);
        inp.addEventListener('input', () => {
          P[key] = parseFloat(inp.value); val.textContent = fmt(P[key]);
          this.onParam(key);
        });
        row.appendChild(name); row.appendChild(val); row.appendChild(inp);
        g.appendChild(row);
        this.inputs[key] = { inp, val, fmt };
      }
      panel.appendChild(g);
    }
    // weather presets
    const pre = document.getElementById('presets');
    const W = {
      'Clear': { cloud: 0.0, rain: 0, haze: 0.08 },
      'Fair': { cloud: 0.3, rain: 0, haze: 0.12 },
      'Overcast': { cloud: 0.85, rain: 0.1, haze: 0.25 },
      'Rain': { cloud: 1.0, rain: 1.0, haze: 0.4 },
      'Fog': { cloud: 0.7, rain: 0.3, haze: 1.0 },
    };
    for (const [name, vals] of Object.entries(W)) {
      const b = document.createElement('button'); b.textContent = name;
      b.onclick = () => { this.set(vals); };
      pre.appendChild(b);
    }
    const tp = document.getElementById('times');
    for (const [name, t] of [['Dawn', 6.4], ['Morning', 9.5], ['Noon', 13], ['Afternoon', 16.2], ['Golden hour', 18.4], ['Dusk', 19.6], ['Night', 22]]) {
      const b = document.createElement('button'); b.textContent = name;
      b.onclick = () => this.set({ time: t });
      tp.appendChild(b);
    }
    const rooms = document.getElementById('rooms');
    for (const [k, v] of Object.entries(VIEWS)) {
      const b = document.createElement('button'); b.textContent = v.label;
      b.onclick = () => { this.controls.setView(v); this.updateModeLabel(); };
      rooms.appendChild(b);
    }
    document.getElementById('toggleUI').onclick = () => document.body.classList.toggle('hideui');
    document.getElementById('mode').onclick = () => { this.controls.fly = !this.controls.fly; this.controls.changed = true; this.updateModeLabel(); };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH') document.body.classList.toggle('hideui');
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) { const v = Object.values(VIEWS)[n - 1]; if (v) { this.controls.setView(v); this.updateModeLabel(); } }
    });
    // touch walk buttons
    const tw = document.getElementById('touchwalk');
    const hold = (el, v) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.controls.touchMove = v; });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => { this.controls.touchMove = 0; }));
    };
    hold(tw.children[0], 1); hold(tw.children[1], -1);
    this.updateModeLabel();
  },

  updateModeLabel() { document.getElementById('mode').textContent = this.controls.fly ? 'Mode: fly (F)' : 'Mode: walk (F)'; },

  set(vals) {
    for (const [k, v] of Object.entries(vals)) {
      P[k] = v;
      const i = this.inputs && this.inputs[k];
      if (i) { i.inp.value = v; i.val.textContent = i.fmt(v); }
      this.onParam(k);
    }
  },

  onParam(key) {
    if (key === 'resScale') this.resize();
    if (['time', 'sunRot', 'season', 'cloud', 'haze'].includes(key)) this.skyDirty = true;
    if (key === 'fov') this.controls.fov = P.fov;
    this.renderer.reset();
  },

  frameParams(t) {
    if (this.skyDirty) { this.sky = computeSky(); this.renderer.renderSky(this.sky); this.skyDirty = false; }
    const Ls = buildLightUniforms(this.scene.lights, t);
    const S = this.sky;
    return {
      sunDir: S.sunDir, sunE: S.sunE, sunEClear: S.sunEClear, sunCos: S.sunCos,
      cloud: P.cloud, cloudOff: [P.cloudDrift * 0.7 + (P.animate ? t * 0.004 : 0), P.cloudDrift * 0.3], wet: P.rain, haze: P.haze, dust: P.dust,
      time: P.animate ? t : 0.0,
      numLights: Ls.n, lightPos: Ls.pos, lightCol: Ls.col,
      fireCol: Ls.fire, lampCol: Ls.lamp, candleCol: Ls.candle, fireI: P.fireI, lampI: P.lampI,
      bounces: this.moving ? Math.min(P.bounces, 2) : P.bounces, debug: P.debug,
      numPortals: this.portalData.n, portals: this.portalData.data,
    };
  },

  renderOnce(t, extra = {}) {
    this.controls.fov = P.fov;
    const C = this.controls.basis();
    const S = this.frameParams(t);
    this.renderer.render(C, S, Object.assign({
      denoise: P.denoise > 0, denoiseStrength: P.denoise, autoExposure: true, ev: P.ev,
      bloom: P.bloom, grain: P.grain, minBlend: P.animate ? 1 / 24 : 0,
    }, extra));
  },

  loop(now) {
    const dt = (now - this.last) / 1000; this.last = now;
    const moved = this.controls.update(dt);
    if (moved) { this.renderer.reset(); this.lastMove = now; }
    // lighter paths while the camera is moving keeps navigation fluid; full quality once still
    this.moving = now - (this.lastMove || 0) < 120;
    if (this.wasMoving && !this.moving) this.renderer.reset();
    this.wasMoving = this.moving;
    const maxSpp = 4096;
    if (this.renderer.spp < maxSpp || P.animate) this.renderOnce(now / 1000);
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    const p = this.controls.pos;
    this.status.textContent = `${this.fps.toFixed(0)} fps · ${this.renderer.spp} spp · ${this.renderer.W}×${this.renderer.H} · pos ${p.map(v => v.toFixed(1)).join(', ')} · ${this.info}`;
    requestAnimationFrame((t) => this.loop(t));
  },

  api() {
    const self = this;
    return {
      views: Object.keys(VIEWS),
      setView(name) { self.controls.setView(typeof name === 'string' ? VIEWS[name] : name); self.renderer.reset(); },
      set(vals) { self.set(vals); },
      // render N samples synchronously (in tiles) and resolve when done
      async render(spp, tiles = 1) {
        self.renderer.reset();
        self.renderer.logAvg = null;
        const t0 = performance.now();
        for (let i = 0; i < spp; i++) {
          self.renderOnce(0, { tiles, snapExposure: i < 3, meterEvery: 1 });
          if (i % 2 === 1) await new Promise(r => setTimeout(r, 0));
        }
        self.renderer.gl.finish();
        return { ms: performance.now() - t0, spp: self.renderer.spp, exposure: self.renderer.exposure };
      },
      stats() { return { prims: self.scene.prims.length, lights: self.scene.lights.length, W: self.renderer.W, H: self.renderer.H }; },
    };
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
