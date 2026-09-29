// Binned-SAH BVHs over primitive AABBs, packed into float textures.
// Two trees are built: one for plain boxes (lean intersection code) and one for curved shapes.
'use strict';

function primAABB(p) {
  let h;
  if (p.type === T.CONE) { const r = Math.max(p.h[0], p.h[2]); h = [r, p.h[1], r]; }
  else if (p.type === T.CYL) h = [p.h[0], p.h[1], p.h[0]];
  else h = p.h;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < 8; i++) {
    const c = [(i & 1 ? 1 : -1) * h[0], (i & 2 ? 1 : -1) * h[1], (i & 4 ? 1 : -1) * h[2]];
    const w = V.add(p.c, Q.rot(p.q, c));
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); }
  }
  for (let k = 0; k < 3; k++) { mn[k] -= 1e-3; mx[k] += 1e-3; }
  return { mn, mx };
}

// returns { nodes: [{mn,mx,start,count,right,axis}], order: [index into boxes] }
function buildTree(boxes) {
  const n = boxes.length;
  const cent = boxes.map(b => [(b.mn[0] + b.mx[0]) / 2, (b.mn[1] + b.mx[1]) / 2, (b.mn[2] + b.mx[2]) / 2]);
  const idx = new Int32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
  const nodes = [];
  const area = (mn, mx) => { const d = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]; return 2 * (d[0] * d[1] + d[1] * d[2] + d[2] * d[0]); };
  const BINS = 16;
  function build(start, end, forceSplit) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const cmn = [1e9, 1e9, 1e9], cmx = [-1e9, -1e9, -1e9];
    for (let i = start; i < end; i++) {
      const b = boxes[idx[i]], c = cent[idx[i]];
      for (let k = 0; k < 3; k++) {
        mn[k] = Math.min(mn[k], b.mn[k]); mx[k] = Math.max(mx[k], b.mx[k]);
        cmn[k] = Math.min(cmn[k], c[k]); cmx[k] = Math.max(cmx[k], c[k]);
      }
    }
    const node = { mn, mx, start, count: end - start, right: -1, axis: 0 };
    const ni = nodes.length; nodes.push(node);
    const cnt = end - start;
    if (cnt <= 2 && !(forceSplit && cnt > 1)) return ni;
    let best = { cost: forceSplit ? Infinity : area(mn, mx) * cnt, axis: -1, split: 0 };
    for (let ax = 0; ax < 3; ax++) {
      const ext = cmx[ax] - cmn[ax];
      if (ext < 1e-6) continue;
      const bins = [];
      for (let b = 0; b < BINS; b++) bins.push({ n: 0, mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] });
      for (let i = start; i < end; i++) {
        const c = cent[idx[i]][ax];
        let b = Math.floor((c - cmn[ax]) / ext * BINS); if (b >= BINS) b = BINS - 1;
        const bb = bins[b], pb = boxes[idx[i]];
        bb.n++;
        for (let k = 0; k < 3; k++) { bb.mn[k] = Math.min(bb.mn[k], pb.mn[k]); bb.mx[k] = Math.max(bb.mx[k], pb.mx[k]); }
      }
      for (let s = 1; s < BINS; s++) {
        let nl = 0, nr = 0; const lmn = [1e9, 1e9, 1e9], lmx = [-1e9, -1e9, -1e9], rmn = [1e9, 1e9, 1e9], rmx = [-1e9, -1e9, -1e9];
        for (let b = 0; b < s; b++) { const bb = bins[b]; if (!bb.n) continue; nl += bb.n; for (let k = 0; k < 3; k++) { lmn[k] = Math.min(lmn[k], bb.mn[k]); lmx[k] = Math.max(lmx[k], bb.mx[k]); } }
        for (let b = s; b < BINS; b++) { const bb = bins[b]; if (!bb.n) continue; nr += bb.n; for (let k = 0; k < 3; k++) { rmn[k] = Math.min(rmn[k], bb.mn[k]); rmx[k] = Math.max(rmx[k], bb.mx[k]); } }
        if (!nl || !nr) continue;
        const cost = 0.5 * area(mn, mx) + area(lmn, lmx) * nl + area(rmn, rmx) * nr;
        if (cost < best.cost) best = { cost, axis: ax, split: cmn[ax] + ext * s / BINS };
      }
    }
    if (best.axis < 0) {
      if (cnt <= 4 && !forceSplit) return ni;
      let ax = 0; for (let k = 1; k < 3; k++) if (cmx[k] - cmn[k] > cmx[ax] - cmn[ax]) ax = k;
      const sub = Array.from(idx.subarray(start, end)).sort((a, b) => cent[a][ax] - cent[b][ax]);
      for (let i = 0; i < sub.length; i++) idx[start + i] = sub[i];
      best = { axis: ax, mid: start + (cnt >> 1) };
    }
    let mid;
    if (best.mid !== undefined) mid = best.mid;
    else {
      let i = start, j = end - 1;
      while (i <= j) {
        if (cent[idx[i]][best.axis] < best.split) i++;
        else { const t = idx[i]; idx[i] = idx[j]; idx[j] = t; j--; }
      }
      mid = i;
      if (mid === start || mid === end) mid = start + (cnt >> 1);
    }
    node.count = 0; node.axis = best.axis;
    build(start, mid, false);
    node.right = build(mid, end, false);
    return ni;
  }
  build(0, n, true);
  return { nodes, order: Array.from(idx) };
}

