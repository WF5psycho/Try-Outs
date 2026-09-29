// Small vector / quaternion helpers (no external libraries).
'use strict';
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

const Q = {
  ident: () => [0, 0, 0, 1],
  axisAngle: (ax, deg) => {
    const a = deg * Math.PI / 360, s = Math.sin(a);
    const n = V.norm(ax);
    return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a)];
  },
  mul: (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ],
  // euler degrees [rx, ry, rz] applied as roll(z) then pitch(x) then yaw(y)
  euler: (r) => {
    const qx = Q.axisAngle([1, 0, 0], r[0] || 0);
    const qy = Q.axisAngle([0, 1, 0], r[1] || 0);
    const qz = Q.axisAngle([0, 0, 1], r[2] || 0);
    return Q.mul(qy, Q.mul(qx, qz));
  },
  rot: (q, v) => {
    // v + 2*cross(q.xyz, cross(q.xyz, v) + q.w*v)
    const u = [q[0], q[1], q[2]];
    const t = V.add(V.cross(u, v), V.mul(v, q[3]));
    return V.add(v, V.mul(V.cross(u, t), 2));
  },
  // quaternion from orthonormal basis columns (x,y,z axes of the local frame in world)
  fromBasis: (x, y, z) => {
    const m00 = x[0], m10 = x[1], m20 = x[2];
    const m01 = y[0], m11 = y[1], m21 = y[2];
    const m02 = z[0], m12 = z[1], m22 = z[2];
    const tr = m00 + m11 + m22;
    let qx, qy, qz, qw;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1.0) * 2;
      qw = 0.25 * s; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
      qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
      qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
      qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s;
    }
    const l = Math.hypot(qx, qy, qz, qw);
    return [qx / l, qy / l, qz / l, qw / l];
  },
};

// Deterministic PRNG for scene building
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Blackbody (Kelvin) -> linear RGB, normalised to luminance 1
function kelvinRGB(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = [r, g, b].map(v => Math.pow(Math.min(255, Math.max(0, v)) / 255, 2.2));
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return c.map(v => v / l);
}
