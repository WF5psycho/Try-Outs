// Castle scene description: analytic primitives + lights.
// Units: metres. +y up. Interior floor at y=0, exterior ground at y=-0.5.
'use strict';

const T = { BOX: 0, RBOX: 1, CYL: 2, ELL: 3, CONE: 4 };
const F = { CAMONLY: 1, TRANS: 2, NOSHADOW: 4, POROUS: 8 };
const M = {
  STONE: 0, STONE_TRIM: 1, OAK_FLOOR: 2, FLAGSTONE: 3, BEAM: 4, PLASTER: 5, LINEN: 6, WOOL: 7,
  LEATHER: 8, WOOD: 9, BRASS: 10, IRON: 11, GLASS: 12, BOOKS: 13, RUG: 14, FIRE: 15, WAX: 16,
  FLAME: 17, SHADE: 18, GROUND: 19, BOARDS: 20, SLATE: 21, HEDGE: 22, COPPER: 23, CERAMIC: 24,
  SOOT: 25, PAINTED: 26, MARBLE: 27, LOG: 28, PAINTING: 29, GILT: 30, ENAMEL: 31, CHROME: 32,
  MIRROR: 33, LEAD: 34, TERRACOTTA: 35, PEWTER: 36, BULB: 37, PLAIN: 38, GLOBE: 39, MEADOW: 40,
};

function packColor(hex) {
  if (!hex) return 0;
  const v = parseInt(hex.replace('#', ''), 16);
  return v === 0 ? 1 : v;
}

