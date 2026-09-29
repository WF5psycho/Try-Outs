// First-person walk / fly controls with simple AABB collision.
'use strict';

class Controls {
  constructor(canvas, prims) {
    this.canvas = canvas;
    this.pos = [1.5, 1.2, 44];
    this.yaw = 0; this.pitch = 0;
    this.fly = false;
    this.vy = 0;
    this.keys = new Set();
    this.changed = true;
    this.eye = 1.62;
    this.fov = 70;
    // colliders (world AABBs)
    this.cols = prims.filter(p => p.collide).map(p => p.aabb);
    this.grid = new Map();
    this.cell = 2.0;
    this.cols.forEach((b, i) => {
      for (let x = Math.floor(b.mn[0] / this.cell); x <= Math.floor(b.mx[0] / this.cell); x++)
        for (let z = Math.floor(b.mn[2] / this.cell); z <= Math.floor(b.mx[2] / this.cell); z++) {
          const k = x + ',' + z;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(i);
        }
    });
    this.bind();
  }

  bind() {
    const c = this.canvas;
    c.addEventListener('click', () => { if (document.pointerLockElement !== c) c.requestPointerLock && c.requestPointerLock(); });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== c) return;
      this.look(e.movementX, e.movementY);
    });
    let drag = null;
    c.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') drag = { x: e.clientX, y: e.clientY }; });
    c.addEventListener('pointermove', (e) => { if (drag && e.pointerType !== 'mouse') { this.look(e.clientX - drag.x, e.clientY - drag.y); drag = { x: e.clientX, y: e.clientY }; } });
    c.addEventListener('pointerup', () => { drag = null; });
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF') { this.fly = !this.fly; this.vy = 0; this.changed = true; if (this.onMode) this.onMode(); }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  look(dx, dy) {
    this.yaw += dx * 0.0022;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * 0.0022));
    this.changed = true;
  }

  setView(v) {
    this.pos = v.pos.slice();
    if (v.target) {
      const d = V.norm(V.sub(v.target, v.pos));
      this.yaw = Math.atan2(d[0], -d[2]);
      this.pitch = Math.asin(d[1]);
    } else { this.yaw = v.yaw; this.pitch = v.pitch; }
    if (v.fly !== undefined) this.fly = v.fly;
    this.changed = true;
  }

  basis() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd = [Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp];
    const right = V.norm(V.cross(fwd, [0, 1, 0]));
    const up = V.cross(right, fwd);
    return { pos: this.pos.slice(), fwd, right, up, tanHalf: Math.tan(this.fov * Math.PI / 360) };
  }

  nearby(x, z, r) {
    const out = new Set();
    for (let gx = Math.floor((x - r) / this.cell); gx <= Math.floor((x + r) / this.cell); gx++)
      for (let gz = Math.floor((z - r) / this.cell); gz <= Math.floor((z + r) / this.cell); gz++) {
        const l = this.grid.get(gx + ',' + gz); if (l) l.forEach(i => out.add(i));
      }
    return out;
  }

  blocked(x, z, feet) {
    const r = 0.24;
    for (const i of this.nearby(x, z, r)) {
      const b = this.cols[i];
      if (b.mx[1] <= feet + 0.42 || b.mn[1] >= feet + 1.75) continue;
      const cx = Math.max(b.mn[0], Math.min(x, b.mx[0])), cz = Math.max(b.mn[2], Math.min(z, b.mx[2]));
      if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) return true;
    }
    return false;
  }

  groundAt(x, z, feet) {
    let g = -0.5;
    const r = 0.12;
    for (const i of this.nearby(x, z, r)) {
      const b = this.cols[i];
      if (b.mx[1] > feet + 0.45) continue;
      if (x + r < b.mn[0] || x - r > b.mx[0] || z + r < b.mn[2] || z - r > b.mx[2]) continue;
      if (b.mx[1] - b.mn[1] < 0.004) continue;
      g = Math.max(g, b.mx[1]);
    }
    return g;
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    const k = this.keys;
    let f = 0, s = 0, u = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    if (k.has('KeyE') || k.has('Space')) u += 1;
    if (k.has('KeyQ') || k.has('KeyC')) u -= 1;
    if (this.touchMove) f += this.touchMove;
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 4.2 : 1.8) * (this.fly ? 2.5 : 1);
    let moved = false;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    if (this.fly) {
      const b = this.basis();
      if (f || s || u) {
        this.pos = V.add(this.pos, V.add(V.add(V.mul(b.fwd, f * speed * dt), V.mul(b.right, s * speed * dt)), [0, u * speed * dt, 0]));
        moved = true;
      }
    } else {
      let feet = this.pos[1] - this.eye;
      if (f || s) {
        let dx = (sy * f + cy * s) * speed * dt, dz = (-cy * f + sy * s) * speed * dt;
        const nx = this.pos[0] + dx;
        if (!this.blocked(nx, this.pos[2], feet)) this.pos[0] = nx;
        const nz = this.pos[2] + dz;
        if (!this.blocked(this.pos[0], nz, feet)) this.pos[2] = nz;
        moved = true;
      }
      const g = this.groundAt(this.pos[0], this.pos[2], feet);
      if (feet > g + 0.001) {
        this.vy -= 9.8 * dt;
        feet = Math.max(g, feet + this.vy * dt);
        moved = true;
      } else { this.vy = 0; if (Math.abs(feet - g) > 1e-4) moved = true; feet = g; }
      if (feet === g) this.vy = 0;
      this.pos[1] = feet + this.eye;
    }
    if (moved) this.changed = true;
    const c = this.changed; this.changed = false;
    return c;
  }
}