function buildBVH(prims) {
  prims.forEach(p => { p.aabb = primAABB(p); });
  const sets = [prims.filter(p => p.type === T.BOX), prims.filter(p => p.type === T.RBOX), prims.filter(p => p.type !== T.BOX && p.type !== T.RBOX)];
  const trees = sets.map(set => buildTree(set.map(p => p.aabb)));
  const orderedPrims = [], packedAll = [], roots = [], maps = [], primBase = [];
  trees.forEach((tr, ti) => {
    primBase.push(orderedPrims.length);
    tr.order.forEach(i => orderedPrims.push(sets[ti][i]));
    const map = new Map();
    roots.push(packedAll.length);
    (function assign(i) {
      if (tr.nodes[i].count > 0) return;
      map.set(i, packedAll.length); packedAll.push({ ti, ni: i });
      assign(i + 1); assign(tr.nodes[i].right);
    })(0);
    maps.push(map);
  });
  // wide layout: each interior node stores both child boxes. 4 texels per node, 256 per row.
  // texel0 = L.min, L.ref ; texel1 = L.max, L.count ; texel2 = R.min, R.ref ; texel3 = R.max, R.count
  // ref = first prim if count>0 else packed-node index of the child.
  const NW = 1024, nodesPerRow = NW / 4;
  const nodeRows = Math.max(1, Math.ceil(packedAll.length / nodesPerRow));
  const nodeData = new Float32Array(NW * nodeRows * 4);
  const writeChild = (o, ti, ci) => {
    const c = trees[ti].nodes[ci];
    nodeData[o] = c.mn[0]; nodeData[o + 1] = c.mn[1]; nodeData[o + 2] = c.mn[2];
    nodeData[o + 3] = c.count > 0 ? c.start + primBase[ti] : maps[ti].get(ci);
    nodeData[o + 4] = c.mx[0]; nodeData[o + 5] = c.mx[1]; nodeData[o + 6] = c.mx[2];
    nodeData[o + 7] = c.count;
  };
  packedAll.forEach(({ ti, ni }, pi) => {
    const row = Math.floor(pi / nodesPerRow), col = (pi % nodesPerRow) * 4;
    const o = (row * NW + col) * 4;
    writeChild(o, ti, ni + 1);
    writeChild(o + 8, ti, trees[ti].nodes[ni].right);
  });

  // prims in BVH order: 4 texels per prim, 256 prims per row
  const n = orderedPrims.length;
  const PW = 1024, primsPerRow = PW / 4;
  const primRows = Math.ceil(n / primsPerRow);
  const primData = new Float32Array(PW * primRows * 4);
  for (let i = 0; i < n; i++) {
    const p = orderedPrims[i];
    const row = Math.floor(i / primsPerRow), col = (i % primsPerRow) * 4;
    const o = (row * PW + col) * 4;
    primData.set([p.c[0], p.c[1], p.c[2], p.type + 8 * p.flags + 256 * Math.round(Math.min(p.p0, 60) * 1000)], o);
    primData.set([p.h[0], p.h[1], p.h[2], p.mat], o + 4);
    primData.set(p.q, o + 8);
    primData.set([p.p0, p.seed, p.col, p.extra], o + 12);
  }
  return { nodeData, nodeW: NW, nodeRows, primData, primW: PW, primRows, nodeCount: packedAll.length, roots, counts: sets.map(s => s.length) };
}