function buildScene() {
  const prims = [];
  const lights = [];
  const portals = [];   // window openings (inner wall face) used for skylight sampling
  const rand = mulberry32(1337);
  let X = { t: [0, 0, 0], q: [0, 0, 0, 1] };
  const stack = [];

  function push(t, yaw = 0) {
    stack.push(X);
    X = { t: V.add(X.t, Q.rot(X.q, t)), q: Q.mul(X.q, Q.axisAngle([0, 1, 0], yaw)) };
  }
  function pop() { X = stack.pop(); }

  function add(type, c, h, mat, o = {}) {
    const q0 = o.q || (o.rot ? Q.euler(o.rot) : [0, 0, 0, 1]);
    const p = {
      type, mat,
      c: V.add(X.t, Q.rot(X.q, c)),
      h: h.slice(),
      q: Q.mul(X.q, q0),
      p0: o.r || 0,
      seed: o.seed !== undefined ? o.seed : Math.floor(rand() * 1000) / 10,
      col: packColor(o.col),
      extra: o.x || 0,
      flags: o.flags || 0,
    };
    p.collide = o.collide !== undefined ? o.collide : !(p.flags & (F.CAMONLY | F.NOSHADOW));
    prims.push(p);
    return p;
  }
  const box = (x0, y0, z0, x1, y1, z1, mat, o) => {
    const hx = Math.abs(x1 - x0) / 2, hy = Math.abs(y1 - y0) / 2, hz = Math.abs(z1 - z0) / 2;
    const mh = Math.min(hx, hy, hz);
    if ((mat === M.WOOD || mat === M.PAINTED || mat === M.ENAMEL) && mh > 0.008)
      return add(T.RBOX, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [hx, hy, hz], mat, Object.assign({}, o, { r: Math.min(0.012, mh * 0.45) }));
    return add(T.BOX, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2], mat, o);
  };
  const cbox = (cx, cy, cz, hx, hy, hz, mat, o) => add(T.BOX, [cx, cy, cz], [hx, hy, hz], mat, o);
  const rbox = (cx, cy, cz, hx, hy, hz, r, mat, o = {}) => add(T.RBOX, [cx, cy, cz], [hx, hy, hz], mat, Object.assign({}, o, { r }));
  const cyl = (cx, cy, cz, r, hh, mat, o) => add(T.CYL, [cx, cy, cz], [r, hh, r], mat, o);
  const post = (x, y0, z, r, h, mat, o) => add(T.CYL, [x, y0 + h / 2, z], [r, h / 2, r], mat, o);
  const ell = (cx, cy, cz, rx, ry, rz, mat, o) => add(T.ELL, [cx, cy, cz], [rx, ry, rz], mat, o);
  const cone = (cx, cy, cz, ra, hh, rb, mat, o) => add(T.CONE, [cx, cy, cz], [ra, hh, rb], mat, o);
  // oriented box from point a to point b (local z along a->b), width along local x, height along local y
  function beam(a, b, w, hgt, mat, up = [0, 1, 0], o = {}) {
    const z = V.norm(V.sub(b, a));
    let x = V.cross(up, z);
    if (V.len(x) < 1e-4) x = V.cross([1, 0, 0], z);
    x = V.norm(x);
    const y = V.cross(z, x);
    const c = V.mul(V.add(a, b), 0.5);
    return add(T.BOX, c, [w / 2, hgt / 2, V.len(V.sub(b, a)) / 2], mat, Object.assign({}, o, { q: Q.fromBasis(x, y, z) }));
  }
  // cylinder from a to b (local y along a->b)
  function rod(a, b, r, mat, o = {}) {
    const y = V.norm(V.sub(b, a));
    let x = V.cross(y, [0, 0, 1]);
    if (V.len(x) < 1e-4) x = V.cross(y, [1, 0, 0]);
    x = V.norm(x);
    const z = V.cross(x, y);
    const c = V.mul(V.add(a, b), 0.5);
    return add(T.CYL, c, [r, V.len(V.sub(b, a)) / 2, r], mat, Object.assign({}, o, { q: Q.fromBasis(x, y, z) }));
  }
  function light(p, r, power, group) {
    lights.push({ p: V.add(X.t, Q.rot(X.q, p)), r, power, group });
  }

  // ---------------------------------------------------------------- walls
  // Walls with rectangular openings (openings may be stacked vertically in the same column).
  function wallSegments(a0, a1, y0, y1, openings, emit) {
    const xs = new Set([a0, a1]);
    for (const o of openings) { xs.add(Math.max(a0, Math.min(a1, o.a))); xs.add(Math.max(a0, Math.min(a1, o.b))); }
    const bps = [...xs].sort((p, q) => p - q);
    for (let k = 0; k < bps.length - 1; k++) {
      const xa = bps[k], xb = bps[k + 1];
      if (xb - xa < 1e-6) continue;
      const cov = openings.filter(o => o.a <= xa + 1e-6 && o.b >= xb - 1e-6).sort((p, q) => p.y0 - q.y0);
      let y = y0;
      for (const o of cov) { if (o.y0 > y) emit(xa, xb, y, o.y0); y = Math.max(y, o.y1); }
      if (y < y1) emit(xa, xb, y, y1);
    }
  }
  // wall perpendicular to z (runs along x)
  function wallAlongX(x0, x1, y0, y1, z0, z1, mat, openings = []) {
    wallSegments(x0, x1, y0, y1, openings, (a, b, ya, yb) => box(a, ya, z0, b, yb, z1, mat));
  }
  // wall perpendicular to x (runs along z)
  function wallAlongZ(z0, z1, y0, y1, x0, x1, mat, openings = []) {
    wallSegments(z0, z1, y0, y1, openings, (a, b, ya, yb) => box(x0, ya, a, x1, yb, b, mat));
  }

  // A window set into a wall. axis 'z': wall spans z in [zin, zout] (zout outside), window centred at x=c.
  // axis 'x': wall spans x in [xin, xout], window centred at z=c.
  function windowUnit(axis, inner, outer, c, w, y0, y1, opt = {}) {
    const dir = Math.sign(outer - inner); // +1 if outside is at larger coordinate
    const glassPos = outer - dir * 0.32;
    const trimOut = outer + dir * 0.04;
    const mull = opt.mullion !== false;
    const transoms = opt.transoms || [];
    // portal at the inner face of the opening, normal pointing into the room
    // (placed at the glass plane so the window reveals are lit through the portal too)
    if (opt.upper) {}
    else if (axis === 'z') portals.push({ c: [c, (y0 + y1) / 2, glassPos - dir * 0.007], u: [w / 2, 0, 0], v: [0, (y1 - y0) / 2, 0], n: [0, 0, -dir] });
    else portals.push({ c: [glassPos - dir * 0.007, (y0 + y1) / 2, c], u: [0, 0, w / 2], v: [0, (y1 - y0) / 2, 0], n: [-dir, 0, 0] });
    const place = (a0, a1, yy0, yy1, d0, d1, mat, o) => {
      if (axis === 'z') box(a0, yy0, Math.min(d0, d1), a1, yy1, Math.max(d0, d1), mat, o);
      else box(Math.min(d0, d1), yy0, a0, Math.max(d0, d1), yy1, a1, mat, o);
    };
    // glass pane (thin)
    place(c - w / 2, c + w / 2, y0, y1, glassPos - 0.006, glassPos + 0.006, M.GLASS, { flags: F.TRANS, collide: true, x: opt.plain ? 1 : 0 });
    // stone mullion + transoms (dressed stone)
    if (mull) place(c - 0.07, c + 0.07, y0, y1, glassPos - 0.16 * dir, glassPos + 0.1 * dir, M.STONE_TRIM);
    for (const ty of transoms) place(c - w / 2, c + w / 2, ty - 0.06, ty + 0.06, glassPos - 0.16 * dir, glassPos + 0.1 * dir, M.STONE_TRIM);
    // exterior dressed surround (jambs, head, sill) and a drip mould
    place(c - w / 2 - 0.22, c - w / 2, y0 - 0.05, y1 + 0.22, outer, trimOut, M.STONE_TRIM);
    place(c + w / 2, c + w / 2 + 0.22, y0 - 0.05, y1 + 0.22, outer, trimOut, M.STONE_TRIM);
    place(c - w / 2 - 0.22, c + w / 2 + 0.22, y1, y1 + 0.26, outer, trimOut, M.STONE_TRIM);
    place(c - w / 2 - 0.34, c + w / 2 + 0.34, y1 + 0.26, y1 + 0.38, outer, outer + dir * 0.14, M.STONE_TRIM);
    place(c - w / 2 - 0.12, c + w / 2 + 0.12, y0 - 0.12, y0, outer - dir * 0.3, outer + dir * 0.1, M.STONE_TRIM);
    // interior oak sill board
    if (!opt.upper) place(c - w / 2 - 0.05, c + w / 2 + 0.05, y0 - 0.05, y0 + 0.0, inner - dir * 0.04, glassPos, M.WOOD, { col: '#6b4a2e' });
  }

  // ---------------------------------------------------------------- constants
  const YT = 11.0;        // outer wall top
  const EXT = { x0: -16, x1: 16, z0: -11, z1: 11 };

  // plinth / base course
  box(-16.25, -0.5, -11.25, 16.25, 0.25, -11.0, M.STONE_TRIM, { seed: 3 });
  box(-16.25, -0.5, 11.0, 0.5, 0.25, 11.25, M.STONE_TRIM, { seed: 4 });
  box(2.5, -0.5, 11.0, 16.25, 0.25, 11.25, M.STONE_TRIM, { seed: 5 });
  box(0.5, -0.5, 11.0, 2.5, 0.05, 11.25, M.STONE_TRIM, { seed: 6 });
  box(-16.25, -0.5, -11.0, -16.0, 0.25, 11.0, M.STONE_TRIM, { seed: 7 });
  box(16.0, -0.5, -11.0, 16.25, 0.25, 11.0, M.STONE_TRIM, { seed: 8 });
  // entrance steps
  box(-0.1, -0.5, 11.25, 3.1, -0.22, 12.0, M.STONE_TRIM);
  box(0.1, -0.5, 11.25, 2.9, 0.05, 11.62, M.STONE_TRIM);

  // ---------------------------------------------------------------- outer walls with openings
  const GHwin = [-12.2, -7.8, -3.4, 1.0];
  const libWin = [7.2, 11.8];
  const north = [];
  for (const x of GHwin) north.push({ a: x - 0.8, b: x + 0.8, y0: 1.4, y1: 6.6 });
  for (const x of libWin) north.push({ a: x - 0.7, b: x + 0.7, y0: 1.0, y1: 4.0 });
  const upN = [7.2, 11.8];
  for (const x of upN) north.push({ a: x - 0.6, b: x + 0.6, y0: 6.6, y1: 8.8 });
  wallAlongX(-16, 16, -0.5, YT, -11, -10, M.STONE, north);
  for (const x of upN) windowUnit('z', -10, -11, x, 1.2, 6.6, 8.8, { upper: true, transoms: [7.9] });
  for (const x of GHwin) windowUnit('z', -10, -11, x, 1.6, 1.4, 6.6, { transoms: [3.2, 5.0] });
  for (const x of libWin) windowUnit('z', -10, -11, x, 1.4, 1.0, 4.0, { transoms: [3.0] });

  const kitWin = [-12.0, -7.0];
  const bedWin = [8.6, 12.6];
  const south = [{ a: 0.5, b: 2.5, y0: 0.05, y1: 3.3 }, { a: -1.3, b: -0.7, y0: 1.2, y1: 3.4 }, { a: 3.7, b: 4.3, y0: 1.2, y1: 3.4 }];
  for (const x of kitWin) south.push({ a: x - 0.7, b: x + 0.7, y0: 1.1, y1: 3.4 });
  for (const x of bedWin) south.push({ a: x - 0.7, b: x + 0.7, y0: 0.9, y1: 3.4 });
  const upS = [-12.0, -7.0, 1.5, 8.6, 12.6];
  for (const x of upS) south.push({ a: x - 0.6, b: x + 0.6, y0: 6.6, y1: 8.8 });
  wallAlongX(-16, 16, -0.5, YT, 10, 11, M.STONE, south);
  for (const x of upS) windowUnit('z', 10, 11, x, 1.2, 6.6, 8.8, { upper: true, transoms: [7.9] });
  for (const x of kitWin) windowUnit('z', 10, 11, x, 1.4, 1.1, 3.4, {});
  for (const x of bedWin) windowUnit('z', 10, 11, x, 1.4, 0.9, 3.4, { transoms: [2.6] });
  windowUnit('z', 10, 11, -1.0, 0.6, 1.2, 3.4, { mullion: false });
  windowUnit('z', 10, 11, 4.0, 0.6, 1.2, 3.4, { mullion: false });
  // front door surround + arch-like head
  box(0.28, 0.05, 11.0, 0.5, 3.6, 11.08, M.STONE_TRIM);
  box(2.5, 0.05, 11.0, 2.72, 3.6, 11.08, M.STONE_TRIM);
  box(0.28, 3.3, 11.0, 2.72, 3.75, 11.1, M.STONE_TRIM);
  box(0.1, 3.75, 11.0, 2.9, 3.88, 11.2, M.STONE_TRIM);

  const west = [{ a: 7.6, b: 8.8, y0: 6.6, y1: 8.8 }];
  wallAlongZ(-10, 10, -0.5, YT, -16, -15, M.STONE, west);
  windowUnit('x', -15, -16, 8.2, 1.2, 6.6, 8.8, { upper: true, transoms: [7.9] });
  const east = [{ a: -5.85, b: -4.45, y0: 1.0, y1: 4.0 }, { a: 7.6, b: 9.0, y0: 0.9, y1: 3.4 }, { a: -5.75, b: -4.55, y0: 6.6, y1: 8.8 }, { a: 3.9, b: 5.1, y0: 6.6, y1: 8.8 }];
  wallAlongZ(-10, 10, -0.5, YT, 15, 16, M.STONE, east);
  windowUnit('x', 15, 16, -5.15, 1.2, 6.6, 8.8, { upper: true, transoms: [7.9] });
  windowUnit('x', 15, 16, 4.5, 1.2, 6.6, 8.8, { upper: true, transoms: [7.9] });
  windowUnit('x', 15, 16, -5.15, 1.4, 1.0, 4.0, { transoms: [3.0] });
  windowUnit('x', 15, 16, 8.3, 1.4, 0.9, 3.4, { transoms: [2.6] });

  // heavy linen / wool drapes either side of the tall windows, hung from iron poles
  function drapes(axis, inner, dirIn, c, w, yTop, col) {
    const h = yTop;
    for (const sgn of [-1, 1]) {
      const a = c + sgn * (w / 2 + 0.2);
      if (axis === 'z') rbox(a, h / 2 + 0.01, inner + dirIn * 0.1, 0.3, h / 2, 0.045, 0.035, M.LINEN, { col, x: 2 });
      else rbox(inner + dirIn * 0.1, h / 2 + 0.01, a, 0.3, h / 2, 0.045, 0.035, M.LINEN, { col, x: 2, rot: [0, 90, 0] });
    }
    const p0 = axis === 'z' ? [c - w / 2 - 0.6, yTop + 0.06, inner + dirIn * 0.14] : [inner + dirIn * 0.14, yTop + 0.06, c - w / 2 - 0.6];
    const p1 = axis === 'z' ? [c + w / 2 + 0.6, yTop + 0.06, inner + dirIn * 0.14] : [inner + dirIn * 0.14, yTop + 0.06, c + w / 2 + 0.6];
    rod(p0, p1, 0.018, M.IRON);
    ell(p0[0], p0[1], p0[2], 0.035, 0.035, 0.035, M.IRON); ell(p1[0], p1[1], p1[2], 0.035, 0.035, 0.035, M.IRON);
  }
  for (const x of GHwin) drapes('z', -10, 1, x, 1.6, 7.0, '#56604a');
  for (const x of libWin) drapes('z', -10, 1, x, 1.4, 4.35, '#7b5836');
  drapes('x', 15, -1, -5.15, 1.4, 4.35, '#7b5836');
  for (const x of bedWin) drapes('z', 10, -1, x, 1.4, 3.75, '#cdc2ac');
  drapes('x', 15, -1, 8.3, 1.4, 3.75, '#cdc2ac');

  // ---------------------------------------------------------------- internal walls
  // A: z = 0 (north rooms | south rooms)
  wallAlongX(-15, 15, 0, YT, -0.3, 0.3, M.STONE, [
    { a: -10.7, b: -9.3, y0: 0, y1: 2.4 },
    { a: 0.6, b: 2.4, y0: 0, y1: 2.9 },
  ]);
  // B: x = 4 (great hall | library)
  wallAlongZ(-10, -0.3, 0, YT, 3.7, 4.3, M.STONE, [{ a: -3.8, b: -2.2, y0: 0, y1: 2.7 }]);
  // C: x = -3 (kitchen | entrance hall)
  wallAlongZ(0.3, 10, 0, YT, -3.3, -2.7, M.STONE, [{ a: 4.3, b: 5.7, y0: 0, y1: 2.4 }]);
  // D: x = 6 (entrance hall | bedroom)
  wallAlongZ(0.3, 10, 0, YT, 5.7, 6.3, M.STONE, [{ a: 5.4, b: 6.6, y0: 0, y1: 2.4 }]);

  // oak lintels over internal doorways (both faces)
  const lintelX = (a, b, y, z0, z1) => { box(a - 0.25, y, z0 - 0.04, b + 0.25, y + 0.28, z1 + 0.04, M.BEAM); };
  const lintelZ = (a, b, y, x0, x1) => { box(x0 - 0.04, y, a - 0.25, x1 + 0.04, y + 0.28, b + 0.25, M.BEAM); };
  lintelX(-10.7, -9.3, 2.4, -0.3, 0.3);
  lintelX(0.6, 2.4, 2.9, -0.3, 0.3);
  lintelZ(-3.8, -2.2, 2.7, 3.7, 4.3);
  lintelZ(4.3, 5.7, 2.4, -3.3, -2.7);
  lintelZ(5.4, 6.6, 2.4, 5.7, 6.3);
  // exterior door lintel inside
  box(0.25, 3.3, 9.96, 2.75, 3.6, 10.02, M.BEAM);

  // ---------------------------------------------------------------- floors
  box(-15, -0.4, -10, 3.7, 0, -0.3, M.OAK_FLOOR, { x: 0 });      // great hall
  box(4.3, -0.4, -10, 15, 0, -0.3, M.OAK_FLOOR, { x: 2 });       // library (chevron)
  box(-15, -0.4, 0.3, -3.3, 0, 10, M.FLAGSTONE);                 // kitchen
  box(-2.7, -0.4, 0.3, 5.7, 0, 10, M.FLAGSTONE, { seed: 7 });    // entrance
  box(6.3, -0.4, 0.3, 15, 0, 10, M.OAK_FLOOR, { x: 1 });         // bedroom
  // door thresholds
  box(-10.7, -0.4, -0.3, -9.3, 0.0, 0.3, M.STONE_TRIM);
  box(0.6, -0.4, -0.3, 2.4, 0.0, 0.3, M.STONE_TRIM);
  box(3.7, -0.4, -3.8, 4.3, 0.0, -2.2, M.STONE_TRIM);
  box(-3.3, -0.4, 4.3, -2.7, 0.0, 5.7, M.STONE_TRIM);
  box(5.7, -0.4, 5.4, 6.3, 0.0, 6.6, M.STONE_TRIM);

  // ---------------------------------------------------------------- ceilings + beams
  function ceiling(x0, x1, z0, z1, y, beamsAlong, spacing) {
    box(x0, y, z0, x1, y + 0.35, z1, M.PLASTER);
    if (beamsAlong === 'z') {
      const n = Math.max(1, Math.round((x1 - x0) / spacing));
      for (let i = 1; i < n; i++) {
        const x = x0 + (x1 - x0) * i / n;
        box(x - 0.15, y - 0.32, z0, x + 0.15, y, z1, M.BEAM);
      }
      // joists between beams
      for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.55) box(x - 0.055, y - 0.12, z0, x + 0.055, y, z1, M.BEAM, { seed: x * 7 });
    } else {
      const n = Math.max(1, Math.round((z1 - z0) / spacing));
      for (let i = 1; i < n; i++) {
        const z = z0 + (z1 - z0) * i / n;
        box(x0, y - 0.3, z - 0.15, x1, y, z + 0.15, M.BEAM);
      }
      for (let z = z0 + 0.35; z < z1 - 0.2; z += 0.55) box(x0, y - 0.11, z - 0.05, x1, y, z + 0.05, M.BEAM, { seed: z * 7 });
    }
  }
  ceiling(4.3, 15, -10, -0.3, 5.0, 'z', 2.2);     // library
  ceiling(-15, -3.3, 0.3, 10, 4.5, 'z', 2.0);     // kitchen
  ceiling(-2.7, 5.7, 0.3, 10, 4.5, 'x', 2.4);     // entrance
  ceiling(6.3, 15, 0.3, 10, 4.2, 'x', 2.0);       // bedroom

  // flat lead roof over everything except the great hall
  box(3.7, 10.8, -10, 15, 11.0, -0.3, M.LEAD);
  box(-15, 10.8, -0.3, 15, 11.0, 10, M.LEAD);

  // ---------------------------------------------------------------- great hall roof + trusses
  const GH = { x0: -15, x1: 3.7, z0: -10, z1: -0.3 };
  const zr = (GH.z0 + GH.z1) / 2;              // ridge z = -5.15
  const yPlate = 7.7, yRidge = 10.72;
  const xc = (GH.x0 + GH.x1) / 2, xw = GH.x1 - GH.x0;
  for (const side of [-1, 1]) {
    const zw = side < 0 ? GH.z0 : GH.z1;
    const A = [xc, yPlate, zw], B = [xc, yRidge, zr];
    const d = V.norm(V.sub(B, A));
    // normal pointing into the room (downwards)
    let n = V.norm(V.cross(d, [1, 0, 0])); if (n[1] > 0) n = V.mul(n, -1);
    const up = V.mul(n, -1);
    const off = (v, s) => V.add(v, V.mul(up, s));
    const ext = V.mul(d, 0.12);
    beam(off(V.sub(A, ext), 0.04), off(V.add(B, ext), 0.04), xw, 0.08, M.BOARDS, up, { x: 0 });
    beam(off(V.sub(A, ext), 0.16), off(V.add(B, ext), 0.16), xw + 0.1, 0.12, M.SLATE, up);
    // purlins
    for (const f of [0.36, 0.7]) {
      const P = V.lerp(A, B, f);
      const p0 = off([GH.x0, P[1], P[2]], -0.14), p1 = off([GH.x1, P[1], P[2]], -0.14);
      beam(p0, p1, 0.22, 0.24, M.BEAM, up);
    }
    // wall plate
    box(GH.x0, yPlate - 0.3, side < 0 ? GH.z0 : GH.z1 - 0.32, GH.x1, yPlate, side < 0 ? GH.z0 + 0.32 : GH.z1, M.BEAM);
  }
  box(GH.x0, yRidge - 0.3, zr - 0.13, GH.x1, yRidge - 0.02, zr + 0.13, M.BEAM); // ridge beam
  const trussX = [-11.25, -7.95, -4.65, -1.35];
  for (const tx of trussX) {
    const yt = 7.25;
    box(tx - 0.16, yt, GH.z0, tx + 0.16, yt + 0.36, GH.z1, M.BEAM, { seed: tx });                 // tie beam
    box(tx - 0.14, yt + 0.36, zr - 0.15, tx + 0.14, yRidge - 0.3, zr + 0.15, M.BEAM, { seed: tx + 1 }); // king post
    for (const side of [-1, 1]) {
      const zw = side < 0 ? GH.z0 : GH.z1;
      const A = [tx, yPlate - 0.05, zw + side * -0.05], B = [tx, yRidge - 0.12, zr];
      const d = V.norm(V.sub(B, A));
      let n = V.norm(V.cross(d, [1, 0, 0])); if (n[1] > 0) n = V.mul(n, -1);
      const o = V.mul(n, 0.2);
      beam(V.add(A, o), V.add(B, o), 0.26, 0.32, M.BEAM, V.mul(n, -1), { seed: tx + side });            // principal rafter
      const strutTop = V.add(V.lerp(A, B, 0.55), V.mul(n, 0.3));
      beam([tx, yt + 0.4, zr + side * 0.14], strutTop, 0.18, 0.18, M.BEAM, [1, 0, 0]);                  // strut
      const zwp = side < 0 ? GH.z0 + 0.14 : GH.z1 - 0.14;
      box(tx - 0.14, 5.1, zwp - 0.14, tx + 0.14, yt, zwp + 0.14, M.BEAM, { seed: tx * 3 + side });        // wall post
      box(tx - 0.24, 4.78, side < 0 ? GH.z0 : GH.z1 - 0.42, tx + 0.24, 5.1, side < 0 ? GH.z0 + 0.42 : GH.z1, M.BEAM, { seed: tx * 7 + side }); // timber corbel
      beam([tx, 5.55, zwp - side * 0.1], [tx, yt + 0.02, zwp - side * 1.55], 0.2, 0.2, M.BEAM, [1, 0, 0]); // arched brace (straight)
    }
  }

  // ---------------------------------------------------------------- towers
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = 17 * sx, cz = 12 * sz;
    const R = sz > 0 ? 3.15 : 2.75, Ht = (sz > 0 ? 16.2 : 14.6) + (sx > 0 ? 0.6 : 0), rh = sz > 0 ? 4.2 : 3.4;
    post(cx, -0.5, cz, R, Ht + 0.5, M.STONE);
    post(cx, -0.5, cz, R + 0.2, 0.8, M.STONE_TRIM);
    post(cx, 5.6, cz, R + 0.06, 0.18, M.STONE_TRIM);
    post(cx, Ht - 1.1, cz, R + 0.22, 0.45, M.STONE_TRIM);   // corbel course
    for (let k = 0; k < 18; k++) {                                  // machicolation corbels
      const a = k / 18 * Math.PI * 2;
      add(T.BOX, [cx + Math.cos(a) * (R + 0.1), Ht - 1.45, cz + Math.sin(a) * (R + 0.1)], [0.14, 0.2, 0.18], M.STONE_TRIM, { rot: [0, -a * 180 / Math.PI, 0] });
    }
    cone(cx, Ht - 0.65 + rh, cz, R + 0.45, rh, 0.06, M.SLATE);
    post(cx, Ht - 0.65 + 2 * rh - 0.2, cz, 0.05, 1.3, M.LEAD);
    ell(cx, Ht - 0.65 + 2 * rh + 1.1, cz, 0.12, 0.12, 0.12, M.LEAD);
    // dormer-like lucarne on the roof
    push([cx, 0, cz], Math.atan2(sx, sz) * 180 / Math.PI + 180);
    box(-0.35, Ht - 0.4, R - 0.3, 0.35, Ht + 0.9, R + 0.2, M.STONE_TRIM);
    box(-0.22, Ht - 0.25, R + 0.15, 0.22, Ht + 0.6, R + 0.23, M.GLASS, { flags: F.TRANS });
    beam([-0.45, Ht + 0.85, R + 0.3], [0, Ht + 1.35, R + 0.3], 0.5, 0.06, M.SLATE, [0, 0, 1]);
    beam([0.45, Ht + 0.85, R + 0.3], [0, Ht + 1.35, R + 0.3], 0.5, 0.06, M.SLATE, [0, 0, 1]);
    pop();
    // tower windows (dark recess framed in dressed stone), facing outward diagonally
    const yaw = Math.atan2(sx, sz) * 180 / Math.PI;
    for (const [wy, hh] of [[4.2, 0.9], [9.2, 0.7]]) {
      push([cx, 0, cz], yaw);
      box(-0.45, wy - hh - 0.1, R - 0.2, 0.45, wy + hh + 0.25, R + 0.08, M.STONE_TRIM);
      box(-0.3, wy - hh, R + 0.04, 0.3, wy + hh, R + 0.1, M.GLASS, { flags: F.TRANS });
      box(-0.05, wy - hh, R + 0.04, 0.05, wy + hh, R + 0.13, M.STONE_TRIM);
      pop();
    }
  }

  // ---------------------------------------------------------------- parapet + corbel table
  // outer parapet walls
  box(-16.2, 10.1, -11.25, 16.2, 10.45, -10.9, M.STONE_TRIM);
  box(-16.2, 10.1, 10.9, 16.2, 10.45, 11.25, M.STONE_TRIM);
  box(-16.25, 10.1, -11.2, -15.9, 10.45, 11.2, M.STONE_TRIM);
  box(15.9, 10.1, -11.2, 16.25, 10.45, 11.2, M.STONE_TRIM);
  box(-16.1, 10.45, -11.15, 16.1, 11.7, -10.6, M.STONE);
  box(-16.1, 10.45, 10.6, 16.1, 11.7, 11.15, M.STONE);
  box(-16.15, 10.45, -11.1, -15.6, 11.7, 11.1, M.STONE);
  box(15.6, 10.45, -11.1, 16.15, 11.7, 11.1, M.STONE);
  for (let x = -14.4; x <= 14.5; x += 1.6) {
    box(x - 0.45, 11.7, -11.15, x + 0.45, 12.5, -10.6, M.STONE);
    box(x - 0.45, 11.7, 10.6, x + 0.45, 12.5, 11.15, M.STONE);
    box(x - 0.47, 12.5, -11.18, x + 0.47, 12.6, -10.57, M.STONE_TRIM);
    box(x - 0.47, 12.5, 10.57, x + 0.47, 12.6, 11.18, M.STONE_TRIM);
  }
  for (let z = -8.8; z <= 8.9; z += 1.6) {
    box(-16.15, 11.7, z - 0.45, -15.6, 12.5, z + 0.45, M.STONE);
    box(15.6, 11.7, z - 0.45, 16.15, 12.5, z + 0.45, M.STONE);
    box(-16.18, 12.5, z - 0.47, -15.57, 12.6, z + 0.47, M.STONE_TRIM);
    box(15.57, 12.5, z - 0.47, 16.18, 12.6, z + 0.47, M.STONE_TRIM);
  }
  for (let x = -14.6; x <= 14.7; x += 0.9) {
    box(x - 0.12, 9.55, -11.3, x + 0.12, 10.1, -11.0, M.STONE_TRIM, { seed: x });
    box(x - 0.12, 9.55, 11.0, x + 0.12, 10.1, 11.3, M.STONE_TRIM, { seed: x + 50 });
  }
  for (let z = -9.9; z <= 10.0; z += 0.9) {
    box(-16.3, 9.55, z - 0.12, -16.0, 10.1, z + 0.12, M.STONE_TRIM, { seed: z });
    box(16.0, 9.55, z - 0.12, 16.3, 10.1, z + 0.12, M.STONE_TRIM, { seed: z + 80 });
  }
  // string course at first floor level
  box(-16.12, 5.6, -11.12, 16.12, 5.78, -10.95, M.STONE_TRIM);
  box(-16.12, 5.6, 10.95, 16.12, 5.78, 11.12, M.STONE_TRIM);

  // ---------------------------------------------------------------- chimney stacks
  function chimneyStack(x0, z0, x1, z1, y1, pots) {
    box(x0, YT - 0.2, z0, x1, y1, z1, M.STONE);
    box(x0 - 0.1, y1, z0 - 0.1, x1 + 0.1, y1 + 0.2, z1 + 0.1, M.STONE_TRIM);
    for (const [px, pz] of pots) {
      post(px, y1 + 0.2, pz, 0.17, 0.75, M.TERRACOTTA);
      post(px, y1 + 0.85, pz, 0.2, 0.1, M.TERRACOTTA);
    }
  }
  chimneyStack(-16.3, -6.4, -14.4, -3.9, 13.6, [[-15.35, -5.8], [-15.35, -4.5]]);
  chimneyStack(-16.3, 4.0, -14.4, 6.4, 13.4, [[-15.35, 4.6], [-15.35, 5.8]]);
  chimneyStack(9.9, -0.55, 11.4, 0.55, 13.0, [[10.65, 0]]);

  // ---------------------------------------------------------------- fireplace helper
  function fire(cx, cy, cz, width, depth, axisYaw, scale, lightPower) {
    // local frame: firebox opening faces +z, logs along x
    push([cx, cy, cz], axisYaw);
    const s = scale;
    // andirons
    for (const sx of [-1, 1]) {
      post(sx * width * 0.32, 0, 0.25 * s, 0.022 * s, 0.38 * s, M.IRON);
      ell(sx * width * 0.32, 0.4 * s, 0.25 * s, 0.045 * s, 0.045 * s, 0.045 * s, M.IRON);
      beam([sx * width * 0.32, 0.12 * s, 0.25 * s], [sx * width * 0.32, 0.12 * s, -depth * 0.55], 0.03 * s, 0.03 * s, M.IRON);
    }
    // grate bars
    for (let i = 0; i < 4; i++) beam([-width * 0.36, 0.13 * s, 0.15 * s - i * 0.12 * s], [width * 0.36, 0.13 * s, 0.15 * s - i * 0.12 * s], 0.02 * s, 0.02 * s, M.IRON);
    // logs
    const logs = [[-0.02, 0.2, 0.1, 0.085, 0, 4], [0.03, 0.2, -0.13, 0.09, 0, -5], [0.0, 0.34, -0.02, 0.075, 12, 18], [-0.05, 0.33, 0.02, 0.07, -8, -22]];
    for (const [x, y, z, r, rz, ry] of logs) {
      add(T.CYL, [x * s, y * s, z * s], [r * s, width * 0.34, r * s], M.LOG, { rot: [0, ry, 90 + rz], x: 1 });
    }
    // embers bed
    box(-width * 0.34, 0.0, -depth * 0.45, width * 0.34, 0.06 * s, 0.2 * s, M.LOG, { x: 2 });
    // flames (camera-only emissive volumes)
    const fl = [[-0.22, 0.42, 0.0, 0.16, 0.34, 0.14], [0.05, 0.5, -0.05, 0.2, 0.44, 0.16], [0.28, 0.4, 0.02, 0.14, 0.3, 0.12], [-0.05, 0.36, 0.08, 0.26, 0.2, 0.1]];
    for (const [x, y, z, rx, ry, rz] of fl) ell(x * s * width / 1.2, y * s, z * s, rx * s, ry * s, rz * s, M.FIRE, { flags: F.CAMONLY, collide: false });
    light([-0.22 * s * width / 1.2, 0.42 * s, 0.02 * s], 0.13 * s, lightPower * 0.3, 'fire');
    light([0.05 * s * width / 1.2, 0.52 * s, -0.02 * s], 0.15 * s, lightPower * 0.4, 'fire');
    light([0.26 * s * width / 1.2, 0.4 * s, 0.03 * s], 0.12 * s, lightPower * 0.3, 'fire');
    pop();
  }

  // ---------------------------------------------------------------- furniture helpers (local: front faces +z)
  function lampShadeLight(x, y, z, power, shadeR = 0.2, shadeH = 0.26, col = '#e8dcc4') {
    // drum shade (open cylinder) with bulb inside
    add(T.CONE, [x, y, z], [shadeR, shadeH / 2, shadeR * 0.82], M.SHADE, { r: 1, col, x: power, flags: F.TRANS });
    light([x, y - 0.02, z], 0.035, power, 'lamp');
  }
  function tableLamp(x, y0, z, power, baseMat = M.CERAMIC, baseCol = '#d9d4c7') {
    ell(x, y0 + 0.16, z, 0.1, 0.16, 0.1, baseMat, { col: baseCol, x: baseMat === M.CERAMIC ? 0 : 0 });
    post(x, y0, z, 0.07, 0.03, M.BRASS);
    post(x, y0 + 0.3, z, 0.012, 0.2, M.BRASS);
    lampShadeLight(x, y0 + 0.58, z, power);
  }
  function clubChair(x, z, yaw, col) {
    push([x, 0, z], yaw);
    const o = { col };
    rbox(0, 0.21, 0.0, 0.44, 0.16, 0.44, 0.1, M.LEATHER, o);                        // base
    rbox(0, 0.43, 0.08, 0.27, 0.075, 0.33, 0.07, M.LEATHER, { col, rot: [-3, 0, 0] }); // seat cushion
    rbox(0, 0.56, -0.32, 0.36, 0.25, 0.11, 0.1, M.LEATHER, { col, rot: [-10, 0, 0] }); // reclined back
    add(T.CYL, [0, 0.8, -0.37], [0.1, 0.38, 0.1], M.LEATHER, { col, rot: [0, 0, 90] }); // back roll
    for (const sx of [-1, 1]) {
      rbox(sx * 0.35, 0.44, 0.02, 0.1, 0.19, 0.42, 0.09, M.LEATHER, o);            // arm
      add(T.CYL, [sx * 0.37, 0.63, 0.04], [0.105, 0.4, 0.105], M.LEATHER, { col, rot: [90, 0, 0] }); // rolled arm
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ell(sx * 0.37, 0.03, sz * 0.36, 0.04, 0.035, 0.04, M.WOOD, { col: '#2e1c10' });
    pop();
  }
  function chesterfield(x, z, yaw, len, col) {
    push([x, 0, z], yaw);
    const o = { col };
    const hl = len / 2;
    rbox(0, 0.22, 0, hl - 0.02, 0.17, 0.44, 0.06, M.LEATHER, o);
    rbox(0, 0.47, -0.36, hl - 0.02, 0.25, 0.12, 0.08, M.LEATHER, { col, x: 1 });
    add(T.CYL, [0, 0.72, -0.37], [0.11, hl - 0.02, 0.11], M.LEATHER, { col, rot: [0, 0, 90] });
    for (const sx of [-1, 1]) {
      rbox(sx * (hl - 0.13), 0.44, 0.0, 0.13, 0.25, 0.46, 0.08, M.LEATHER, { col, x: 1 });
      add(T.CYL, [sx * (hl - 0.12), 0.71, 0.01], [0.14, 0.46, 0.14], M.LEATHER, { col, rot: [90, 0, 0] });
    }
    const inner = hl - 0.26, n = len > 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const cxx = -inner + (2 * inner) * (i + 0.5) / n;
      rbox(cxx, 0.455, 0.07, inner / n - 0.01, 0.075, 0.33, 0.06, M.LEATHER, o);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ell(sx * (hl - 0.1), 0.035, sz * 0.36, 0.045, 0.04, 0.045, M.WOOD, { col: '#3a2416' });
    pop();
  }
  function woodChair(x, z, yaw, col = '#5a3a22', cushion = '#cfc4ae') {
    push([x, 0, z], yaw);
    const o = { col };
    cbox(0, 0.455, 0, 0.23, 0.022, 0.22, M.WOOD, o);
    for (const sx of [-1, 1]) {
      post(sx * 0.2, 0, 0.19, 0.019, 0.44, M.WOOD, o);
      post(sx * 0.2, 0, -0.19, 0.021, 1.0, M.WOOD, o);
      ell(sx * 0.2, 1.01, -0.19, 0.026, 0.03, 0.026, M.WOOD, o);
    }
    for (const y of [0.62, 0.78, 0.94]) cbox(0, y, -0.19, 0.2, 0.035, 0.012, M.WOOD, o);
    beam([-0.2, 0.18, 0.19], [0.2, 0.18, 0.19], 0.02, 0.02, M.WOOD, [0, 1, 0], o);
    beam([-0.2, 0.18, -0.19], [0.2, 0.18, -0.19], 0.02, 0.02, M.WOOD, [0, 1, 0], o);
    if (cushion) rbox(0, 0.49, 0.01, 0.2, 0.018, 0.19, 0.015, M.LINEN, { col: cushion });
    pop();
  }
  function candle(x, y, z, h = 0.2, lit = true, power = 0.0012) {
    post(x, y, z, 0.012, h, M.WAX);
    if (lit) {
      ell(x, y + h + 0.022, z, 0.0065, 0.019, 0.0065, M.FLAME, { flags: F.CAMONLY, collide: false });
      light([x, y + h + 0.024, z], 0.009, power, 'candle');
    }
  }
  function candlestick(x, y, z, h = 0.2) {
    post(x, y, z, 0.055, 0.015, M.BRASS);
    post(x, y + 0.015, z, 0.012, h - 0.03, M.BRASS);
    ell(x, y + h * 0.45, z, 0.022, 0.018, 0.022, M.BRASS);
    post(x, y + h - 0.02, z, 0.03, 0.02, M.BRASS);
    candle(x, y + h, z, 0.18);
  }
  function painting(x, y, z, w, h, yaw, variant) {
    push([x, y, z], yaw);
    cbox(0, 0, 0.02, w / 2, h / 2, 0.012, M.PAINTING, { x: variant });
    const fw = 0.085, fd = 0.05;
    cbox(0, h / 2 + fw / 2, 0.035, w / 2 + fw, fw / 2, fd, M.GILT);
    cbox(0, -h / 2 - fw / 2, 0.035, w / 2 + fw, fw / 2, fd, M.GILT);
    cbox(-w / 2 - fw / 2, 0, 0.035, fw / 2, h / 2, fd, M.GILT, { x: 1 });
    cbox(w / 2 + fw / 2, 0, 0.035, fw / 2, h / 2, fd, M.GILT, { x: 1 });
    pop();
  }
  function sconce(x, y, z, yaw) {
    push([x, y, z], yaw);
    cbox(0, 0, 0.012, 0.06, 0.12, 0.012, M.IRON);
    beam([0, -0.05, 0.02], [0, 0.02, 0.2], 0.02, 0.02, M.IRON);
    post(0, 0.0, 0.2, 0.045, 0.012, M.IRON);
    post(0, 0.012, 0.2, 0.013, 0.09, M.WAX);
    ell(0, 0.14, 0.2, 0.011, 0.028, 0.011, M.BULB, { flags: F.CAMONLY, collide: false });
    light([0, 0.14, 0.2], 0.018, 0.012, 'lamp');
    pop();
  }
  function booksRow(x0, x1, y0, h, zBack, depth, seed, yawBooks) {
    // books box: local x along shelf, local +z faces the room
    push([(x0 + x1) / 2, y0 + h / 2, zBack], yawBooks);
    cbox(0, 0, depth / 2, (x1 - x0) / 2, h / 2, depth / 2, M.BOOKS, { seed });
    pop();
  }
  function bookcase(x0, x1, zWall, yaw, height, bays) {
    // along local x from x0..x1 (in a frame where the wall is at local z=0 and room at +z)
    const dep = 0.38;
    const w = x1 - x0;
    const col = '#3b2a1c';
    cbox((x0 + x1) / 2, 0.45, dep / 2 + 0.04, w / 2, 0.45, dep / 2 + 0.04, M.WOOD, { col });           // lower cupboards
    for (let i = 0; i < bays; i++) {                                                                          // cupboard door panels
      const bx0 = x0 + w * i / bays, bx1 = x0 + w * (i + 1) / bays;
      cbox((bx0 + bx1) / 2, 0.45, dep + 0.085, (bx1 - bx0) / 2 - 0.06, 0.34, 0.012, M.WOOD, { col: '#44301f' });
      ell((bx0 + bx1) / 2, 0.62, dep + 0.105, 0.016, 0.016, 0.016, M.BRASS);
    }
    cbox((x0 + x1) / 2, 0.915, dep / 2 + 0.06, w / 2 + 0.02, 0.025, dep / 2 + 0.06, M.WOOD, { col });
    const shelfYs = [];
    for (let y = 0.94; y < height - 0.3; y += 0.36) shelfYs.push(y);
    for (const y of shelfYs) cbox((x0 + x1) / 2, y, dep / 2, w / 2, 0.018, dep / 2, M.WOOD, { col });
    for (let i = 0; i <= bays; i++) {
      const x = x0 + w * i / bays;
      cbox(x, (0.94 + height) / 2, dep / 2 + 0.01, 0.028, (height - 0.94) / 2, dep / 2 + 0.01, M.WOOD, { col });
    }
    cbox((x0 + x1) / 2, height + 0.06, dep / 2 + 0.05, w / 2 + 0.06, 0.08, dep / 2 + 0.05, M.WOOD, { col });   // cornice
    cbox((x0 + x1) / 2, (0.94 + height) / 2, 0.01, w / 2, (height - 0.94) / 2, 0.01, M.WOOD, { col: '#2a1d13' }); // back
    for (let i = 0; i < bays; i++) {
      const bx0 = x0 + w * i / bays + 0.03, bx1 = x0 + w * (i + 1) / bays - 0.03;
      for (let s = 0; s < shelfYs.length - 1; s++) {
        const y0 = shelfYs[s] + 0.018, hh = shelfYs[s + 1] - shelfYs[s] - 0.04;
        const seed = i * 13.7 + s * 3.1 + x0;
        push([(bx0 + bx1) / 2, y0 + hh / 2, 0.03], 0);
        cbox(0, 0, 0.14, (bx1 - bx0) / 2, hh / 2, 0.14, M.BOOKS, { seed });
        pop();
      }
    }
  }
  function rug(x0, z0, x1, z1, variant) {
    box(x0, 0, z0, x1, 0.012, z1, M.RUG, { x: variant, collide: true });
    // knotted fringe on the short ends
    if (Math.abs(x1 - x0) < Math.abs(z1 - z0)) { box(x0 + 0.02, 0, z0 - 0.07, x1 - 0.02, 0.006, z0, M.LINEN, { col: '#cbbd9e', x: 0 }); box(x0 + 0.02, 0, z1, x1 - 0.02, 0.006, z1 + 0.07, M.LINEN, { col: '#cbbd9e' }); }
    else { box(x0 - 0.07, 0, z0 + 0.02, x0, 0.006, z1 - 0.02, M.LINEN, { col: '#cbbd9e' }); box(x1, 0, z0 + 0.02, x1 + 0.07, 0.006, z1 - 0.02, M.LINEN, { col: '#cbbd9e' }); }
  }

  // ================================================================ GREAT HALL
  // fireplace on west wall
  box(-15, 0, -7.7, -14.0, 1.95, -6.3, M.STONE_TRIM, { seed: 11 });
  box(-15, 0, -4.0, -14.0, 1.95, -2.6, M.STONE_TRIM, { seed: 12 });
  box(-15, 1.95, -7.7, -14.0, 7.7, -2.6, M.STONE);
  box(-14.02, 1.95, -6.6, -13.9, 2.5, -3.7, M.STONE_TRIM, { seed: 13 });   // lintel
  for (const zc of [-6.45, -3.85]) {
    post(-13.9, 0.0, zc, 0.13, 0.2, M.STONE_TRIM, { seed: zc });
    post(-13.9, 0.2, zc, 0.09, 1.6, M.STONE_TRIM, { seed: zc + 1 });
    post(-13.9, 1.8, zc, 0.13, 0.15, M.STONE_TRIM, { seed: zc + 2 });
  }
  box(-14.0, 2.5, -7.85, -13.72, 2.66, -2.45, M.BEAM);                     // oak mantel shelf
  box(-15, 0, -6.3, -14.93, 1.95, -4.0, M.SOOT);
  box(-15, 0, -6.3, -14.0, 1.95, -6.24, M.SOOT);
  box(-15, 0, -4.06, -14.0, 1.95, -4.0, M.SOOT);
  box(-15, 1.86, -6.3, -14.0, 1.95, -4.0, M.SOOT);
  box(-15, 0, -7.4, -13.05, 0.05, -2.9, M.FLAGSTONE, { seed: 21 });          // hearth
  fire(-14.45, 0.05, -5.15, 2.0, 0.8, 90, 1.25, 0.20);
  // mantel objects
  candlestick(-13.85, 2.66, -7.3, 0.28); candlestick(-13.85, 2.66, -3.0, 0.28);
  post(-13.86, 2.66, -5.9, 0.07, 0.22, M.PEWTER); post(-13.86, 2.66, -4.35, 0.06, 0.18, M.CERAMIC, { col: '#d8d2c4' });
  painting(-14.0, 4.55, -5.15, 2.3, 1.55, 90, 0);
  // bracket clock on the mantel
  box(-13.95, 2.66, -5.45, -13.75, 3.0, -5.15, M.WOOD, { col: '#3a1f10' });
  add(T.CYL, [-13.745, 2.86, -5.3], [0.09, 0.004, 0.09], M.CERAMIC, { rot: [0, 0, 90], col: '#e6dfcc' });
  add(T.CYL, [-13.742, 2.86, -5.3], [0.1, 0.003, 0.1], M.BRASS, { rot: [0, 0, 90] });
  ell(-13.85, 3.03, -5.3, 0.06, 0.04, 0.06, M.BRASS);
  // log basket + fire tools
  box(-14.6, 0.0, -2.35, -13.9, 0.42, -1.45, M.WOOD, { col: '#4b3521' });
  for (let i = 0; i < 5; i++) add(T.CYL, [-14.25, 0.47 + (i % 2) * 0.06, -2.2 + i * 0.17], [0.07, 0.32, 0.07], M.LOG, { rot: [0, 0, 90] });
  post(-13.6, 0.05, -7.6, 0.1, 0.02, M.IRON); post(-13.6, 0.07, -7.6, 0.012, 0.75, M.IRON);
  for (const dz of [-0.05, 0.0, 0.05]) rod([-13.6, 0.12, -7.6 + dz], [-13.6 + dz * 0.4, 0.8, -7.6 + dz], 0.008, M.BRASS);

  // seating group
  rug(-13.1, -7.7, -8.3, -2.6, 0);
  chesterfield(-9.2, -5.15, -90, 2.3, '#6b3a1f');
  clubChair(-11.9, -7.35, 35, '#5e3016');
  clubChair(-11.9, -2.95, 145, '#6a3a1c');
  // coffee table (old trunk)
  box(-11.35, 0.0, -5.9, -10.55, 0.42, -4.4, M.WOOD, { col: '#4a3120' });
  box(-11.37, 0.1, -5.92, -10.53, 0.13, -4.38, M.IRON);
  box(-11.37, 0.33, -5.92, -10.53, 0.36, -4.38, M.IRON);
  box(-11.2, 0.42, -5.6, -10.8, 0.47, -5.0, M.PLAIN, { col: '#2c3b2e', x: 0.6 });
  box(-11.18, 0.47, -5.55, -10.84, 0.51, -5.08, M.PLAIN, { col: '#6e2a22', x: 0.6 });
  post(-10.85, 0.42, -4.75, 0.09, 0.02, M.BRASS);
  // floor lamp by chair
  post(-12.75, 0, -1.65, 0.14, 0.03, M.BRASS); post(-12.75, 0, -1.65, 0.016, 1.45, M.BRASS);
  lampShadeLight(-12.75, 1.55, -1.65, 0.07, 0.24, 0.3);
  // side table between chair and wall
  post(-13.3, 0, -8.6, 0.28, 0.02, M.WOOD, { col: '#3e2818' }); post(-13.3, 0, -8.6, 0.05, 0.6, M.WOOD, { col: '#3e2818' });
  post(-13.3, 0.6, -8.6, 0.3, 0.03, M.WOOD, { col: '#3e2818' });
  tableLamp(-13.3, 0.63, -8.6, 0.06);

  // refectory table
  const TX0 = -7.6, TX1 = -1.7, TZ = zr;
  box(TX0, 0.73, TZ - 0.52, TX1, 0.8, TZ + 0.52, M.WOOD, { col: '#4d3018' });
  for (const lx of [TX0 + 0.8, TX1 - 0.8]) {
    box(lx - 0.07, 0.07, TZ - 0.34, lx + 0.07, 0.73, TZ + 0.34, M.WOOD, { col: '#4a2e18' });
    box(lx - 0.1, 0.0, TZ - 0.46, lx + 0.1, 0.1, TZ + 0.46, M.WOOD, { col: '#4a2e18' });
    box(lx - 0.09, 0.66, TZ - 0.46, lx + 0.09, 0.73, TZ + 0.46, M.WOOD, { col: '#4a2e18' });
  }
  box(TX0 + 0.8, 0.28, TZ - 0.05, TX1 - 0.8, 0.36, TZ + 0.05, M.WOOD, { col: '#4a2e18' });
  box(TX0 + 0.6, 0.8, TZ - 0.2, TX1 - 0.6, 0.803, TZ + 0.2, M.LINEN, { col: '#d8cfbd' });
  for (let i = 0; i < 5; i++) {
    const x = TX0 + 0.75 + i * (TX1 - TX0 - 1.5) / 4;
    woodChair(x, TZ + 0.78, 180, '#4f321d', '#b9ad96');
    woodChair(x, TZ - 0.78, 0, '#4f321d', '#b9ad96');
  }
  woodChair(TX0 - 0.55, TZ, 90, '#3f2716', '#8c3b2a');
  woodChair(TX1 + 0.55, TZ, -90, '#3f2716', '#8c3b2a');
  candlestick(-6.2, 0.803, TZ, 0.3); candlestick(-4.65, 0.803, TZ, 0.34); candlestick(-3.1, 0.803, TZ, 0.3);
  // bowl of apples
  post(-5.4, 0.803, TZ + 0.05, 0.16, 0.06, M.PEWTER);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.047;
    ell(-5.4 + Math.cos(a) * 0.08, 0.9 + (i % 2) * 0.03, TZ + 0.05 + Math.sin(a) * 0.08, 0.042, 0.04, 0.042, M.PLAIN, { col: i % 3 ? '#8e1f16' : '#7c8f2c', x: 0.35 });
  }
  post(-3.9, 0.803, TZ - 0.1, 0.06, 0.2, M.PEWTER);
  rug(-8.8, -7.3, -0.5, -3.0, 1);

  // chandelier over table
  {
    const cx = -4.65, cy = 3.85, cz = TZ, R = 0.8;
    for (let i = 0; i < 16; i++) {
      const a0 = i / 16 * Math.PI * 2, a1 = (i + 1) / 16 * Math.PI * 2;
      rod([cx + Math.cos(a0) * R, cy, cz + Math.sin(a0) * R], [cx + Math.cos(a1) * R, cy, cz + Math.sin(a1) * R], 0.022, M.IRON);
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.4;
      rod([cx + Math.cos(a) * R, cy, cz + Math.sin(a) * R], [cx, cy + 0.9, cz], 0.009, M.IRON);
      rod([cx + Math.cos(a) * R, cy, cz + Math.sin(a) * R], [cx, cy - 0.25, cz], 0.012, M.IRON);
    }
    ell(cx, cy - 0.27, cz, 0.05, 0.07, 0.05, M.IRON);
    rod([cx, cy + 0.9, cz], [cx, 7.25, cz], 0.012, M.IRON);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const px = cx + Math.cos(a) * R, pz = cz + Math.sin(a) * R;
      post(px, cy + 0.02, pz, 0.045, 0.012, M.IRON);
      post(px, cy + 0.032, pz, 0.014, 0.1, M.WAX);
      ell(px, cy + 0.165, pz, 0.012, 0.03, 0.012, M.BULB, { flags: F.CAMONLY, collide: false });
      light([px, cy + 0.165, pz], 0.018, 0.005, 'lamp');
    }
  }
  // sideboard on south wall + paintings + lamps
  for (const [xa, xb] of [[-7.0, -5.3], [-4.0, -2.3]]) {
    box(xa, 0.12, -0.85, xb, 0.92, -0.3, M.WOOD, { col: '#4a2c17' });
    box(xa - 0.05, 0.92, -0.88, xb + 0.05, 0.97, -0.3, M.WOOD, { col: '#40250f' });
    box(xa - 0.02, 0.1, -0.87, xb + 0.02, 0.14, -0.3, M.WOOD, { col: '#3a2412' });
    for (let i = 0; i < 2; i++) {
      const x0 = xa + 0.06 + i * (xb - xa - 0.12) / 2, x1 = x0 + (xb - xa - 0.12) / 2 - 0.04;
      box(x0, 0.2, -0.87, x1, 0.84, -0.85, M.WOOD, { col: '#553520' });
      box(x0 + 0.08, 0.28, -0.88, x1 - 0.08, 0.76, -0.87, M.WOOD, { col: '#4a2c17' });
      ell(i ? x0 + 0.08 : x1 - 0.08, 0.55, -0.89, 0.015, 0.015, 0.015, M.BRASS);
    }
    for (const x of [xa + 0.06, xb - 0.06]) for (const z of [-0.8, -0.36]) post(x, 0, z, 0.035, 0.12, M.WOOD, { col: '#3a2412' });
  }
  post(-4.65, 0, -0.55, 0.3, 0.02, M.WOOD, { col: '#3a2412' });
  box(-4.95, 0.0, -0.75, -4.35, 0.5, -0.35, M.PLAIN, { col: '#6b5436', x: 0.95 });
  tableLamp(-6.6, 0.97, -0.58, 0.06);
  tableLamp(-2.7, 0.97, -0.58, 0.06);
  post(-6.0, 0.97, -0.55, 0.16, 0.012, M.PEWTER);
  candlestick(-3.4, 0.97, -0.6, 0.28);
  painting(-4.65, 2.75, -0.3, 2.6, 1.7, 180, 0);
  painting(-12.9, 3.0, -0.3, 3.4, 2.5, 180, 4);
  rod([-14.8, 4.35, -0.38], [-11.0, 4.35, -0.38], 0.02, M.IRON);
  push([3.7, 0, -6.0], -90);
  cbox(0, 4.0, 0.02, 1.5, 1.1, 0.012, M.PAINTING, { x: 4, seed: 33 });
  pop();
  rod([3.62, 5.15, -7.6], [3.62, 5.15, -4.4], 0.02, M.IRON);
  painting(-9.1, 2.4, -10.0, 0.9, 1.2, 0, 2);
  sconce(-8.7, 2.6, -0.3, 180); sconce(-0.7, 2.6, -0.3, 180);
  sconce(-10.0, 3.3, -10.0, 0); sconce(-5.6, 3.3, -10.0, 0);
  // longcase clock on east wall
  push([3.7, 0, -6.8], -90);
  cbox(0, 0.12, 0.22, 0.28, 0.12, 0.2, M.WOOD, { col: '#4a2412' });
  cbox(0, 1.0, 0.2, 0.22, 0.78, 0.17, M.WOOD, { col: '#55291a' });
  cbox(0, 2.0, 0.22, 0.27, 0.24, 0.2, M.WOOD, { col: '#4a2412' });
  cbox(0, 2.28, 0.22, 0.29, 0.04, 0.22, M.WOOD, { col: '#3c1d0f' });
  add(T.CYL, [0, 2.0, 0.42], [0.17, 0.005, 0.17], M.CERAMIC, { rot: [90, 0, 0], col: '#e6dfcc' });
  add(T.CYL, [0, 2.0, 0.425], [0.19, 0.004, 0.19], M.BRASS, { rot: [90, 0, 0] });
  cbox(0, 1.1, 0.375, 0.1, 0.4, 0.004, M.GLASS, { flags: F.TRANS, x: 1 });
  add(T.CYL, [0, 0.95, 0.3], [0.07, 0.006, 0.07], M.BRASS, { rot: [90, 0, 0] });
  pop();
  // oak chest under window area on north wall
  box(-12.0, 0.0, -9.95, -10.4, 0.55, -9.45, M.WOOD, { col: '#4d321c' });
  box(-12.02, 0.55, -9.97, -10.38, 0.6, -9.43, M.WOOD, { col: '#40280f' });
  box(-7.1, 0.0, -9.95, -5.7, 0.8, -9.5, M.WOOD, { col: '#3f2917' });
  tableLamp(-6.4, 0.8, -9.72, 0.05);

  // ================================================================ LIBRARY
  push([0, 0, -0.3], 180);           // south wall frame: local +z points to -z world (room)
  bookcase(-15.0, -4.4, 0, 0, 4.55, 10);
  pop();
  push([4.3, 0, 0], 90);             // west wall (x=4.3) frame, room at +x
  bookcase(4.1, 10.0, 0, 0, 4.55, 5);
  bookcase(0.35, 1.8, 0, 0, 4.55, 1);
  pop();
  // brass rail + ladder on south shelves
  rod([4.5, 4.35, -0.85], [14.8, 4.35, -0.85], 0.014, M.BRASS);
  {
    const lx = 9.3;
    for (const dx of [-0.24, 0.24]) beam([lx + dx, 0, -1.55], [lx + dx, 4.35, -0.86], 0.05, 0.03, M.WOOD, [0, 0, 1], { col: '#4a3020' });
    for (let i = 1; i < 14; i++) {
      const t = i / 14;
      rod([lx - 0.24, t * 4.35, -1.55 + t * 0.69], [lx + 0.24, t * 4.35, -1.55 + t * 0.69], 0.013, M.WOOD, { col: '#4a3020' });
    }
  }
  // rug + seating
  rug(5.8, -8.4, 11.0, -3.2, 2);
  chesterfield(10.25, -5.8, -90, 2.3, '#4a2716');
  clubChair(6.6, -7.2, 60, '#6d3b1d');
  clubChair(6.6, -4.3, 120, '#6d3b1d');
  // tufted leather ottoman
  rbox(8.3, 0.22, -5.8, 0.55, 0.18, 0.45, 0.07, M.LEATHER, { col: '#3b2a1c', x: 1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(8.3 + sx * 0.46, 0, -5.8 + sz * 0.36, 0.025, 0.06, M.WOOD, { col: '#2e1d10' });
  box(8.05, 0.4, -6.05, 8.5, 0.44, -5.72, M.PLAIN, { col: '#1f3326', x: 0.55 });
  box(8.08, 0.44, -6.0, 8.45, 0.47, -5.75, M.PLAIN, { col: '#7a5a2c', x: 0.55 });
  // side tables and lamps flanking sofa
  for (const z of [-7.35, -4.25]) {
    box(10.0, 0.0, z - 0.25, 10.5, 0.6, z + 0.25, M.WOOD, { col: '#3c2515' });
    box(9.97, 0.6, z - 0.28, 10.53, 0.63, z + 0.28, M.WOOD, { col: '#2f1c0f' });
    tableLamp(10.25, 0.63, z, 0.06);
  }
  // partners desk
  {
    const dx = 12.9, dz = -5.15;
    box(dx - 0.5, 0.0, dz - 0.9, dx + 0.5, 0.72, dz - 0.3, M.WOOD, { col: '#4b2a15' });
    box(dx - 0.5, 0.0, dz + 0.3, dx + 0.5, 0.72, dz + 0.9, M.WOOD, { col: '#4b2a15' });
    box(dx - 0.55, 0.72, dz - 0.95, dx + 0.55, 0.77, dz + 0.95, M.WOOD, { col: '#44260f' });
    box(dx - 0.45, 0.77, dz - 0.8, dx + 0.45, 0.772, dz + 0.8, M.LEATHER, { col: '#23402c' });
    for (let i = 0; i < 3; i++) for (const zz of [dz - 0.6, dz + 0.6]) {
      box(dx - 0.505, 0.1 + i * 0.2, zz - 0.26, dx - 0.5, 0.27 + i * 0.2, zz + 0.26, M.WOOD, { col: '#5a3219' });
      ell(dx - 0.51, 0.19 + i * 0.2, zz, 0.012, 0.012, 0.012, M.BRASS);
    }
    // banker's lamp
    post(dx + 0.1, 0.772, dz - 0.5, 0.07, 0.02, M.BRASS); post(dx + 0.1, 0.79, dz - 0.5, 0.01, 0.3, M.BRASS);
    add(T.CYL, [dx + 0.05, 1.12, dz - 0.5], [0.07, 0.17, 0.07], M.CERAMIC, { rot: [0, 0, 90], col: '#1f5a36' });
    light([dx + 0.05, 1.07, dz - 0.5], 0.025, 0.035, 'lamp');
    // books & inkwell
    box(dx - 0.2, 0.772, dz + 0.3, dx + 0.1, 0.84, dz + 0.55, M.PLAIN, { col: '#5c1f18', x: 0.5 });
    box(dx - 0.15, 0.772, dz - 0.05, dx + 0.15, 0.776, dz + 0.2, M.PLAIN, { col: '#e7dcc2', x: 0.8 });
    post(dx + 0.2, 0.772, dz + 0.1, 0.03, 0.05, M.CERAMIC, { col: '#1d1d22' });
    clubChair(dx + 0.95, dz, -90, '#5a2e14');
  }
  // globe on stand
  {
    const gx = 13.9, gz = -8.9;
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094;
      rod([gx + Math.cos(a) * 0.3, 0, gz + Math.sin(a) * 0.3], [gx, 0.55, gz], 0.018, M.WOOD, { col: '#4a2d18' });
    }
    add(T.CYL, [gx, 0.95, gz], [0.33, 0.012, 0.33], M.WOOD, { col: '#4a2d18' });
    ell(gx, 0.95, gz, 0.29, 0.29, 0.29, M.GLOBE, { rot: [0, 30, 23] });
  }
  painting(15.0, 2.4, -8.3, 0.8, 1.0, -90, 2);
  painting(15.0, 2.4, -2.0, 0.8, 1.0, -90, 3);

  // ================================================================ KITCHEN
  // inglenook on west wall
  box(-15, 0, 2.9, -14.0, 2.1, 3.6, M.STONE);
  box(-15, 0, 6.7, -14.0, 2.1, 7.4, M.STONE);
  box(-15, 2.45, 2.9, -14.0, 4.5, 7.4, M.STONE);
  box(-14.06, 2.1, 2.8, -13.9, 2.45, 7.5, M.BEAM, { seed: 5 });
  box(-15, 2.1, 3.6, -14.06, 2.45, 6.7, M.SOOT);
  box(-15, 0, 3.6, -14.93, 2.1, 6.7, M.SOOT, { seed: 2 });
  box(-15, 0, 3.6, -14.0, 2.1, 3.66, M.SOOT);
  box(-15, 0, 6.64, -14.0, 2.1, 6.7, M.SOOT);
  // range cooker (enamel) in the inglenook
  {
    const ax0 = -14.92, ax1 = -14.24, az0 = 4.4, az1 = 5.9;
    box(ax0, 0.0, az0, ax1, 0.88, az1, M.ENAMEL, { col: '#e3d7b8' });
    box(ax0, 0.88, az0, ax1, 0.9, az1, M.ENAMEL, { col: '#d5c8a6' });
    for (const zc of [4.8, 5.5]) {
      post((ax0 + ax1) / 2 + 0.03, 0.9, zc, 0.2, 0.06, M.CHROME);
      add(T.CYL, [ax1 - 0.02, 0.96, zc], [0.012, 0.09, 0.012], M.CHROME, { rot: [90, 0, 0] });
    }
    for (const [zc, yc] of [[4.8, 0.62], [5.5, 0.62], [4.8, 0.25], [5.5, 0.25]]) {
      box(ax1, yc - 0.15, zc - 0.2, ax1 + 0.03, yc + 0.15, zc + 0.2, M.ENAMEL, { col: '#e0d3b2' });
      add(T.CYL, [ax1 + 0.06, yc + 0.08, zc], [0.012, 0.14, 0.012], M.CHROME, { rot: [90, 0, 0] });
    }
    add(T.CYL, [ax1 + 0.1, 0.8, (az0 + az1) / 2], [0.012, 0.75, 0.012], M.CHROME, { rot: [90, 0, 0] });
    box(ax1 + 0.07, 0.55, 4.5, ax1 + 0.09, 0.79, 4.85, M.LINEN, { col: '#9eb0b8' });
    // copper kettle
    ell(-14.6, 1.05, 4.8, 0.13, 0.1, 0.13, M.COPPER);
    rod([-14.6, 1.1, 4.7], [-14.6, 1.22, 4.8], 0.01, M.BRASS);
    rod([-14.6, 1.22, 4.8], [-14.6, 1.1, 4.9], 0.01, M.BRASS);
    rod([-14.5, 1.03, 4.8], [-14.38, 1.1, 4.8], 0.015, M.COPPER);
  }
  // copper pans hanging on bressummer
  for (let i = 0; i < 4; i++) {
    const z = 3.9 + i * 0.85, r = 0.1 + 0.03 * (i % 3);
    add(T.CYL, [-13.86, 1.85 - r, z], [r, 0.02, r], M.COPPER, { rot: [0, 0, 90] });
    rod([-13.87, 1.85 - r * 0.2, z], [-13.87, 2.12, z], 0.012, M.BRASS);
  }
  // farmhouse table
  {
    const x0 = -11.2, x1 = -7.2, z0 = 4.65, z1 = 5.75;
    box(x0, 0.74, z0, x1, 0.8, z1, M.WOOD, { col: '#a88760', x: 0.62 });
    for (const lx of [x0 + 0.12, x1 - 0.12]) for (const lz of [z0 + 0.12, z1 - 0.12]) post(lx, 0, lz, 0.045, 0.74, M.WOOD, { col: '#8a6b47' });
    box(x0 + 0.08, 0.62, z0 + 0.08, x1 - 0.08, 0.74, z0 + 0.1, M.WOOD, { col: '#8a6b47' });
    box(x0 + 0.08, 0.62, z1 - 0.1, x1 - 0.08, 0.74, z1 - 0.08, M.WOOD, { col: '#8a6b47' });
    for (let i = 0; i < 3; i++) {
      const x = x0 + 0.7 + i * 1.3;
      woodChair(x, z1 + 0.5, 180, '#6a5337', null);
      woodChair(x + 0.15, z0 - 0.5, 0, '#6a5337', null);
    }
    // bowl of lemons, bread board
    post(-9.6, 0.8, 5.2, 0.17, 0.07, M.CERAMIC, { col: '#e9e4d8' });
    for (let i = 0; i < 5; i++) ell(-9.6 + Math.cos(i * 1.3) * 0.08, 0.9 + (i % 2) * 0.03, 5.2 + Math.sin(i * 1.3) * 0.08, 0.05, 0.038, 0.038, M.PLAIN, { col: '#d9b423', x: 0.4, rot: [0, i * 40, 0] });
    box(-8.3, 0.8, 4.95, -7.8, 0.825, 5.3, M.WOOD, { col: '#a9865a' });
    ell(-8.05, 0.87, 5.12, 0.17, 0.06, 0.1, M.PLAIN, { col: '#b27a3c', x: 0.75 });
  }
  // pot rack over table
  box(-10.9, 2.55, 5.0, -7.5, 2.57, 5.05, M.IRON);
  box(-10.9, 2.55, 5.35, -7.5, 2.57, 5.4, M.IRON);
  for (const x of [-10.8, -7.6]) rod([x, 2.57, 5.2], [x, 4.2, 5.2], 0.01, M.IRON);
  for (let i = 0; i < 6; i++) {
    const x = -10.6 + i * 0.6, r = 0.11 + 0.03 * ((i * 7) % 3);
    rod([x, 2.55, 5.2], [x, 2.35, 5.2], 0.006, M.IRON);
    add(T.CYL, [x, 2.32 - r, 5.2], [r, 0.035, r], M.COPPER, { rot: [90, 0, 0] });
  }
  // enamel pendant lights
  for (const x of [-10.1, -8.3]) {
    rod([x, 1.95, 5.2], [x, 4.2, 5.2], 0.006, M.IRON);
    add(T.CONE, [x, 1.86, 5.2], [0.22, 0.09, 0.05], M.ENAMEL, { r: 1, col: '#2f4a3c' });
    ell(x, 1.8, 5.2, 0.04, 0.05, 0.04, M.BULB, { flags: F.CAMONLY, collide: false });
    light([x, 1.8, 5.2], 0.03, 0.12, 'lamp');
  }
  // dried herbs and garlic hanging from the pot rack
  for (let i = 0; i < 9; i++) {
    const x = -10.75 + i * 0.4, z = 5.02 + (i % 2) * 0.36;
    rod([x, 2.55, z], [x, 2.38, z], 0.004, M.PLAIN, { col: '#8a7a5a', x: 0.9 });
    ell(x, 2.28, z, 0.05, 0.12, 0.05, M.PLAIN, { col: i % 3 === 0 ? '#9c8d6a' : '#5d6a3e', x: 0.95 });
  }
  // butcher block + baskets
  box(-13.5, 0.0, 7.6, -12.7, 0.82, 8.4, M.WOOD, { col: '#8a6a45' });
  box(-13.55, 0.82, 7.55, -12.65, 0.92, 8.45, M.WOOD, { col: '#a9865a', x: 0.6 });
  for (const [bx, bz] of [[-5.2, 9.5], [-4.75, 9.55]]) { post(bx, 0, bz, 0.22, 0.32, M.PLAIN, { col: '#8d6d45', x: 0.95 }); }
  // brass lamp inside the inglenook
  post(-14.95, 1.5, 3.95, 0.05, 0.02, M.BRASS);
  ell(-14.88, 1.62, 3.95, 0.05, 0.08, 0.05, M.BULB, { flags: F.CAMONLY, collide: false });
  light([-14.85, 1.62, 3.95], 0.04, 0.03, 'lamp');
  // base cabinets + worktop along south wall with belfast sink
  box(-14.9, 0.0, 9.35, -8.4, 0.1, 10.0, M.PAINTED, { col: '#2f3530' });
  box(-14.9, 0.1, 9.4, -8.4, 0.88, 10.0, M.PAINTED, { col: '#7d8a72' });
  for (let i = 0; i < 9; i++) {
    const x0 = -14.85 + i * 0.715;
    if (x0 > -12.6 && x0 < -11.3) continue;
    box(x0 + 0.03, 0.16, 9.37, x0 + 0.685, 0.82, 9.4, M.PAINTED, { col: '#859379' });
    ell(x0 + 0.35, 0.74, 9.36, 0.013, 0.013, 0.013, M.BRASS);
  }
  box(-14.95, 0.88, 9.3, -12.45, 0.93, 10.0, M.WOOD, { col: '#7a5431', x: 0.4 });
  box(-11.55, 0.88, 9.3, -8.35, 0.93, 10.0, M.WOOD, { col: '#7a5431', x: 0.4 });
  // sink: hollow ceramic
  box(-12.45, 0.62, 9.25, -11.55, 0.64, 10.0, M.CERAMIC);
  box(-12.45, 0.62, 9.25, -11.55, 0.93, 9.31, M.CERAMIC);
  box(-12.45, 0.62, 9.9, -11.55, 0.93, 10.0, M.CERAMIC);
  box(-12.45, 0.62, 9.25, -12.39, 0.93, 10.0, M.CERAMIC);
  box(-11.61, 0.62, 9.25, -11.55, 0.93, 10.0, M.CERAMIC);
  box(-12.45, 0.1, 9.4, -11.55, 0.62, 9.42, M.LINEN, { col: '#b8b09c' });
  post(-12.0, 0.93, 9.93, 0.02, 0.28, M.BRASS);
  rod([-12.0, 1.21, 9.93], [-12.0, 1.19, 9.66], 0.016, M.BRASS);
  for (const dx of [-0.13, 0.13]) { post(-12.0 + dx, 0.93, 9.93, 0.015, 0.14, M.BRASS); ell(-12.0 + dx, 1.08, 9.93, 0.03, 0.012, 0.03, M.BRASS); }
  // welsh dresser on north wall
  {
    const x0 = -8.6, x1 = -6.0;
    box(x0, 0.0, 0.3, x1, 0.9, 0.85, M.PAINTED, { col: '#c9c0a5' });
    box(x0 - 0.03, 0.9, 0.3, x1 + 0.03, 0.94, 0.9, M.WOOD, { col: '#7a5431' });
    box(x0, 0.94, 0.3, x1, 2.35, 0.34, M.PAINTED, { col: '#bfb599' });
    box(x0, 0.94, 0.3, x0 + 0.05, 2.35, 0.62, M.PAINTED, { col: '#c9c0a5' });
    box(x1 - 0.05, 0.94, 0.3, x1, 2.35, 0.62, M.PAINTED, { col: '#c9c0a5' });
    box(x0 - 0.04, 2.35, 0.3, x1 + 0.04, 2.45, 0.66, M.PAINTED, { col: '#c9c0a5' });
    for (const y of [1.45, 1.95]) {
      box(x0, y, 0.34, x1, y + 0.025, 0.6, M.PAINTED, { col: '#c9c0a5' });
      for (let i = 0; i < 6; i++) {
        const px = x0 + 0.25 + i * 0.42;
        add(T.CYL, [px, y + 0.18, 0.41], [0.15, 0.012, 0.15], M.CERAMIC, { rot: [-78, 0, 0], x: 1, seed: i + y });
      }
    }
    for (let i = 0; i < 6; i++) { post(x0 + 0.3 + i * 0.4, 0.94, 0.55, 0.045, 0.1, M.CERAMIC, { x: 1, seed: i * 3 }); }
    for (let i = 0; i < 3; i++) {
      box(x0 + 0.05 + i * 0.85, 0.08, 0.85, x0 + 0.85 + i * 0.85, 0.8, 0.87, M.PAINTED, { col: '#d1c8ad' });
      ell(x0 + 0.45 + i * 0.85, 0.6, 0.875, 0.013, 0.013, 0.013, M.BRASS);
    }
  }
  // open shelves with crocks and jars
  for (const y of [1.55, 2.1]) {
    box(-14.6, y, 0.3, -11.3, y + 0.04, 0.62, M.WOOD, { col: '#6d4a2b' });
    for (let i = 0; i < 7; i++) {
      const x = -14.4 + i * 0.47, hh = 0.14 + ((i * 5) % 4) * 0.04;
      const mat = i % 3 === 0 ? M.COPPER : M.CERAMIC;
      post(x, y + 0.04, 0.46, 0.07 + (i % 2) * 0.02, hh, mat, { col: ['#e8e2d3', '#c8b48a', '#6d7f8a', '#e3dccd'][i % 4] });
    }
  }
  for (const x of [-14.5, -11.4]) box(x - 0.02, 1.35, 0.3, x + 0.02, 1.55, 0.6, M.IRON);
  // tall larder cupboard
  box(-4.0, 0.0, 6.6, -3.3, 2.3, 8.6, M.PAINTED, { col: '#7d8a72' });
  box(-4.02, 0.08, 6.7, -4.0, 2.2, 7.58, M.PAINTED, { col: '#859379' });
  box(-4.02, 0.08, 7.62, -4.0, 2.2, 8.5, M.PAINTED, { col: '#859379' });
  for (const z of [7.48, 7.72]) post(-4.04, 1.1, z, 0.012, 0.18, M.BRASS);
  painting(-3.3, 2.3, 2.3, 0.7, 0.55, -90, 1);
  box(-14.0, 0, 1.2, -13.2, 0.45, 1.9, M.PLAIN, { col: '#6a5436', x: 0.9 });  // wicker log basket-ish

  // ================================================================ ENTRANCE HALL
  // open front door, against west reveal
  box(0.52, 0.06, 8.02, 0.62, 3.28, 9.98, M.BOARDS, { col: '#4f3522', x: 1 });
  for (const y of [0.5, 2.8]) box(0.62, y, 8.2, 0.64, y + 0.08, 9.9, M.IRON);
  box(0.62, 1.05, 8.28, 0.64, 1.3, 8.4, M.IRON);
  add(T.CYL, [0.655, 1.1, 8.34], [0.012, 0.03, 0.012], M.IRON, { rot: [0, 0, 90] });
  rod([0.68, 1.1, 8.34], [0.68, 0.98, 8.34], 0.01, M.IRON);
  rug(0.65, 1.4, 2.35, 9.2, 3);
  // console + mirror on east wall
  push([5.7, 0, 2.6], -90);
  box(-0.8, 0.8, 0.0, 0.8, 0.85, 0.42, M.WOOD, { col: '#5a3419' });
  for (const sx of [-1, 1]) for (const sz of [0.05, 0.37]) post(sx * 0.75, 0, sz, 0.022, 0.8, M.WOOD, { col: '#4a2a14' });
  box(-0.75, 0.15, 0.03, 0.75, 0.18, 0.4, M.WOOD, { col: '#4a2a14' });
  cbox(0, 1.85, 0.03, 0.55, 0.72, 0.012, M.MIRROR);
  cbox(0, 2.62, 0.05, 0.64, 0.06, 0.04, M.GILT);
  cbox(0, 1.08, 0.05, 0.64, 0.06, 0.04, M.GILT);
  cbox(-0.6, 1.85, 0.05, 0.05, 0.72, 0.04, M.GILT, { x: 1 });
  cbox(0.6, 1.85, 0.05, 0.05, 0.72, 0.04, M.GILT, { x: 1 });
  pop();
  tableLamp(5.45, 0.85, 3.25, 0.06, M.CERAMIC, '#2e3f55');
  post(5.4, 0.85, 1.95, 0.13, 0.08, M.CERAMIC, { col: '#e0dccd' });
  box(5.1, 0.85, 2.4, 5.45, 0.9, 2.8, M.PLAIN, { col: '#243044', x: 0.5 });
  // bench + boots + umbrellas on west wall
  box(-2.7, 0.0, 6.6, -2.25, 0.45, 8.6, M.WOOD, { col: '#5b3d24' });
  box(-2.7, 0.45, 6.55, -2.2, 0.49, 8.65, M.WOOD, { col: '#4c321d' });
  rbox(-2.45, 0.53, 7.6, 0.2, 0.04, 0.9, 0.03, M.LINEN, { col: '#6f7a5e' });
  box(-2.7, 1.72, 6.55, -2.66, 1.84, 8.65, M.WOOD, { col: '#4c321d' });
  for (let i = 0; i < 5; i++) rod([-2.66, 1.78, 6.8 + i * 0.45], [-2.52, 1.83, 6.8 + i * 0.45], 0.012, M.BRASS);
  rbox(-2.55, 1.4, 7.25, 0.08, 0.38, 0.22, 0.07, M.WOOL, { col: '#4b5a3f', x: 1 });
  rbox(-2.55, 1.35, 8.15, 0.07, 0.42, 0.2, 0.07, M.WOOL, { col: '#6b5a44', x: 1 });
  for (const [bx, bz] of [[-1.95, 6.9], [-1.95, 7.05], [-1.95, 7.5], [-1.95, 7.65]]) {
    post(bx, 0, bz, 0.05, 0.42, M.PLAIN, { col: '#1f2a1c', x: 0.4 });
    rbox(bx + 0.06, 0.04, bz, 0.12, 0.04, 0.05, 0.03, M.PLAIN, { col: '#1f2a1c', x: 0.4 });
  }
  post(-2.35, 0, 9.3, 0.13, 0.55, M.CERAMIC, { col: '#2b3a52' });
  for (let i = 0; i < 3; i++) rod([-2.35 + (i - 1) * 0.05, 0.1, 9.3], [-2.35 + (i - 1) * 0.12, 1.0, 9.3 + (i - 1) * 0.05], 0.012, M.PLAIN, { col: ['#1a1a1a', '#233524', '#5a1c1c'][i], x: 0.5 });
  // paintings
  painting(-1.2, 2.2, 0.3, 1.1, 1.4, 0, 2);
  painting(4.0, 2.2, 0.3, 1.1, 1.4, 0, 3);
  // brass lantern pendant
  {
    const lx = 1.5, ly = 3.05, lz = 5.2;
    rod([lx, ly + 0.36, lz], [lx, 4.5, lz], 0.008, M.BRASS);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(lx + sx * 0.17, ly - 0.3, lz + sz * 0.17, 0.012, 0.6, M.BRASS);
    cone(lx, ly + 0.36, lz, 0.25, 0.06, 0.05, M.BRASS);
    box(lx - 0.2, ly - 0.33, lz - 0.2, lx + 0.2, ly - 0.3, lz + 0.2, M.BRASS);
    box(lx - 0.17, ly - 0.3, lz + 0.165, lx + 0.17, ly + 0.3, lz + 0.17, M.GLASS, { flags: F.TRANS, x: 1 });
    box(lx - 0.17, ly - 0.3, lz - 0.17, lx + 0.17, ly + 0.3, lz - 0.165, M.GLASS, { flags: F.TRANS, x: 1 });
    box(lx - 0.17, ly - 0.3, lz - 0.17, lx - 0.165, ly + 0.3, lz + 0.17, M.GLASS, { flags: F.TRANS, x: 1 });
    box(lx + 0.165, ly - 0.3, lz - 0.17, lx + 0.17, ly + 0.3, lz + 0.17, M.GLASS, { flags: F.TRANS, x: 1 });
    ell(lx, ly, lz, 0.03, 0.05, 0.03, M.BULB, { flags: F.CAMONLY, collide: false });
    light([lx, ly, lz], 0.03, 0.08, 'lamp');
  }

  // ================================================================ BEDROOM
  // fireplace on north wall (z = 0.3)
  box(9.8, 0, 0.3, 10.2, 1.0, 0.95, M.STONE_TRIM, { seed: 31 });
  box(11.1, 0, 0.3, 11.5, 1.0, 0.95, M.STONE_TRIM, { seed: 32 });
  box(9.8, 1.0, 0.3, 11.5, 1.3, 0.97, M.STONE_TRIM, { seed: 33 });
  box(9.7, 1.3, 0.3, 11.6, 1.38, 1.08, M.STONE_TRIM, { seed: 34 });
  box(9.85, 1.38, 0.3, 11.45, 4.2, 0.8, M.STONE);
  box(10.2, 0, 0.3, 11.1, 1.0, 0.36, M.SOOT);
  box(10.2, 0.94, 0.3, 11.1, 1.0, 0.95, M.SOOT);
  box(9.6, 0, 0.95, 11.7, 0.04, 1.5, M.MARBLE);
  fire(10.65, 0.0, 0.62, 0.8, 0.5, 0, 0.7, 0.08);
  candlestick(9.95, 1.38, 0.75, 0.22); candlestick(11.35, 1.38, 0.75, 0.22);
  post(10.65, 1.38, 0.62, 0.06, 0.2, M.CERAMIC, { col: '#dfe3e6', x: 1 });
  painting(10.65, 2.5, 0.8, 1.3, 0.9, 0, 1);
  // four-poster bed, headboard against east wall
  {
    const bx0 = 12.7, bx1 = 14.95, bz0 = 3.5, bz1 = 5.7, bzc = (bz0 + bz1) / 2;
    const oak = { col: '#4a2c16' };
    box(bx0 + 0.05, 0.22, bz0 + 0.05, bx1 - 0.05, 0.42, bz1 - 0.05, M.WOOD, oak);
    for (const px of [bx0 + 0.06, bx1 - 0.06]) for (const pz of [bz0 + 0.06, bz1 - 0.06]) post(px, 0, pz, 0.055, 2.35, M.WOOD, oak);
    box(bx0, 2.3, bz0, bx1, 2.42, bz0 + 0.1, M.WOOD, oak);
    box(bx0, 2.3, bz1 - 0.1, bx1, 2.42, bz1, M.WOOD, oak);
    box(bx0, 2.3, bz0, bx0 + 0.1, 2.42, bz1, M.WOOD, oak);
    box(bx1 - 0.1, 2.3, bz0, bx1, 2.42, bz1, M.WOOD, oak);
    rbox(bx1 - 0.08, 1.05, bzc, 0.05, 0.55, 1.0, 0.05, M.LINEN, { col: '#b9ae98' });   // headboard
    rbox(13.82, 0.56, bzc, 1.06, 0.14, 0.98, 0.07, M.LINEN, { col: '#f0ece2' });       // mattress
    rbox(13.62, 0.73, bzc, 0.9, 0.06, 1.02, 0.06, M.LINEN, { col: '#ece6d8' });        // duvet
    rbox(14.3, 0.8, bzc, 0.32, 0.03, 1.04, 0.03, M.LINEN, { col: '#f3efe6' });         // turned-down sheet
    for (const pz of [bzc - 0.48, bzc + 0.48]) {
      rbox(14.62, 0.9, pz, 0.14, 0.12, 0.38, 0.1, M.LINEN, { col: '#f2eee5', rot: [0, 0, 18] });
      rbox(14.4, 0.86, pz, 0.12, 0.1, 0.36, 0.09, M.LINEN, { col: '#e9e2d2', rot: [0, 0, 22] });
    }
    rbox(13.08, 0.8, bzc, 0.28, 0.035, 1.08, 0.03, M.WOOL, { col: '#5b6b4e' });       // throw across foot
    rbox(12.83, 0.55, bzc, 0.03, 0.25, 1.08, 0.025, M.WOOL, { col: '#5b6b4e' });
    for (const pz of [bz0 + 0.3, bz1 - 0.3]) rbox(bx1 - 0.14, 1.2, pz, 0.28, 1.05, 0.05, 0.04, M.LINEN, { col: '#d9d0bf', x: 2, rot: [0, 90, 0] });
    for (const pz of [bz0 + 0.1, bz1 - 0.1]) ell(bx0 + 0.07, 1.25, pz, 0.13, 1.05, 0.12, M.LINEN, { col: '#d9d0bf' });
    rbox((bx0 + bx1) / 2, 2.2, bz0 - 0.02, (bx1 - bx0) / 2 + 0.03, 0.12, 0.02, 0.015, M.LINEN, { col: '#d9d0bf', x: 2 });
    rbox((bx0 + bx1) / 2, 2.2, bz1 + 0.02, (bx1 - bx0) / 2 + 0.03, 0.12, 0.02, 0.015, M.LINEN, { col: '#d9d0bf', x: 2 });
    rbox(bx0 - 0.02, 2.2, (bz0 + bz1) / 2, (bz1 - bz0) / 2 + 0.03, 0.12, 0.02, 0.015, M.LINEN, { col: '#d9d0bf', x: 2, rot: [0, 90, 0] });
    // bench at foot
    box(12.05, 0.0, 3.95, 12.45, 0.4, 5.25, M.WOOD, { col: '#3a2412' });
    rbox(12.25, 0.45, 4.6, 0.21, 0.06, 0.66, 0.05, M.LEATHER, { col: '#6a3a1c', x: 1 });
    // bedside tables
    for (const z of [bz0 - 0.5, bz1 + 0.5]) {
      box(14.45, 0.0, z - 0.25, 14.95, 0.62, z + 0.25, M.WOOD, { col: '#553219' });
      box(14.43, 0.62, z - 0.27, 14.97, 0.65, z + 0.27, M.WOOD, { col: '#4a2a14' });
      box(14.44, 0.4, z - 0.2, 14.45, 0.55, z + 0.2, M.WOOD, { col: '#5e3a1f' });
      tableLamp(14.72, 0.65, z, 0.05, M.CERAMIC, '#c8cdc6');
    }
    box(14.55, 0.65, bz0 - 0.62, 14.75, 0.69, bz0 - 0.42, M.PLAIN, { col: '#3d2a1e', x: 0.6 });
  }
  rug(11.3, 2.3, 15.0, 6.9, 4);
  // wardrobe on west wall (x=6.3)
  {
    const z0 = 1.2, z1 = 3.1;
    box(6.3, 0.1, z0, 6.95, 2.3, z1, M.WOOD, { col: '#4d2711' });
    box(6.3, 0.0, z0 + 0.03, 6.92, 0.1, z1 - 0.03, M.WOOD, { col: '#3b1d0c' });
    box(6.3, 2.3, z0 - 0.05, 7.02, 2.42, z1 + 0.05, M.WOOD, { col: '#3b1d0c' });
    for (const [a, b] of [[z0 + 0.08, (z0 + z1) / 2 - 0.02], [(z0 + z1) / 2 + 0.02, z1 - 0.08]]) {
      box(6.95, 0.25, a, 6.975, 2.15, b, M.WOOD, { col: '#5a3016' });
      box(6.975, 0.45, a + 0.1, 6.985, 1.95, b - 0.1, M.WOOD, { col: '#4a260f' });
    }
    for (const z of [(z0 + z1) / 2 - 0.06, (z0 + z1) / 2 + 0.06]) ell(7.0, 1.2, z, 0.015, 0.015, 0.015, M.BRASS);
  }
  // chest of drawers + mirror
  {
    const z0 = 7.4, z1 = 8.9;
    box(6.3, 0.08, z0, 6.85, 0.95, z1, M.WOOD, { col: '#5a3016' });
    box(6.3, 0.95, z0 - 0.03, 6.88, 0.99, z1 + 0.03, M.WOOD, { col: '#4a260f' });
    for (let i = 0; i < 4; i++) {
      box(6.85, 0.13 + i * 0.2, z0 + 0.05, 6.87, 0.3 + i * 0.2, z1 - 0.05, M.WOOD, { col: '#6a3a1c' });
      for (const z of [z0 + 0.35, z1 - 0.35]) ell(6.88, 0.215 + i * 0.2, z, 0.014, 0.014, 0.014, M.BRASS);
    }
    for (const z of [z0 + 0.05, z1 - 0.05]) for (const x of [6.35, 6.8]) post(x, 0, z, 0.025, 0.08, M.WOOD, { col: '#3b1d0c' });
    push([6.3, 0, (z0 + z1) / 2], 90);
    cbox(0, 1.75, 0.03, 0.45, 0.6, 0.012, M.MIRROR);
    cbox(0, 2.39, 0.05, 0.53, 0.05, 0.04, M.GILT); cbox(0, 1.11, 0.05, 0.53, 0.05, 0.04, M.GILT);
    cbox(-0.49, 1.75, 0.05, 0.04, 0.6, 0.04, M.GILT, { x: 1 }); cbox(0.49, 1.75, 0.05, 0.04, 0.6, 0.04, M.GILT, { x: 1 });
    pop();
    post(6.6, 0.99, 7.75, 0.08, 0.22, M.CERAMIC, { col: '#e8e4da' });
    for (let i = 0; i < 5; i++) rod([6.6, 1.15, 7.75], [6.6 + Math.cos(i * 1.26) * 0.12, 1.45 + (i % 2) * 0.08, 7.75 + Math.sin(i * 1.26) * 0.12], 0.004, M.PLAIN, { col: '#5d6b3c', x: 0.8 });
    for (let i = 0; i < 5; i++) ell(6.6 + Math.cos(i * 1.26) * 0.12, 1.46 + (i % 2) * 0.08, 7.75 + Math.sin(i * 1.26) * 0.12, 0.035, 0.03, 0.035, M.PLAIN, { col: '#e9e4f0', x: 0.9 });
  }
  // linen armchair + side table + reading lamp by the fire
  push([8.7, 0, 2.2], 150);
  rbox(0, 0.25, 0, 0.42, 0.18, 0.4, 0.08, M.LINEN, { col: '#b6a386' });
  rbox(0, 0.47, 0.06, 0.32, 0.07, 0.32, 0.06, M.LINEN, { col: '#bfae90' });
  rbox(0, 0.72, -0.32, 0.4, 0.34, 0.1, 0.1, M.LINEN, { col: '#b6a386' });
  rbox(-0.35, 0.53, 0.0, 0.08, 0.14, 0.4, 0.08, M.LINEN, { col: '#b6a386' });
  rbox(0.35, 0.53, 0.0, 0.08, 0.14, 0.4, 0.08, M.LINEN, { col: '#b6a386' });
  rbox(0.05, 0.58, -0.12, 0.22, 0.14, 0.05, 0.06, M.WOOL, { col: '#7c4b3a', rot: [-20, 0, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(sx * 0.35, 0, sz * 0.33, 0.022, 0.08, M.WOOD, { col: '#3b1d0c' });
  pop();
  post(7.8, 0, 1.5, 0.2, 0.62, M.WOOD, { col: '#4a2a14' });
  post(7.8, 0.62, 1.5, 0.24, 0.02, M.WOOD, { col: '#3b1d0c' });
  post(7.75, 0.64, 1.45, 0.05, 0.1, M.CERAMIC, { col: '#f0ece2' });
  // linen sofa + ottoman facing the bedroom fire
  push([10.65, 0, 3.05], 180);
  rbox(0, 0.22, 0, 0.98, 0.16, 0.44, 0.07, M.LINEN, { col: '#a99a80' });
  rbox(0, 0.62, -0.34, 0.96, 0.28, 0.12, 0.1, M.LINEN, { col: '#a99a80', rot: [-8, 0, 0] });
  for (const sx of [-1, 1]) rbox(sx * 0.88, 0.5, 0.0, 0.12, 0.2, 0.44, 0.1, M.LINEN, { col: '#a99a80' });
  for (const sx of [-1, 1]) rbox(sx * 0.38, 0.44, 0.07, 0.37, 0.08, 0.34, 0.07, M.LINEN, { col: '#b3a589' });
  rbox(-0.5, 0.64, -0.2, 0.2, 0.17, 0.06, 0.06, M.WOOL, { col: '#6d7d86', x: 1, rot: [-15, 12, 0] });
  rbox(0.55, 0.64, -0.2, 0.2, 0.17, 0.06, 0.06, M.LINEN, { col: '#8c6f55', rot: [-15, -10, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(sx * 0.9, 0, sz * 0.36, 0.025, 0.07, M.WOOD, { col: '#3b1d0c' });
  pop();
  rbox(10.65, 0.22, 1.95, 0.45, 0.18, 0.3, 0.06, M.LEATHER, { col: '#5a3a24' });
  box(10.35, 0.4, 1.8, 10.85, 0.44, 2.1, M.PLAIN, { col: '#2b3b30', x: 0.55 });
  rug(9.2, 1.45, 12.1, 3.9, 3);
  // writing desk under the east window
  box(14.35, 0.72, 7.6, 14.95, 0.76, 9.0, M.WOOD, { col: '#4a2811' });
  for (const z of [7.65, 8.95]) for (const x of [14.4, 14.9]) post(x, 0, z, 0.025, 0.72, M.WOOD, { col: '#3b1d0c' });
  box(14.4, 0.6, 7.7, 14.93, 0.72, 8.9, M.WOOD, { col: '#55301a' });
  woodChair(13.95, 8.3, 90, '#4f321d', '#b9ad96');
  box(14.6, 0.76, 8.5, 14.85, 0.8, 8.8, M.PLAIN, { col: '#6b2a20', x: 0.5 });
  post(14.7, 0.76, 7.85, 0.05, 0.14, M.CERAMIC, { col: '#e8e4da' });
  // floor lamp by the armchair
  post(7.9, 0, 2.9, 0.13, 0.03, M.BRASS); post(7.9, 0, 2.9, 0.014, 1.4, M.BRASS);
  lampShadeLight(7.9, 1.5, 2.9, 0.06, 0.22, 0.28);
  painting(15.0, 2.0, 8.3 - 1.4, 0.7, 0.9, -90, 2);
  painting(9.2, 2.2, 10.0, 0.8, 0.6, 180, 1);

  // ================================================================ EXTERIOR GARDEN
  // terracotta urns with clipped box balls flanking the entrance
  for (const x of [-0.7, 3.7]) {
    cone(x, -0.5 + 0.35, 12.3, 0.22, 0.35, 0.36, M.TERRACOTTA);
    post(x, 0.2, 12.3, 0.38, 0.06, M.TERRACOTTA);
    ell(x, 0.72, 12.3, 0.48, 0.44, 0.48, M.HEDGE);
  }
  // exterior lanterns beside door
  for (const x of [-0.05, 3.05]) {
    box(x - 0.03, 2.2, 11.0, x + 0.03, 2.3, 11.25, M.IRON);
    box(x - 0.1, 1.9, 11.14, x + 0.1, 2.2, 11.34, M.IRON);
    box(x - 0.08, 1.93, 11.16, x + 0.08, 2.18, 11.32, M.GLASS, { flags: F.TRANS, x: 1 });
    cone(x, 2.26, 11.24, 0.14, 0.06, 0.02, M.IRON);
    light([x, 2.05, 11.24], 0.025, 0.03, 'lamp');
  }
  // formal parterre either side of the drive
  function parterre(x0, x1, z0, z1) {
    const h = 0.28, w = 0.22, y = -0.5 + h;
    rbox((x0 + x1) / 2, y, z0, (x1 - x0) / 2, h, w, 0.14, M.HEDGE);
    rbox((x0 + x1) / 2, y, z1, (x1 - x0) / 2, h, w, 0.14, M.HEDGE);
    rbox(x0, y, (z0 + z1) / 2, w, h, (z1 - z0) / 2 - w, 0.14, M.HEDGE);
    rbox(x1, y, (z0 + z1) / 2, w, h, (z1 - z0) / 2 - w, 0.14, M.HEDGE);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    cone(cx, -0.5 + 1.4, cz, 0.85, 1.4, 0.05, M.HEDGE);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ell(cx + sx * (x1 - x0) * 0.3, -0.5 + 0.42, cz + sz * (z1 - z0) * 0.3, 0.45, 0.42, 0.45, M.HEDGE);
  }
  parterre(-13, -4.5, 16, 26);
  parterre(7.5, 16, 16, 26);
  parterre(-13, -4.5, 29, 39);
  parterre(7.5, 16, 29, 39);
  // mature trees around the lawn
  function tree(x, z, s) {
    const r = mulberry32(Math.floor(x * 100 + z * 7 + 999));
    const top = 3.6 * s;
    rod([x, -0.6, z], [x + 0.2 * s, top, z - 0.1 * s], 0.32 * s, M.LOG, { seed: x });
    ell(x, -0.45, z, 0.5 * s, 0.25 * s, 0.5 * s, M.LOG, { seed: z });
    const blobs = 16;
    for (let i = 0; i < blobs; i++) {
      const a = r() * 6.28, d = (0.4 + r() * 2.8) * s, hgt = top + (0.6 + r() * 4.6) * s;
      const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
      rod([x + 0.2 * s, top - 0.3 * s, z - 0.1 * s], [cx, hgt - 0.4 * s, cz], (0.07 + 0.08 * r()) * s, M.LOG, { seed: i });
      const rr = (1.3 + r() * 1.1) * s;
      ell(cx, hgt, cz, rr, rr * (0.75 + r() * 0.3), rr, M.HEDGE, { x: 1, flags: F.POROUS | F.TRANS });
    }
  }
  // rolling hills and woodland belts in the middle distance
  {
    const r = mulberry32(4242);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + r() * 0.3, d = 330 + r() * 380;
      const rx = 140 + r() * 180, ry = 18 + r() * 30, rz = 140 + r() * 180;
      ell(Math.cos(a) * d, -0.5 - ry * 0.35, Math.sin(a) * d, rx, ry, rz, M.MEADOW, { rot: [0, r() * 180, 0], collide: false });
    }
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = 95 + r() * 150;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z > 8 && Math.abs(x - 1.5) < 30) continue;   // keep the drive vista open
      const s2 = 3.5 + r() * 3;
      const nb = 3 + Math.floor(r() * 4);
      for (let b = 0; b < nb; b++) {
        const bx = x + (r() - 0.5) * s2 * 3, bz = z + (r() - 0.5) * s2 * 3, rr = s2 * (0.7 + r() * 0.5);
        ell(bx, -0.5 + rr * 0.8 + r() * s2 * 1.2, bz, rr, rr * (0.8 + r() * 0.3), rr, M.HEDGE, { x: 1, flags: F.POROUS | F.TRANS, collide: false });
      }
    }
  }
  tree(-14, -36, 1.2); tree(30, -26, 1.4); tree(-44, 24, 1.5); tree(46, 30, 1.3); tree(-52, -4, 1.6); tree(52, 6, 1.4);
  tree(-34, 10, 1.3); tree(-38, -12, 1.5); tree(36, 18, 1.4); tree(40, -6, 1.2); tree(-30, 42, 1.4); tree(34, 46, 1.6);
  tree(-22, -34, 1.3); tree(18, -38, 1.5);

  // front door opening
  portals.push({ c: [1.5, 1.675, 10], u: [1.0, 0, 0], v: [0, 1.625, 0], n: [0, 0, -1] });
  return { prims, lights, portals };
}
