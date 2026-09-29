// WebGL2 progressive path tracer (no external libraries).
'use strict';

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float is required.');
    gl.getExtension('OES_texture_float_linear');
    this.progs = {};
    this.uniCache = new Map();
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.frame = 0;
    this.spp = 0;
    this.exposure = 1.0;
    this.logAvg = null;
    this.W = 0; this.H = 0;
  }

  compile(name, fsrc) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        const lines = src.split('\n').map((l, i) => (i + 1) + ': ' + l);
        const m = /ERROR: 0:(\d+)/.exec(log || '');
        const ctx = m ? lines.slice(Math.max(0, +m[1] - 4), +m[1] + 2).join('\n') : '';
        throw new Error(name + ' shader error:\n' + log + '\n' + ctx);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, SH.vert));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsrc));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ' link error: ' + gl.getProgramInfoLog(p));
    this.progs[name] = p;
  }

  init() {
    this.compile('sky', SH.sky);
    this.compile('trace', SH.trace);
    this.compile('denoise', SH.denoise);
    this.compile('composite', SH.composite);
    this.compile('final', SH.final);
    const gl = this.gl;
    this.skyTex = this.makeTex(256, 128, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, this.skyTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    this.skyFbo = this.makeFbo([this.skyTex]);
  }

  u(prog, name) {
    const key = prog + ':' + name;
    let l = this.uniCache.get(key);
    if (l === undefined) { l = this.gl.getUniformLocation(this.progs[prog], name); this.uniCache.set(key, l); }
    return l;
  }

  makeTex(w, h, ifmt, fmt, type, filter, data = null) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  makeFbo(texs, level = 0) {
    const gl = this.gl;
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, level));
    gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incomplete: 0x' + st.toString(16));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return f;
  }

  setScene(bvh) {
    const gl = this.gl;
    this.primTex = this.makeTex(bvh.primW, bvh.primRows, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, bvh.primData);
    this.nodeTex = this.makeTex(bvh.nodeW, bvh.nodeRows, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, bvh.nodeData);
    this.nodeCount = bvh.nodeCount;
    this.roots = bvh.roots;
  }

  resize(w, h) {
    w = Math.max(16, Math.floor(w)); h = Math.max(16, Math.floor(h));
    if (w === this.W && h === this.H) return;
    const gl = this.gl;
    const del = (a) => a && a.forEach(x => x && (x instanceof WebGLFramebuffer ? gl.deleteFramebuffer(x) : gl.deleteTexture(x)));
    if (this.acc) { this.acc.forEach(s => { del(s.tex); del([s.fbo]); }); del(this.dn.map(d => d.tex)); del(this.dn.map(d => d.fbo)); del([this.hdrTex, this.hdrFbo, this.topFbo]); }
    this.W = w; this.H = h;
    this.acc = [0, 1].map(() => {
      const tex = [0, 1, 2, 3].map(() => this.makeTex(w, h, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST));
      return { tex, fbo: this.makeFbo(tex) };
    });
    // clear accumulators
    for (const s of this.acc) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbo);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    this.dn = [0, 1].map(() => { const tex = this.makeTex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST); return { tex, fbo: this.makeFbo([tex]) }; });
    this.levels = Math.floor(Math.log2(Math.max(w, h)));
    this.hdrTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.hdrTex);
    gl.texStorage2D(gl.TEXTURE_2D, this.levels + 1, gl.RGBA16F, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.hdrFbo = this.makeFbo([this.hdrTex], 0);
    this.topFbo = this.makeFbo([this.hdrTex], this.levels);
    this.cur = 0;
    this.reset();
  }

  reset() { this.spp = 0; }

  draw(prog, fbo, w, h) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bindTex(prog, name, unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.u(prog, name), unit);
  }

  renderSky(S) {
    const gl = this.gl, p = 'sky';
    gl.useProgram(this.progs[p]);
    gl.uniform3fv(this.u(p, 'uSunDir'), S.sunDir);
    gl.uniform1f(this.u(p, 'uE0'), S.E0);
    gl.uniform1f(this.u(p, 'uCloud'), S.cloud);
    gl.uniform1f(this.u(p, 'uHaze'), S.haze);
    gl.uniform1f(this.u(p, 'uLz'), S.Lz);
    gl.uniform2f(this.u(p, 'uSize'), 256, 128);
    this.draw(p, this.skyFbo, 256, 128);
  }

  setCam(p, C) {
    const gl = this.gl;
    gl.uniform3fv(this.u(p, 'uCamPos'), C.pos);
    gl.uniform3fv(this.u(p, 'uCamFwd'), C.fwd);
    gl.uniform3fv(this.u(p, 'uCamRight'), C.right);
    gl.uniform3fv(this.u(p, 'uCamUp'), C.up);
    gl.uniform1f(this.u(p, 'uTanHalf'), C.tanHalf);
  }

  // one progressive sample + post
  render(C, S, opts) {
    const gl = this.gl;
    const W = this.W, H = this.H;
    const src = this.acc[this.cur], dst = this.acc[1 - this.cur];
    this.spp++;
    const blend = Math.max(1 / this.spp, opts.minBlend || 0);
    // ---- trace
    let p = 'trace';
    gl.useProgram(this.progs[p]);
    this.bindTex(p, 'uPrims', 0, this.primTex);
    this.bindTex(p, 'uNodes', 1, this.nodeTex);
    this.bindTex(p, 'uSky', 2, this.skyTex);
    for (let i = 0; i < 4; i++) this.bindTex(p, 'uPrev' + i, 3 + i, src.tex[i]);
    gl.uniform2f(this.u(p, 'uRes'), W, H);
    gl.uniform1i(this.u(p, 'uFrame'), this.frame);
    gl.uniform1f(this.u(p, 'uBlend'), blend);
    this.setCam(p, C);
    gl.uniform3fv(this.u(p, 'uSunDir'), S.sunDir);
    gl.uniform3fv(this.u(p, 'uSunE'), S.sunE);
    gl.uniform3fv(this.u(p, 'uSunEClear'), S.sunEClear);
    gl.uniform1f(this.u(p, 'uSunCos'), S.sunCos);
    gl.uniform1f(this.u(p, 'uCloud'), S.cloud);
    gl.uniform2fv(this.u(p, 'uCloudOff'), S.cloudOff);
    gl.uniform1f(this.u(p, 'uWet'), S.wet);
    gl.uniform1f(this.u(p, 'uHaze'), S.haze);
    gl.uniform1f(this.u(p, 'uDust'), S.dust);
    gl.uniform1f(this.u(p, 'uTime'), S.time);
    gl.uniform1i(this.u(p, 'uNumLights'), S.numLights);
    gl.uniform4fv(this.u(p, 'uLightPos'), S.lightPos);
    gl.uniform4fv(this.u(p, 'uLightCol'), S.lightCol);
    gl.uniform3fv(this.u(p, 'uFireCol'), S.fireCol);
    gl.uniform3fv(this.u(p, 'uLampCol'), S.lampCol);
    gl.uniform3fv(this.u(p, 'uCandleCol'), S.candleCol);
    gl.uniform1f(this.u(p, 'uFireI'), S.fireI);
    gl.uniform1f(this.u(p, 'uLampI'), S.lampI);
    gl.uniform1i(this.u(p, 'uMaxBounce'), S.bounces);
    gl.uniform1f(this.u(p, 'uIndClamp'), this.logAvg === null ? 1e6 : 14.0 / Math.max(this.exposure / Math.pow(2, opts.ev || 0), 1e-6));
    gl.uniform1i(this.u(p, 'uRoot0'), this.roots[0]);
    gl.uniform1i(this.u(p, 'uRoot1'), this.roots[1]);
    gl.uniform1i(this.u(p, 'uRoot2'), this.roots[2]);
    if (opts.tiles && opts.tiles > 1) {
      gl.enable(gl.SCISSOR_TEST);
      for (let t = 0; t < opts.tiles; t++) {
        const y0 = Math.floor(H * t / opts.tiles), y1 = Math.floor(H * (t + 1) / opts.tiles);
        gl.scissor(0, y0, W, y1 - y0);
        this.draw(p, dst.fbo, W, H);
        gl.flush();
      }
      gl.disable(gl.SCISSOR_TEST);
    } else this.draw(p, dst.fbo, W, H);
    this.cur = 1 - this.cur;
    this.frame++;
    this.post(C, opts);
  }

  post(C, opts) {
    const gl = this.gl;
    const W = this.W, H = this.H;
    const A = this.acc[this.cur];
    let illum = null;
    if (opts.denoise) {
      const p = 'denoise';
      gl.useProgram(this.progs[p]);
      this.bindTex(p, 'uAlb', 1, A.tex[1]);
      this.bindTex(p, 'uND', 2, A.tex[2]);
      this.bindTex(p, 'uEm', 3, A.tex[3]);
      this.bindTex(p, 'uMom', 4, A.tex[0]);
      gl.uniform1f(this.u(p, 'uSpp'), this.spp);
      this.setCam(p, C);
      gl.uniform2f(this.u(p, 'uRes'), W, H);
      gl.uniform1f(this.u(p, 'uSigL'), opts.denoiseStrength);
      const passes = this.spp > 512 ? 3 : 5;
      let inTex = A.tex[0];
      for (let i = 0; i < passes; i++) {
        const out = this.dn[i % 2];
        this.bindTex(p, 'uIn', 0, inTex);
        gl.uniform1i(this.u(p, 'uStep'), 1 << i);
        gl.uniform1i(this.u(p, 'uFirst'), i === 0 ? 1 : 0);
        gl.uniform1f(this.u(p, 'uPass'), i);
        this.draw(p, out.fbo, W, H);
        inTex = out.tex;
      }
      illum = inTex;
    }
    // composite
    let p = 'composite';
    gl.useProgram(this.progs[p]);
    this.bindTex(p, 'uIllum', 0, illum || A.tex[0]);
    this.bindTex(p, 'uAlb', 1, A.tex[1]);
    this.bindTex(p, 'uEm', 2, A.tex[3]);
    this.bindTex(p, 'uRad', 3, A.tex[0]);
    gl.uniform1i(this.u(p, 'uRaw'), illum ? 0 : 1);
    this.draw(p, this.hdrFbo, W, H);
    gl.bindTexture(gl.TEXTURE_2D, this.hdrTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    // exposure metering
    if (opts.autoExposure && (this.frame % (opts.meterEvery || 4) === 0 || this.logAvg === null)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.topFbo);
      const px = new Float32Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
      const la = px[3];
      if (isFinite(la)) this.logAvg = this.logAvg === null || opts.snapExposure ? la : this.logAvg + (la - this.logAvg) * 0.25;
    }
    // final
    p = 'final';
    gl.useProgram(this.progs[p]);
    this.bindTex(p, 'uHDR', 0, this.hdrTex);
    let exposure = opts.manualExposure;
    if (opts.autoExposure && this.logAvg !== null) {
      const key = 0.14;
      exposure = key / Math.exp(this.logAvg);
      exposure = Math.min(Math.max(exposure, 0.02), 20000);
    }
    exposure *= Math.pow(2, opts.ev || 0);
    this.exposure = exposure;
    gl.uniform1f(this.u(p, 'uExposure'), exposure);
    gl.uniform1f(this.u(p, 'uBloom'), opts.bloom);
    gl.uniform2f(this.u(p, 'uOut'), this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u(p, 'uLevels'), this.levels);
    gl.uniform1f(this.u(p, 'uGrain'), opts.grain || 0);
    gl.uniform1i(this.u(p, 'uFrame'), this.frame);
    this.draw(p, null, this.canvas.width, this.canvas.height);
  }
}
