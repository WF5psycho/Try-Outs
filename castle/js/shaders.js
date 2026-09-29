// GLSL sources (WebGL2 / GLSL ES 3.00)
'use strict';
const SH = {};

SH.vert = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

// ---------------------------------------------------------------- common noise
SH.common = `
#define PI 3.14159265359
float hash11(float p){ p = fract(p*0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float hash13(vec3 p3){ p3 = fract(p3*0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3 hash32(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yxz+33.33); return fract((p3.xxy+p3.yzz)*p3.zyx); }
float vnoise2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a*vnoise2(p); p = p*2.03 + 17.1; a *= 0.5; } return s/0.97; }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a*vnoise3(p); p = p*2.02 + 11.7; a *= 0.5; } return s/0.94; }
float fbm3l(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ s += a*vnoise3(p); p = p*2.02 + 11.7; a *= 0.5; } return s/0.875; }
float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 srgb2lin(vec3 c){ return pow(c, vec3(2.2)); }
`;

// ---------------------------------------------------------------- sky LUT
SH.sky = `#version 300 es
precision highp float;
uniform vec3 uSunDir;
uniform float uE0;
uniform float uCloud;
uniform float uHaze;
uniform float uLz;       // overcast zenith luminance
uniform vec2 uSize;
out vec4 o;
${SH.common}
const float Rg = 6371e3, Ra = 6471e3;
const vec3 bR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
vec2 rsi(vec3 r0, vec3 rd, float sr){ float a = dot(rd,rd), b = 2.0*dot(rd,r0), c = dot(r0,r0)-sr*sr; float d = b*b-4.0*a*c; if (d < 0.0) return vec2(1e5,-1e5); return vec2((-b-sqrt(d))/(2.0*a), (-b+sqrt(d))/(2.0*a)); }
vec3 atmos(vec3 rd){
  float bM = 21e-6*(1.0 + uHaze*6.0);
  float Hm = 1200.0*(1.0 + uHaze*0.6);
  vec3 r0 = vec3(0, Rg + 2.0, 0);
  vec2 p = rsi(r0, rd, Ra);
  float tMax = p.y;
  vec2 pg = rsi(r0, rd, Rg); if (pg.x > 0.0) tMax = min(tMax, pg.x);
  const int N = 20; const int NL = 6;
  float ds = tMax/float(N);
  float mu = dot(rd, uSunDir);
  float pR = 3.0/(16.0*PI)*(1.0+mu*mu);
  float g = 0.76; float pM = 3.0/(8.0*PI)*((1.0-g*g)*(1.0+mu*mu))/((2.0+g*g)*pow(1.0+g*g-2.0*g*mu, 1.5));
  vec3 tR = vec3(0), tM = vec3(0); float odR = 0.0, odM = 0.0;
  for (int i = 0; i < N; i++){
    vec3 x = r0 + rd*(float(i)+0.5)*ds;
    float h = length(x) - Rg;
    float dR = exp(-h/8000.0)*ds, dM = exp(-h/Hm)*ds;
    odR += dR; odM += dM;
    vec2 ls = rsi(x, uSunDir, Ra);
    vec2 lg = rsi(x, uSunDir, Rg);
    if (lg.x > 0.0) continue;
    float dl = ls.y/float(NL); float lR = 0.0, lM = 0.0;
    for (int j = 0; j < NL; j++){ vec3 y = x + uSunDir*(float(j)+0.5)*dl; float hh = length(y)-Rg; lR += exp(-hh/8000.0)*dl; lM += exp(-hh/Hm)*dl; }
    vec3 att = exp(-(bR*(odR+lR) + bM*1.1*(odM+lM)));
    tR += dR*att; tM += dM*att;
  }
  // x2.2 approximates multiple scattering + ground bounce missing from the single-scattering integral
  return 2.2*uE0*(pR*bR*tR + pM*bM*tM);
}
void main(){
  vec2 uv = gl_FragCoord.xy/uSize;
  float az = (uv.x - 0.5)*2.0*PI;
  float el = uv.y*uv.y*0.5*PI;
  vec3 rd = vec3(cos(el)*cos(az), sin(el), cos(el)*sin(az));
  vec3 c = atmos(rd);
  // night sky floor (moon + airglow)
  c += vec3(0.00012, 0.00018, 0.00032)*(0.4 + 0.6*rd.y);
  // overcast / cloud-scattered component (CIE overcast distribution)
  float cov = smoothstep(0.05, 1.0, uCloud);
  vec3 oc = vec3(uLz*(1.0 + 2.0*max(rd.y,0.0))/3.0)*vec3(0.93, 0.97, 1.03);
  c = mix(c, oc + c*0.15, cov*0.92);
  o = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- path tracer
SH.trace = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uPrims;
uniform sampler2D uNodes;
uniform sampler2D uSky;
uniform sampler2D uPrev0, uPrev1, uPrev2, uPrev3;
uniform vec2 uRes;
uniform int uFrame;
uniform float uBlend;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform float uTanHalf;
uniform vec3 uSunDir, uSunE, uSunEClear;
uniform float uSunCos;
uniform float uCloud, uWet, uHaze, uDust, uTime;
uniform vec2 uCloudOff;
uniform int uNumLights;
uniform vec4 uLightPos[48];
uniform vec4 uLightCol[48];
uniform vec3 uFireCol, uLampCol, uCandleCol;
uniform float uFireI, uLampI;
uniform int uMaxBounce;
uniform int uDebug;
uniform int uNumPortals;
uniform vec4 uPortal[48];   // per portal: centre+area, U half-axis, V half-axis
uniform float uIndClamp;
layout(location=0) out vec4 o0;
layout(location=1) out vec4 o1;
layout(location=2) out vec4 o2;
layout(location=3) out vec4 o3;
${SH.common}

// ------------------------------------------------ RNG
uint rs;
float rnd(){ rs = rs*747796405u + 2891336453u; uint w = ((rs >> ((rs >> 28u) + 4u)) ^ rs)*277803737u; w = (w >> 22u) ^ w; return float(w)*(1.0/4294967296.0); }

// ------------------------------------------------ geometry access
ivec2 pUV(int i, int k){ return ivec2((i & 255)*4 + k, i >> 8); }
ivec2 nUV(int i, int k){ return ivec2((i & 255)*4 + k, i >> 8); }
vec3 qrot(vec4 q, vec3 v){ return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v); }
vec3 qinv(vec4 q, vec3 v){ return v + 2.0*cross(-q.xyz, cross(-q.xyz, v) + q.w*v); }

float iBox(vec3 ro, vec3 rd, vec3 h, float tmin, out vec3 n){
  vec3 m = 1.0/rd; vec3 k = abs(m)*h; vec3 t1 = -ro*m - k; vec3 t2 = -ro*m + k;
  float tN = max(max(t1.x, t1.y), t1.z); float tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tN < tmin) return -1.0;
  n = -sign(rd)*step(t1.yzx, t1.xyz)*step(t1.zxy, t1.xyz);
  return tN;
}
float iRBox(vec3 ro, vec3 rd, vec3 hs, float rad, float tmin, out vec3 n){
  vec3 size = max(hs - rad, vec3(1e-4));
  vec3 m = 1.0/rd; vec3 nn = m*ro; vec3 k = abs(m)*(size+rad);
  vec3 t1 = -nn - k; vec3 t2 = -nn + k;
  float tN = max(max(t1.x, t1.y), t1.z); float tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tN < tmin) return -1.0;
  float t = tN;
  vec3 pos = ro + t*rd; vec3 s = sign(pos);
  vec3 ro2 = ro*s, rd2 = rd*s; pos *= s;
  pos -= size; pos = max(pos.xyz, pos.yzx);
  if (min(min(pos.x, pos.y), pos.z) < 0.0){ vec3 p = ro + t*rd; n = sign(p)*normalize(max(abs(p) - size, 0.0)); return t; }
  vec3 oc = ro2 - size; vec3 dd = rd2*rd2; vec3 oo = oc*oc; vec3 od = oc*rd2; float ra2 = rad*rad;
  t = 1e20;
  { float b = od.x + od.y + od.z; float c = oo.x + oo.y + oo.z - ra2; float h = b*b - c; if (h > 0.0) t = -b - sqrt(h); }
  { float a = dd.y + dd.z; float b = od.y + od.z; float c = oo.y + oo.z - ra2; float h = b*b - a*c;
    if (h > 0.0){ h = (-b - sqrt(h))/a; if (h > 0.0 && h < t && abs(ro2.x + rd2.x*h) < size.x) t = h; } }
  { float a = dd.z + dd.x; float b = od.z + od.x; float c = oo.z + oo.x - ra2; float h = b*b - a*c;
    if (h > 0.0){ h = (-b - sqrt(h))/a; if (h > 0.0 && h < t && abs(ro2.y + rd2.y*h) < size.y) t = h; } }
  { float a = dd.x + dd.y; float b = od.x + od.y; float c = oo.x + oo.y - ra2; float h = b*b - a*c;
    if (h > 0.0){ h = (-b - sqrt(h))/a; if (h > 0.0 && h < t && abs(ro2.z + rd2.z*h) < size.z) t = h; } }
  if (t > 1e19 || t < tmin) return -1.0;
  vec3 p = ro + t*rd;
  n = sign(p)*normalize(max(abs(p) - size, 1e-6));
  return t;
}
float iCyl(vec3 ro, vec3 rd, float r, float hh, bool open, float tmin, out vec3 n){
  float t = 1e30;
  float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz), c = dot(ro.xz, ro.xz) - r*r;
  if (a > 1e-12){
    float h = b*b - a*c;
    if (h >= 0.0){
      h = sqrt(h);
      float t0 = (-b - h)/a, t1 = (-b + h)/a;
      if (t0 > tmin && abs(ro.y + t0*rd.y) <= hh){ t = t0; vec3 p = ro + t0*rd; n = vec3(p.x, 0, p.z)/r; }
      else if (open && t1 > tmin && abs(ro.y + t1*rd.y) <= hh){ t = t1; vec3 p = ro + t1*rd; n = -vec3(p.x, 0, p.z)/r; }
    }
  }
  if (!open && abs(rd.y) > 1e-9){
    float sy = rd.y > 0.0 ? -1.0 : 1.0;
    float tc = (sy*hh - ro.y)/rd.y;
    if (tc > tmin && tc < t){ vec2 q = ro.xz + tc*rd.xz; if (dot(q, q) <= r*r){ t = tc; n = vec3(0, sy, 0); } }
  }
  return t < 1e29 ? t : -1.0;
}
vec2 iEll2(vec3 ro, vec3 rd, vec3 r){
  vec3 ocn = ro/r, rdn = rd/r;
  float a = dot(rdn, rdn), b = dot(ocn, rdn), c = dot(ocn, ocn) - 1.0;
  float h = b*b - a*c; if (h < 0.0) return vec2(-1.0);
  h = sqrt(h); return vec2((-b - h)/a, (-b + h)/a);
}
float iEll(vec3 ro, vec3 rd, vec3 r, float tmin, out vec3 n){
  vec2 t = iEll2(ro, rd, r);
  if (t.x < tmin) return -1.0;
  vec3 p = ro + t.x*rd; n = normalize(p/(r*r)); return t.x;
}
float iCone(vec3 ro, vec3 rd, float ra, float hh, float rb, bool open, float tmin, out vec3 n){
  float m = (rb - ra)/(2.0*hh), c0 = 0.5*(ra + rb);
  float k = m*ro.y + c0;
  float a = rd.x*rd.x + rd.z*rd.z - m*m*rd.y*rd.y;
  float b = ro.x*rd.x + ro.z*rd.z - m*rd.y*k;
  float c = ro.x*ro.x + ro.z*ro.z - k*k;
  float t = 1e30;
  if (abs(a) > 1e-10){
    float h = b*b - a*c;
    if (h >= 0.0){
      h = sqrt(h);
      float t0 = (-b - h)/a, t1 = (-b + h)/a;
      if (t0 > t1){ float tt = t0; t0 = t1; t1 = tt; }
      for (int i = 0; i < 2; i++){
        float tt = i == 0 ? t0 : t1;
        if (tt > tmin && tt < t){
          vec3 p = ro + tt*rd;
          if (abs(p.y) <= hh && m*p.y + c0 >= 0.0){ t = tt; n = normalize(vec3(p.x, -m*(m*p.y + c0), p.z)); break; }
        }
      }
    }
  }
  if (!open && abs(rd.y) > 1e-9){
    for (int i = 0; i < 2; i++){
      float sy = i == 0 ? -1.0 : 1.0; float rr = i == 0 ? ra : rb;
      float tc = (sy*hh - ro.y)/rd.y;
      if (tc > tmin && tc < t){ vec2 q = ro.xz + tc*rd.xz; if (dot(q, q) <= rr*rr){ t = tc; n = vec3(0, sy, 0); } }
    }
  }
  return t < 1e29 ? t : -1.0;
}

// unified quadric: F(p) = A.x x^2 + A.y y^2 + A.z z^2 + 2 B y + C, clipped to |y| <= hh, optional caps
float iQuad(vec3 o, vec3 d, vec3 A, float B, float C, float hh, bool caps, float tmin, out vec3 n){
  float a = dot(A, d*d);
  float b = dot(A, o*d) + B*d.y;
  float c = dot(A, o*o) + 2.0*B*o.y + C;
  float h = b*b - a*c;
  float t = 1e30;
  if (h >= 0.0 && abs(a) > 1e-14){
    h = sqrt(h);
    float t0 = (-b - h)/a, t1 = (-b + h)/a;
    float tn = min(t0, t1), tf = max(t0, t1);
    if (tn > tmin && abs(o.y + tn*d.y) <= hh) t = tn;
    else if (tf > tmin && abs(o.y + tf*d.y) <= hh) t = tf;
  }
  if (caps){
    float ty0 = (-hh - o.y)/d.y, ty1 = (hh - o.y)/d.y;
    vec3 p0 = o + ty0*d, p1 = o + ty1*d;
    float yy = A.y*hh*hh + C;
    float F0 = A.x*p0.x*p0.x + A.z*p0.z*p0.z + yy - 2.0*B*hh;
    float F1 = A.x*p1.x*p1.x + A.z*p1.z*p1.z + yy + 2.0*B*hh;
    if (ty0 > tmin && ty0 < t && F0 <= 0.0){ t = ty0; }
    if (ty1 > tmin && ty1 < t && F1 <= 0.0){ t = ty1; }
  }
  if (t > 1e29) return -1.0;
  vec3 p = o + t*d;
  if (caps && abs(abs(p.y) - hh) < 1e-5*max(hh, 1.0) + 1e-6) n = vec3(0.0, sign(p.y), 0.0);
  else n = normalize(vec3(A.x*p.x, A.y*p.y + B, A.z*p.z));
  return t;
}

float primHit(int id, vec3 ro, vec3 rd, float tmin, out vec3 lp, out vec3 ln, out int flags){
  vec4 a = texelFetch(uPrims, pUV(id, 0), 0);
  vec4 b = texelFetch(uPrims, pUV(id, 1), 0);
  vec4 q = texelFetch(uPrims, pUV(id, 2), 0);
  int tf = int(a.w + 0.5);
  int type = tf & 7; flags = (tf >> 3) & 31;
  float p0 = float(tf >> 8)*0.001;
  vec3 o = qinv(q, ro - a.xyz), d = qinv(q, rd);
  d = vec3(abs(d.x) < 1e-9 ? 1e-9 : d.x, abs(d.y) < 1e-9 ? 1e-9 : d.y, abs(d.z) < 1e-9 ? 1e-9 : d.z);
  float t = -1.0; vec3 n = vec3(0, 1, 0);
  {
    float op = p0;
    vec3 A; float B, C;
    if (type == 3){ A = 1.0/(b.xyz*b.xyz); B = 0.0; C = -1.0; }
    else {
      float m = type == 4 ? (b.z - b.x)/(2.0*b.y) : 0.0;
      float c0 = type == 4 ? 0.5*(b.x + b.z) : b.x;
      A = vec3(1.0, -m*m, 1.0); B = -m*c0; C = -c0*c0;
    }
    t = iQuad(o, d, A, B, C, b.y, type != 3 && op < 0.5, tmin, n);
  }
  lp = o + t*d; ln = n;
  return t;
}

float boxHit(int id, vec3 ro, vec3 rd, float tmin, out vec3 lp, out vec3 ln, out int flags){
  vec4 a = texelFetch(uPrims, pUV(id, 0), 0);
  vec4 b = texelFetch(uPrims, pUV(id, 1), 0);
  vec4 q = texelFetch(uPrims, pUV(id, 2), 0);
  flags = (int(a.w + 0.5) >> 3) & 31;
  vec3 o = qinv(q, ro - a.xyz), d = qinv(q, rd);
  d = vec3(abs(d.x) < 1e-9 ? 1e-9 : d.x, abs(d.y) < 1e-9 ? 1e-9 : d.y, abs(d.z) < 1e-9 ? 1e-9 : d.z);
  vec3 n = vec3(0, 1, 0);
  float t = iBox(o, d, b.xyz, tmin, n);
  lp = o + t*d; ln = n;
  return t;
}

float rboxHit(int id, vec3 ro, vec3 rd, float tmin, out vec3 lp, out vec3 ln, out int flags){
  vec4 a = texelFetch(uPrims, pUV(id, 0), 0);
  vec4 b = texelFetch(uPrims, pUV(id, 1), 0);
  vec4 q = texelFetch(uPrims, pUV(id, 2), 0);
  int tf = int(a.w + 0.5);
  flags = (tf >> 3) & 31;
  float rad = float(tf >> 8)*0.001;
  vec3 o = qinv(q, ro - a.xyz), d = qinv(q, rd);
  d = vec3(abs(d.x) < 1e-9 ? 1e-9 : d.x, abs(d.y) < 1e-9 ? 1e-9 : d.y, abs(d.z) < 1e-9 ? 1e-9 : d.z);
  vec3 n = vec3(0, 1, 0);
  float t = iRBox(o, d, b.xyz, rad, tmin, n);
  lp = o + t*d; ln = n;
  return t;
}

const float GROUND_Y = -0.5;
uniform int uRoot0, uRoot1, uRoot2;

struct Hit { float t; int id; vec3 lp; vec3 ln; };

vec2 aabb(vec3 mn, vec3 mx, vec3 ro, vec3 inv){
  vec3 t0 = (mn - ro)*inv, t1 = (mx - ro)*inv;
  vec3 a = min(t0, t1), b = max(t0, t1);
  return vec2(max(max(a.x, a.y), a.z), min(min(b.x, b.y), b.z));
}

// closest hit. camRay: include camera-only primitives.
void traceBoxes(vec3 ro, vec3 rd, vec3 inv, bool camRay, int root, inout Hit h){
  int stack[32]; int sp = 0; stack[sp++] = root;
  while (sp > 0){
    int ni = stack[--sp];
    vec4 a0 = texelFetch(uNodes, nUV(ni, 0), 0), a1 = texelFetch(uNodes, nUV(ni, 1), 0);
    vec4 b0 = texelFetch(uNodes, nUV(ni, 2), 0), b1 = texelFetch(uNodes, nUV(ni, 3), 0);
    vec2 ta = aabb(a0.xyz, a1.xyz, ro, inv), tb = aabb(b0.xyz, b1.xyz, ro, inv);
    bool ha = ta.x <= ta.y && ta.y >= 0.0 && ta.x <= h.t;
    bool hb = tb.x <= tb.y && tb.y >= 0.0 && tb.x <= h.t;
    if (ha && a1.w > 0.0){
      int s = int(a0.w + 0.5), cnt = int(a1.w + 0.5);
      for (int i = 0; i < cnt; i++){
        vec3 lp, ln; int fl;
        float t = boxHit(s + i, ro, rd, 1e-4, lp, ln, fl);
        if (t > 0.0 && t < h.t && (camRay || (fl & 1) == 0)){ h.t = t; h.id = s + i; h.lp = lp; h.ln = ln; }
      }
      ha = false;
    }
    if (hb && b1.w > 0.0){
      int s = int(b0.w + 0.5), cnt = int(b1.w + 0.5);
      for (int i = 0; i < cnt; i++){
        vec3 lp, ln; int fl;
        float t = boxHit(s + i, ro, rd, 1e-4, lp, ln, fl);
        if (t > 0.0 && t < h.t && (camRay || (fl & 1) == 0)){ h.t = t; h.id = s + i; h.lp = lp; h.ln = ln; }
      }
      hb = false;
    }
    if (ha && hb){
      int na = int(a0.w + 0.5), nb = int(b0.w + 0.5);
      if (ta.x < tb.x){ stack[sp++] = nb; stack[sp++] = na; } else { stack[sp++] = na; stack[sp++] = nb; }
    } else if (ha) stack[sp++] = int(a0.w + 0.5);
    else if (hb) stack[sp++] = int(b0.w + 0.5);
  }
}
void traceRounded(vec3 ro, vec3 rd, vec3 inv, bool camRay, int root, inout Hit h){
  int stack[32]; int sp = 0; stack[sp++] = root;
  while (sp > 0){
    int ni = stack[--sp];
    vec4 a0 = texelFetch(uNodes, nUV(ni, 0), 0), a1 = texelFetch(uNodes, nUV(ni, 1), 0);
    vec4 b0 = texelFetch(uNodes, nUV(ni, 2), 0), b1 = texelFetch(uNodes, nUV(ni, 3), 0);
    vec2 ta = aabb(a0.xyz, a1.xyz, ro, inv), tb = aabb(b0.xyz, b1.xyz, ro, inv);
    bool ha = ta.x <= ta.y && ta.y >= 0.0 && ta.x <= h.t;
    bool hb = tb.x <= tb.y && tb.y >= 0.0 && tb.x <= h.t;
    if (ha && a1.w > 0.0){
      int s = int(a0.w + 0.5), cnt = int(a1.w + 0.5);
      for (int i = 0; i < cnt; i++){
        vec3 lp, ln; int fl;
        float t = rboxHit(s + i, ro, rd, 1e-4, lp, ln, fl);
        if (t > 0.0 && t < h.t && (camRay || (fl & 1) == 0)){ h.t = t; h.id = s + i; h.lp = lp; h.ln = ln; }
      }
      ha = false;
    }
    if (hb && b1.w > 0.0){
      int s = int(b0.w + 0.5), cnt = int(b1.w + 0.5);
      for (int i = 0; i < cnt; i++){
        vec3 lp, ln; int fl;
        float t = rboxHit(s + i, ro, rd, 1e-4, lp, ln, fl);
        if (t > 0.0 && t < h.t && (camRay || (fl & 1) == 0)){ h.t = t; h.id = s + i; h.lp = lp; h.ln = ln; }
      }
      hb = false;
    }
    if (ha && hb){
      int na = int(a0.w + 0.5), nb = int(b0.w + 0.5);
      if (ta.x < tb.x){ stack[sp++] = nb; stack[sp++] = na; } else { stack[sp++] = na; stack[sp++] = nb; }
    } else if (ha) stack[sp++] = int(a0.w + 0.5);
    else if (hb) stack[sp++] = int(b0.w + 0.5);
  }
}
void traceShapes(vec3 ro, vec3 rd, vec3 inv, bool camRay, int root, inout Hit h){
  int stack[32]; int sp = 0; stack[sp++] = root;
  while (sp > 0){
    int ni = stack[--sp];
    vec4 a0 = texelFetch(uNodes, nUV(ni, 0), 0), a1 = texelFetch(uNodes, nUV(ni, 1), 0);
    vec4 b0 = texelFetch(uNodes, nUV(ni, 2), 0), b1 = texelFetch(uNodes, nUV(ni, 3), 0);
    vec2 ta = aabb(a0.xyz, a1.xyz, ro, inv), tb = aabb(b0.xyz, b1.xyz, ro, inv);
    bool ha = ta.x <= ta.y && ta.y >= 0.0 && ta.x <= h.t;
    bool hb = tb.x <= tb.y && tb.y >= 0.0 && tb.x <= h.t;
    if (ha && a1.w > 0.0){
      int s = int(a0.w + 0.5), cnt = int(a1.w + 0.5);
      for (int i = 0; i < cnt; i++){
        vec3 lp, ln; int fl;
        float t = primHit(s + i, ro, rd, 1e-4, lp, ln, fl);
        if (t > 0.0 && t < h.t && (camRay || (fl & 1) == 0)){ h.t = t; h.id = s + i; h.lp = lp; h.ln = ln; }
      }
      ha = false;
    }
    if (hb && b1.w > 0.0){
      int s = int(b0.w + 0.5), cnt = int(b1.w + 0.5);
      for (int i = 0; i < cnt; i++){
        vec3 lp, ln; int fl;
        float t = primHit(s + i, ro, rd, 1e-4, lp, ln, fl);
        if (t > 0.0 && t < h.t && (camRay || (fl & 1) == 0)){ h.t = t; h.id = s + i; h.lp = lp; h.ln = ln; }
      }
      hb = false;
    }
    if (ha && hb){
      int na = int(a0.w + 0.5), nb = int(b0.w + 0.5);
      if (ta.x < tb.x){ stack[sp++] = nb; stack[sp++] = na; } else { stack[sp++] = na; stack[sp++] = nb; }
    } else if (ha) stack[sp++] = int(a0.w + 0.5);
    else if (hb) stack[sp++] = int(b0.w + 0.5);
  }
}

// closest hit. camRay: include camera-only primitives.
bool trace(vec3 ro, vec3 rd, float tmax, bool camRay, out Hit h){
  h.t = tmax; h.id = -1;
  vec3 inv = 1.0/vec3(abs(rd.x) < 1e-9 ? 1e-9 : rd.x, abs(rd.y) < 1e-9 ? 1e-9 : rd.y, abs(rd.z) < 1e-9 ? 1e-9 : rd.z);
  if (rd.y < 0.0){ float tg = (GROUND_Y - ro.y)/rd.y; if (tg > 1e-4 && tg < h.t){ h.t = tg; h.id = -2; h.lp = ro + rd*tg; h.ln = vec3(0, 1, 0); } }
  traceBoxes(ro, rd, inv, camRay, uRoot0, h);
  traceRounded(ro, rd, inv, camRay, uRoot1, h);
  traceShapes(ro, rd, inv, camRay, uRoot2, h);
  return h.id != -1;
}

// ------------------------------------------------ materials
struct Mat { vec3 alb; float rough; float metal; float spec; vec3 emit; vec3 n; float trans; };

vec3 unpackCol(float v, vec3 def){
  if (v < 0.5) return def;
  float r = floor(v/65536.0), g = floor(mod(v/256.0, 256.0)), b = mod(v, 256.0);
  return srgb2lin(vec3(r, g, b)/255.0);
}

void faceUV(vec3 p, vec3 n, out vec2 uv, out vec3 tu, out vec3 tv){
  vec3 a = abs(n);
  if (a.y >= a.x && a.y >= a.z){ uv = p.xz; tu = vec3(1, 0, 0); tv = vec3(0, 0, 1); }
  else if (a.x >= a.z){ uv = vec2(p.z, p.y); tu = vec3(0, 0, 1); tv = vec3(0, 1, 0); }
  else { uv = p.xy; tu = vec3(1, 0, 0); tv = vec3(0, 1, 0); }
}

// grain frame: g.x along the longest axis of the prim
vec3 grainFrame(vec3 p, vec3 hs){
  if (hs.x >= hs.y && hs.x >= hs.z) return p;
  if (hs.y >= hs.z) return p.yzx;
  return p.zxy;
}

float woodTone(vec3 g, float seed, out float late){
  vec2 c = g.yz + vec2(0.35 + seed*0.37, -0.22 + seed*0.21);
  vec3 gp = g*vec3(0.5, 4.0, 4.0);
  c += 0.05*vec2(vnoise3(gp + seed), vnoise3(gp + seed + 7.3)) - 0.025;
  float r = length(c)*42.0 + 1.6*vnoise3(g*vec3(0.25, 3.0, 3.0) + seed);
  float f = fract(r);
  late = smoothstep(0.45, 0.85, f)*smoothstep(1.0, 0.9, f);
  float streak = vnoise3(g*vec3(1.5, 40.0, 40.0) + seed)*0.6;
  float pores = vnoise3(g*vec3(12.0, 400.0, 400.0));
  return 1.0 - 0.28*late - 0.12*streak - 0.06*pores*late;
}

// generic irregular block pattern (stone courses, flagstones)
float blocks(vec2 uv, float rowH, float minL, float maxL, float wob, float seed, out vec2 cell, out vec2 local, out vec2 size){
  vec2 w = uv + wob*vec2(vnoise2(uv*2.3 + seed), vnoise2(uv*2.3 + seed + 17.3)) - wob*0.5;
  w.y += rowH*0.45*vnoise2(vec2(w.y/rowH*0.37, seed + 3.0));   // courses of varying height
  float row = floor(w.y/rowH);
  float bl = minL + (maxL - minL)*hash11(row*1.37 + 2.1 + seed);
  float xo = w.x + hash11(row + 5.3 + seed)*7.0;
  float col = floor(xo/bl);
  local = vec2(fract(xo/bl)*bl, fract(w.y/rowH)*rowH);
  size = vec2(bl, rowH);
  cell = vec2(col, row);
  // random-ashlar: some stones are split into two courses or two shorter stones
  float hs = hash12(cell + seed*1.7);
  if (hs < 0.3){ float up = step(rowH*0.5, local.y); local.y -= up*rowH*0.5; size.y = rowH*0.5; cell += vec2(0.0, up*0.5); }
  else if (hs > 0.78){ float rt = step(bl*0.45, local.x); local.x -= rt*bl*0.45; size.x = mix(bl*0.45, bl*0.55, rt); cell += vec2(rt*0.5, 0.0); }
  return min(min(local.x, size.x - local.x), min(local.y, size.y - local.y));
}

float stoneHeight(vec2 uv, float seed, float rowH, float minL, float maxL, float wob, out vec2 cell, out float dE){
  vec2 local, size;
  dE = blocks(uv, rowH, minL, maxL, wob, seed, cell, local, size);
  float rnd1 = hash12(cell + seed);
  float pillow = smoothstep(0.0, 0.06 + 0.04*rnd1, dE);
  float rough = vnoise2(uv*18.0 + cell*3.1)*0.25 + vnoise2(uv*55.0)*0.1;
  return pillow*0.9 + rough*pillow;
}

// books on a shelf. local p in box space; hs half size. returns albedo & metal mask.
vec3 books(vec3 p, vec3 n, vec3 hs, float seed, out float metal, out float rough, out vec3 bump){
  metal = 0.0; rough = 0.55; bump = vec3(0);
  float x = p.x + hs.x + seed*3.1;
  float y = p.y + hs.y;
  float cellW = 0.043;
  float ci = floor(x/cellW); float fx = fract(x/cellW);
  float hc = hash11(ci*1.7 + seed);
  float split = 0.35 + 0.3*hash11(ci*3.1 + seed*1.3);
  float bi = ci*2.0 + (hc > 0.5 && fx > split ? 1.0 : 0.0);
  float bx0 = (hc > 0.5 && fx > split) ? split : 0.0;
  float bx1 = (hc > 0.5 && fx <= split) ? split : 1.0;
  float u = (fx - bx0)/(bx1 - bx0);
  float h1 = hash11(bi*0.73 + seed*2.0);
  float bh = (2.0*hs.y)*(0.64 + 0.33*hash11(bi*1.31 + seed));
  float gap = step(0.93, hash11(bi*5.3 + seed*0.7));
  if (y > bh || gap > 0.5){ return vec3(0.012, 0.009, 0.007); }
  if (n.z < 0.5){ return (n.y > 0.5) ? vec3(0.55, 0.5, 0.4) : vec3(0.1, 0.07, 0.05); }
  vec3 pal[8];
  pal[0] = vec3(0.23, 0.035, 0.03); pal[1] = vec3(0.04, 0.08, 0.05); pal[2] = vec3(0.03, 0.045, 0.1);
  pal[3] = vec3(0.35, 0.22, 0.11); pal[4] = vec3(0.02, 0.018, 0.016); pal[5] = vec3(0.42, 0.33, 0.2);
  pal[6] = vec3(0.16, 0.05, 0.02); pal[7] = vec3(0.3, 0.26, 0.2);
  vec3 c = pal[int(h1*7.99)];
  c *= 0.75 + 0.5*hash11(bi*9.1);
  float yy = y/bh;
  // gilt bands and labels
  float band = step(abs(yy - 0.9), 0.012) + step(abs(yy - 0.86), 0.006) + step(abs(yy - 0.12), 0.01);
  float label = step(abs(yy - 0.74), 0.045)*step(0.5, hash11(bi*2.9));
  c = mix(c, c*0.45 + vec3(0.12, 0.02, 0.01), label);
  if (band > 0.5 && hash11(bi*4.4) > 0.35){ metal = 1.0; rough = 0.35; c = vec3(0.75, 0.56, 0.25)*0.8; }
  // wear and dust
  c *= 0.85 + 0.3*vnoise2(vec2(x*40.0, y*9.0));
  // rounded spine
  float s = (u - 0.5)*2.0;
  bump = vec3(s*0.55, 0, 0);
  // dark gap between books
  float edge = min(u, 1.0 - u)*(bx1 - bx0)*cellW;
  c *= smoothstep(0.0, 0.0025, edge)*0.8 + 0.2;
  return c;
}

vec3 rugPattern(vec2 p, vec2 hs, float variant){
  // p in metres from centre
  vec2 d = hs - abs(p);
  float e = min(d.x, d.y);
  vec3 ivory = vec3(0.52, 0.44, 0.32), red = vec3(0.26, 0.05, 0.03), indigo = vec3(0.035, 0.05, 0.11), gold = vec3(0.4, 0.27, 0.1), dark = vec3(0.05, 0.035, 0.03);
  if (variant > 3.5){ red = vec3(0.34, 0.3, 0.24); indigo = vec3(0.07, 0.1, 0.16); gold = vec3(0.45, 0.38, 0.28); ivory = vec3(0.58, 0.52, 0.42); }
  else if (variant > 2.5){ red = vec3(0.18, 0.05, 0.035); }
  else if (variant > 1.5){ red = vec3(0.12, 0.13, 0.2); indigo = vec3(0.2, 0.04, 0.03); }
  vec3 c;
  if (e < 0.05) c = dark;
  else if (e < 0.08) c = ivory;
  else if (e < 0.32){
    float t = (e - 0.08)/0.24;
    vec2 q = (abs(p.x) > abs(p.y) - (hs.y - hs.x)) ? vec2(p.y, e) : vec2(p.x, e);
    float m = abs(fract(q.x*3.2) - 0.5)*2.0;
    float motif = step(abs(m - (t - 0.5)*1.4), 0.25);
    c = mix(indigo, gold, motif*0.8);
    if (t < 0.08 || t > 0.92) c = red;
  } else if (e < 0.37) c = ivory*0.85;
  else {
    vec2 q = p*2.2;
    vec2 g = fract(q) - 0.5;
    float dm = abs(g.x) + abs(g.y);
    c = red;
    c = mix(c, indigo, step(dm, 0.32)*step(0.2, dm));
    c = mix(c, gold, step(dm, 0.1));
    float cm = abs(p.x)/hs.x*0.8 + abs(p.y)/hs.y*1.2;
    float med = step(cm, 0.45);
    c = mix(c, mix(indigo, ivory*0.7, step(abs(fract(cm*7.0) - 0.5), 0.12)), med);
  }
  c *= 0.8 + 0.35*vnoise2(p*3.0) + 0.1*vnoise2(p*90.0);
  // sun-faded, worn antique wool: desaturate and lift towards a warm grey
  float fade = 0.35 + 0.25*vnoise2(p*1.3);
  c = mix(c, vec3(lum(c))*vec3(1.1, 1.0, 0.85), fade);
  c = mix(c, vec3(0.3, 0.25, 0.2), 0.12);
  return c;
}

vec3 paintingColor(vec2 uv, float variant, float seed){
  vec3 c;
  if (variant > 3.5){
    // verdure tapestry: foliage field, faded, with a woven border
    vec2 e = min(uv, 1.0 - uv);
    float border = step(min(e.x, e.y*1.3), 0.07);
    float f1 = fbm2(uv*vec2(7.0, 5.0) + seed), f2 = fbm2(uv*vec2(16.0, 12.0) + seed + 4.0);
    c = mix(vec3(0.07, 0.1, 0.07), vec3(0.2, 0.22, 0.12), smoothstep(0.35, 0.7, f1));
    c = mix(c, vec3(0.32, 0.27, 0.15), smoothstep(0.62, 0.8, f2)*0.8);
    c = mix(c, vec3(0.1, 0.12, 0.16), smoothstep(0.55, 0.75, fbm2(uv*3.0 + 9.0))*0.5*step(0.55, uv.y));
    vec3 bc = mix(vec3(0.25, 0.12, 0.07), vec3(0.4, 0.32, 0.18), step(0.5, fract((uv.x + uv.y)*18.0)));
    c = mix(c, bc, border);
    c *= 0.85 + 0.15*step(0.5, fract(uv.x*260.0))*step(0.5, fract(uv.y*200.0)) + 0.1*vnoise2(uv*300.0);
    return mix(c, vec3(lum(c)), 0.2)*1.1;
  }
  if (variant > 2.5){
    // seascape
    float hor = 0.38;
    vec3 sky = mix(vec3(0.52, 0.46, 0.34), vec3(0.2, 0.24, 0.27), smoothstep(hor, 1.0, uv.y));
    float cl = fbm2(uv*vec2(3.0, 7.0) + seed);
    sky = mix(sky, vec3(0.65, 0.58, 0.44), smoothstep(0.5, 0.8, cl)*0.7);
    sky = mix(sky, vec3(0.15, 0.15, 0.14), smoothstep(0.55, 0.85, fbm2(uv*vec2(2.0, 5.0) + seed + 3.0))*0.5);
    vec3 sea = mix(vec3(0.07, 0.1, 0.09), vec3(0.18, 0.2, 0.16), vnoise2(uv*vec2(4.0, 40.0)));
    sea += vec3(0.25, 0.22, 0.15)*smoothstep(0.72, 0.95, vnoise2(uv*vec2(12.0, 90.0)))*smoothstep(0.1, hor, uv.y);
    c = uv.y > hor ? sky : sea;
    // ship
    vec2 s = uv - vec2(0.62, hor);
    if (s.y > 0.0 && s.y < 0.22 && abs(s.x) < 0.07*(1.0 - s.y*3.0) + 0.01 && s.y > 0.03) c = mix(c, vec3(0.6, 0.55, 0.42), 0.7);
    if (s.y > -0.01 && s.y < 0.03 && abs(s.x) < 0.08) c = vec3(0.08, 0.06, 0.04);
  } else if (variant > 1.5){
    // ancestral portrait
    c = vec3(0.045, 0.035, 0.025)*(0.8 + 0.5*fbm2(uv*3.0 + seed));
    c += vec3(0.05, 0.035, 0.015)*smoothstep(0.6, 0.0, length(uv - vec2(0.35, 0.75)));
    vec2 f = (uv - vec2(0.5, 0.68))*vec2(1.0, 0.78);
    float face = smoothstep(0.13, 0.12, length(f));
    vec3 skin = vec3(0.56, 0.4, 0.3)*(0.8 + 0.3*(0.5 - f.x*2.0));
    vec2 bdy = uv - vec2(0.5, 0.0);
    float body = step(bdy.y, 0.52)*step(abs(bdy.x), 0.18 + (0.52 - bdy.y)*0.55);
    vec3 coat = vec3(0.04, 0.04, 0.05) + vec3(0.03)*vnoise2(uv*20.0);
    if (seed > 50.0) coat = vec3(0.12, 0.03, 0.02);
    float collar = step(abs(uv.x - 0.5), 0.06)*step(abs(uv.y - 0.5), 0.04);
    c = mix(c, coat, body);
    c = mix(c, vec3(0.6, 0.57, 0.5), collar);
    c = mix(c, skin, face);
    float hair = smoothstep(0.15, 0.13, length((uv - vec2(0.5, 0.74))*vec2(1.0, 0.9)))*step(0.73, uv.y + f.x*0.1);
    c = mix(c, vec3(0.08, 0.06, 0.04), hair*0.9);
  } else {
    // pastoral landscape
    float hor = 0.42 + 0.05*vnoise2(vec2(uv.x*3.0, seed));
    vec3 sky = mix(vec3(0.62, 0.55, 0.4), vec3(0.3, 0.36, 0.38), smoothstep(hor, 1.0, uv.y));
    float cl = fbm2(uv*vec2(3.0, 6.0) + seed);
    sky = mix(sky, vec3(0.72, 0.66, 0.52), smoothstep(0.45, 0.75, cl)*0.8);
    float hill = hor + 0.06*fbm2(vec2(uv.x*4.0, seed + 2.0)) - 0.02;
    vec3 land = mix(vec3(0.22, 0.24, 0.14), vec3(0.3, 0.3, 0.18), vnoise2(uv*6.0));
    land = mix(land, vec3(0.35, 0.33, 0.25), smoothstep(hill - 0.08, hill, uv.y)*0.6);
    c = uv.y > hill ? sky : land;
    float fg = smoothstep(0.3, 0.05, uv.y);
    c = mix(c, vec3(0.1, 0.08, 0.04), fg*0.8);
    float trees = step(0.52, fbm2(uv*vec2(7.0, 9.0) + seed*1.7))*step(uv.y, hill + 0.22*smoothstep(0.55, 0.0, abs(uv.x - 0.2)))*step(0.25, uv.y);
    c = mix(c, vec3(0.06, 0.07, 0.03)*(0.7 + 0.6*vnoise2(uv*40.0)), trees);
    // cattle
    for (int i = 0; i < 3; i++){
      vec2 cp = vec2(0.55 + float(i)*0.09, 0.3 + float(i%2)*0.02);
      vec2 d = (uv - cp)*vec2(1.0, 1.8);
      if (length(d) < 0.022) c = mix(vec3(0.3, 0.2, 0.12), vec3(0.55, 0.5, 0.4), float(i == 1));
    }
  }
  // aged varnish, darkened edges, craquelure
  c *= vec3(1.0, 0.9, 0.66)*0.85;
  vec2 e = min(uv, 1.0 - uv);
  c *= 0.55 + 0.45*smoothstep(0.0, 0.18, min(e.x, e.y));
  vec2 vg = uv*vec2(28.0, 34.0);
  vec2 fv = fract(vg) - 0.5 + 0.3*(hash22(floor(vg)) - 0.5);
  c *= 0.9 + 0.1*smoothstep(0.02, 0.06, min(abs(fv.x), abs(fv.y)));
  c *= 0.9 + 0.2*vnoise2(uv*120.0);
  return c;
}

vec3 globeColor(vec3 n){
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x);
  float land = fbm3(n*2.2 + 3.0);
  vec3 sea = vec3(0.34, 0.33, 0.24);
  vec3 ground = mix(vec3(0.45, 0.3, 0.15), vec3(0.38, 0.35, 0.2), vnoise3(n*9.0));
  vec3 c = land > 0.55 ? ground : sea;
  if (abs(land - 0.55) < 0.008) c *= 0.4;
  float grid = min(abs(fract(lat*6.0/PI) - 0.5), abs(fract(lon*6.0/PI) - 0.5));
  c *= 0.85 + 0.15*smoothstep(0.0, 0.02, 0.5 - grid);
  return c*vec3(1.0, 0.92, 0.72);
}

float sootAt(vec3 p){
  float s = 0.0;
  vec3 d = (p - vec3(-14.0, 2.55, -5.15))/vec3(0.4, 1.1, 1.5); s = max(s, 1.0 - dot(d, d));
  d = (p - vec3(-14.0, 2.6, 5.15))/vec3(0.4, 1.2, 1.8); s = max(s, 1.0 - dot(d, d));
  d = (p - vec3(10.65, 1.25, 0.97))/vec3(0.7, 0.6, 0.25); s = max(s, 1.0 - dot(d, d));
  return clamp(s, 0.0, 1.0);
}
bool insideCastle(vec3 p){ return abs(p.x) < 15.02 && abs(p.z) < 10.02 && p.y < 10.85 && p.y > -0.45; }
int roomId(vec3 p){
  if (!(abs(p.x) < 15.67 && abs(p.z) < 10.67 && p.y < 10.9 && p.y > -0.45)) return 0;
  if (p.z < 0.0) return p.x < 4.0 ? 1 : 2;
  if (p.x < -3.0) return 3;
  return p.x < 6.0 ? 4 : 5;
}

vec3 ember(vec3 p, float amt){
  float n = vnoise3(p*28.0 + vec3(0.0, uTime*0.7, 0.0));
  float n2 = vnoise3(p*9.0 - vec3(uTime*0.3));
  float g = pow(clamp(n*0.7 + n2*0.5 - 0.2, 0.0, 1.0), 3.0)*3.0;
  return uFireCol*uFireI*g*amt*0.5;
}

Mat getMat(int mid, vec3 wp, vec3 lp, vec3 ln, vec3 hs, vec4 prm, vec4 q, int type, bool hq){
  Mat m; m.alb = vec3(0.5); m.rough = 0.8; m.metal = 0.0; m.spec = 0.04; m.emit = vec3(0); m.trans = 0.0;
  vec3 bump = vec3(0);   // in local space
  float seed = prm.y;
  vec2 uv; vec3 tu, tv;

  if (mid == 0 || mid == 1){
    // ---- stone walls (rubble courses) / dressed trim
    bool trim = mid == 1;
    vec3 wn = qrot(q, ln);
    vec3 wa = abs(wn);
    vec2 wuv; vec3 wtu, wtv;
    if (wa.y >= wa.x && wa.y >= wa.z){ wuv = wp.xz; wtu = vec3(1,0,0); wtv = vec3(0,0,1); }
    else if (wa.x >= wa.z){ wuv = vec2(wp.z, wp.y); wtu = vec3(0,0,1); wtv = vec3(0,1,0); }
    else { wuv = wp.xy; wtu = vec3(1,0,0); wtv = vec3(0,1,0); }
    bool inside = insideCastle(wp);
    vec2 cell; float dE;
    if (!trim){
      float rowH = inside ? 0.27 : 0.33;
      float e = 0.006;
      float h0 = stoneHeight(wuv, 0.0, rowH, 0.32, 0.85, 0.05, cell, dE);
      if (hq){
        vec2 c2; float d2;
        float h1 = stoneHeight(wuv + vec2(e, 0), 0.0, rowH, 0.32, 0.85, 0.05, c2, d2);
        float h2 = stoneHeight(wuv + vec2(0, e), 0.0, rowH, 0.32, 0.85, 0.05, c2, d2);
        vec2 gr = vec2(h1 - h0, h2 - h0)/e;
        vec3 bw = -(wtu*gr.x + wtv*gr.y)*0.035;
        bump = qinv(q, bw);
      }
      float r1 = hash12(cell), r2 = hash12(cell + 7.7), r3 = hash12(cell + 3.3);
      vec3 st;
      if (inside){
        st = mix(vec3(0.36, 0.29, 0.21), vec3(0.52, 0.44, 0.33), r1);
        st = mix(st, vec3(0.4, 0.27, 0.16), step(0.82, r2)*0.7);
        st = mix(st, vec3(0.3, 0.28, 0.25), step(0.88, r3)*0.6);
      } else {
        st = mix(vec3(0.3, 0.28, 0.24), vec3(0.47, 0.43, 0.37), r1);
        st = mix(st, vec3(0.4, 0.33, 0.24), step(0.8, r2)*0.6);
      }
      float surf = hq ? fbm2(wuv*5.0 + cell*1.7) : 0.5;
      st *= 0.78 + 0.42*surf;
      if (hq) st *= 0.9 + 0.2*vnoise2(wuv*40.0);
      vec3 mortar = inside ? vec3(0.6, 0.56, 0.48) : vec3(0.52, 0.5, 0.45);
      mortar *= 0.85 + 0.3*vnoise2(wuv*30.0);
      float mj = 1.0 - smoothstep(0.008, 0.022, dE);
      m.alb = mix(st, mortar*0.72, mj);
      m.rough = mix(0.82, 0.95, mj);
      // limewashed rooms (kitchen, bedroom): lime over the stone, joints still read through
      bool lime = inside && ((wp.x > 6.25 && wp.z > 0.25) || (wp.x < -3.25 && wp.z > 0.25));
      if (lime){
        float lw = 0.86 + 0.1*(hq ? fbm2(wuv*1.7 + 3.0) : 0.5);
        vec3 limec = vec3(0.79, 0.73, 0.62)*lw;
        limec = mix(limec, limec*0.88, mj*0.25);
        limec *= 0.94 + 0.08*(hq ? vnoise2(wuv*3.0 + 7.0) : 0.5);
        limec *= 0.97 + 0.06*r1;
        m.alb = limec; m.rough = 0.95;
        bump *= 0.3;
        m.alb *= 0.9 + 0.1*smoothstep(0.0, 0.5, wp.y);
      } else if (inside){
        m.alb *= 0.82 + 0.18*smoothstep(0.0, 0.9, wp.y);
        m.alb *= 1.0 - 0.25*smoothstep(3.0, 9.0, wp.y)*(hq ? fbm2(wuv*0.7) : 0.5);
      } else {
        float lich = smoothstep(0.62, 0.78, fbm2(wuv*1.3 + 5.0));
        m.alb = mix(m.alb, vec3(0.55, 0.55, 0.45), lich*0.5);
        float streak = vnoise2(vec2(wuv.x*6.0, wuv.y*0.25));
        m.alb *= 0.8 + 0.25*streak;
        float moss = smoothstep(1.0, -0.4, wp.y)*smoothstep(0.4, 0.7, fbm2(wuv*3.0));
        m.alb = mix(m.alb, vec3(0.12, 0.15, 0.06), moss*0.7);
      }
    } else {
      // dressed limestone ashlar
      faceUV(lp, ln, uv, tu, tv);
      float r1 = hash11(seed*3.7);
      vec3 st = mix(vec3(0.55, 0.5, 0.41), vec3(0.64, 0.59, 0.49), r1);
      bool inside2 = insideCastle(wp);
      if (!inside2) st = mix(st, vec3(0.52, 0.5, 0.46), 0.5);
      float n1 = fbm2(wuv*4.0 + seed);
      st *= 0.82 + 0.3*n1;
      float tool = vnoise2(vec2(wuv.x*90.0, wuv.y*6.0));
      st *= 0.95 + 0.08*tool;
      // ashlar joints on trim every ~0.6m
      vec2 jl, js; vec2 jc;
      float jd = blocks(wuv, 0.42, 0.5, 0.9, 0.0, 31.0, jc, jl, js);
      float jm = 1.0 - smoothstep(0.003, 0.009, jd);
      m.alb = mix(st, vec3(0.45, 0.42, 0.36), jm*0.8);
      m.rough = 0.72;
      bump = qinv(q, (wtu*(vnoise2(wuv*60.0) - 0.5) + wtv*(vnoise2(wuv*60.0 + 3.0) - 0.5))*0.06);
      if (!inside2){
        float lich = smoothstep(0.65, 0.8, fbm2(wuv*1.7 + 9.0));
        m.alb = mix(m.alb, vec3(0.58, 0.58, 0.48), lich*0.5);
        m.alb *= 0.8 + 0.2*vnoise2(vec2(wuv.x*5.0, wuv.y*0.3));
      }
    }
    if (!inside && uWet > 0.0){ m.alb *= mix(1.0, 0.55, uWet); m.rough = mix(m.rough, 0.3, uWet); }
    if (inside){ float so = sootAt(wp); if (so > 0.0) m.alb *= 1.0 - 0.8*so*(0.6 + 0.4*vnoise3(wp*6.0)); }
  }
  else if (mid == 2){
    // ---- wide plank oak floor (x = 0 along x, 1 along z, 2 chevron)
    vec2 fp = prm.w > 0.5 && prm.w < 1.5 ? wp.zx : wp.xz;
    float u, v, pw, fu, fv, plen; vec2 id; vec3 g;
    if (prm.w > 1.5){
      float W = 0.62;
      float c = floor(fp.x/W); float fx = fract(fp.x/W);
      float dir = mod(c, 2.0) < 1.0 ? 1.0 : -1.0;
      float along = fp.y + (dir > 0.0 ? fx : 1.0 - fx)*W;
      pw = 0.11;
      float pi2 = floor(along/pw); fv = fract(along/pw);
      id = vec2(c, pi2);
      fu = dir > 0.0 ? fx : 1.0 - fx;
      g = vec3(fu*W*1.414, fv*pw, 0.0);
      float eu = min(fx, 1.0 - fx)*W*0.707;
      float gapE = min(eu, min(fv, 1.0 - fv)*pw);
      float gap = 1.0 - smoothstep(0.0007, 0.0022, gapE);
      fu = 0.5; u = fx; plen = 1.0; v = gapE;
      float h = hash12(id);
      float late = 0.0; float wt = hq ? woodTone(g + vec3(h*17.0, h*3.0, 0.0), h*10.0, late) : 0.9;
      vec3 base = mix(vec3(0.3, 0.17, 0.08), vec3(0.42, 0.26, 0.13), h);
      m.alb = base*wt*(0.85 + 0.25*vnoise2(wp.xz*0.8));
      m.alb *= 1.0 - gap*0.85;
      m.rough = 0.32 + 0.25*vnoise2(wp.xz*2.0) + gap*0.4;
      m.spec = 0.045;
      bump = vec3(0.0, 0.0, 0.0);
    } else {
      pw = 0.27;
      float yw = fp.y + 0.1*vnoise2(vec2(fp.y*1.9, 3.0));
      float pi = floor(yw/pw); fv = fract(yw/pw);
      float off = hash11(pi*1.3)*9.0;
      plen = 2.1 + 1.9*hash11(pi*2.7 + 1.0);
      float seg = floor((fp.x + off)/plen); fu = fract((fp.x + off)/plen);
      id = vec2(seg, pi);
      float h = hash12(id + 0.5);
      g = vec3(fp.x + off + h*50.0, fv*pw + h*7.0, 0.3 + h);
      float late = 0.0; float wt = hq ? woodTone(g, h*13.0, late) : 0.9;
      vec3 base = mix(vec3(0.27, 0.16, 0.085), vec3(0.4, 0.26, 0.14), h);
      base = mix(base, vec3(0.33, 0.24, 0.16), 0.25*step(0.8, hash12(id + 9.0)));
      float knot = 0.0;
      vec2 kc = vec2(hash12(id + 3.0), hash12(id + 4.0));
      vec2 kd = (vec2(fu*plen, fv*pw) - kc*vec2(plen, pw))*vec2(1.0, 2.5);
      knot = smoothstep(0.025, 0.0, length(kd))*step(0.6, hash12(id + 5.0));
      m.alb = base*wt*(1.0 - 0.6*knot);
      float edge = min(min(fv, 1.0 - fv)*pw, min(fu, 1.0 - fu)*plen);
      float gap = 1.0 - smoothstep(0.0008, 0.003, edge);
      m.alb *= 1.0 - 0.85*gap;
      float wear = fbm2(wp.xz*0.35);
      m.alb *= 0.85 + 0.25*wear;
      m.rough = 0.42 + 0.28*smoothstep(0.3, 0.8, wear) + 0.3*gap + 0.1*hash12(id + 7.0);
      // cupping + worn grain relief
      float cup = (fv - 0.5)*0.35;
      vec3 bw = prm.w > 0.5 ? vec3(cup, 0.0, 0.0) : vec3(0.0, 0.0, cup);
      bw += vec3(vnoise2(g.xy*vec2(3.0, 120.0)) - 0.5, 0.0, vnoise2(g.xy*vec2(3.0, 120.0) + 5.0) - 0.5)*0.05;
      bump = bw;
    }
    if (insideCastle(wp)) m.alb *= 0.9 + 0.1*smoothstep(0.0, 0.5, min(min(wp.x + 15.0, 15.0 - wp.x), min(wp.z + 10.0, 10.0 - wp.z)));
  }
  else if (mid == 3){
    // ---- flagstones
    vec2 cell; float dE;
    vec2 fuv = wp.xz + seed;
    float e = 0.005;
    float h0 = stoneHeight(fuv, 5.0, 0.62, 0.5, 1.05, 0.03, cell, dE);
    if (hq){
      vec2 c2; float d2;
      float h1 = stoneHeight(fuv + vec2(e, 0), 5.0, 0.62, 0.5, 1.05, 0.03, c2, d2);
      float h2 = stoneHeight(fuv + vec2(0, e), 5.0, 0.62, 0.5, 1.05, 0.03, c2, d2);
      vec2 gr = vec2(h1 - h0, h2 - h0)/e;
      bump = -vec3(gr.x, 0.0, gr.y)*0.02;
    }
    float r1 = hash12(cell), r2 = hash12(cell + 2.2);
    vec3 st = mix(vec3(0.3, 0.26, 0.2), vec3(0.47, 0.4, 0.3), r1);
    st = mix(st, vec3(0.33, 0.33, 0.32), step(0.72, r2)*0.6);
    st = mix(st, vec3(0.45, 0.33, 0.22), step(0.9, hash12(cell + 5.5))*0.6);
    st *= 0.8 + 0.35*fbm2(fuv*3.0 + cell);
    float worn = fbm2(fuv*0.6);
    float mj = 1.0 - smoothstep(0.005, 0.014, dE);
    m.alb = mix(st, vec3(0.2, 0.19, 0.17), mj);
    m.rough = mix(0.45 + 0.3*worn, 0.95, mj);
  }
  else if (mid == 4 || mid == 20){
    // ---- aged oak beams / boards
    vec3 g = grainFrame(lp, hs);
    if (mid == 20){
      // boards: planks along longest axis, width across 2nd axis
      vec3 ghs = grainFrame(hs, hs);
      float across = (ghs.y > ghs.z ? g.y : g.z) + 17.0;
      float bw = 0.19;
      float bi = floor(across/bw); float fb = fract(across/bw);
      g += vec3(hash11(bi)*30.0, hash11(bi + 1.0)*3.0, 0.0);
      float late = 0.0; float wt = hq ? woodTone(g, seed + bi, late) : 0.9;
      vec3 base = unpackCol(prm.z, vec3(0.2, 0.12, 0.065));
      m.alb = base*wt*(0.8 + 0.4*hash11(bi*3.3));
      float gap = 1.0 - smoothstep(0.004, 0.009, min(fb, 1.0 - fb)*bw);
      m.alb *= 1.0 - gap*0.85;
      m.rough = 0.7;
    } else {
      float late = 0.0; float wt = hq ? woodTone(g*vec3(1.0, 0.7, 0.7), seed, late) : 0.9;
      vec3 base = unpackCol(prm.z, vec3(0.15, 0.095, 0.055));
      float n = hq ? fbm3l(g*vec3(0.6, 3.0, 3.0) + seed) : 0.5;
      m.alb = base*wt*(0.7 + 0.6*n);
      // checks (drying cracks) along grain
      float ck = abs(vnoise3(vec3(g.x*0.9, g.y*7.0, g.z*7.0) + seed) - 0.5);
      float crack = smoothstep(0.018, 0.0, ck)*step(0.45, vnoise2(vec2(g.x*0.6, seed)));
      m.alb *= 1.0 - 0.8*crack;
      m.rough = 0.72 - 0.1*n;
      // adze facets
      float af = vnoise3(vec3(g.x*5.0, g.y*1.5, g.z*1.5) + seed);
      vec3 bl = vec3(0.0, af - 0.5, vnoise3(vec3(g.x*5.0, g.y*1.5, g.z*1.5) + seed + 5.0) - 0.5)*0.12;
      if (hs.x >= hs.y && hs.x >= hs.z) bump = bl;
      else if (hs.y >= hs.z) bump = bl.zxy;
      else bump = bl.yzx;
    }
  }
  else if (mid == 5){
    // ---- limewash plaster
    vec3 base = unpackCol(prm.z, vec3(0.74, 0.7, 0.62));
    float n = fbm2(wp.xz*1.3 + wp.y);
    m.alb = base*(0.88 + 0.16*n);
    m.alb *= 0.92 + 0.08*vnoise2(wp.xz*25.0);
    m.rough = 0.95;
    bump = vec3(vnoise3(wp*9.0) - 0.5, 0.0, vnoise3(wp*9.0 + 4.0) - 0.5)*0.12;
  }
  else if (mid == 6 || mid == 18){
    // ---- linen (and lampshade linen)
    vec3 base = unpackCol(prm.z, vec3(0.62, 0.56, 0.46));
    float slub = vnoise3(lp*vec3(10.0, 70.0, 10.0) + seed);
    float slub2 = vnoise3(lp*vec3(70.0, 10.0, 70.0) + seed);
    m.alb = base*(0.9 + 0.1*slub + 0.06*slub2);
    m.alb *= 0.93 + 0.1*fbm3l(lp*6.0 + seed);
    m.rough = 0.92;
    bump = (vec3(vnoise3(lp*5.0 + seed), vnoise3(lp*5.0 + seed + 9.0), vnoise3(lp*5.0 + seed + 19.0)) - 0.5)*0.35;
    bump += (vec3(vnoise3(lp*260.0), 0.0, vnoise3(lp*260.0 + 3.0)) - 0.5)*0.12;
    if (prm.w > 1.5 && mid == 6){
      float ph = lp.x*46.0 + 1.3*vnoise2(vec2(lp.y*0.8, seed));
      bump += vec3(cos(ph)*0.75, 0.0, 0.0);
      m.alb *= 0.8 + 0.2*(0.5 + 0.5*sin(ph));
      m.alb *= 0.9 + 0.1*smoothstep(-hs.y, hs.y, lp.y);
    }
    if (mid == 18){
      m.trans = 0.3;
      m.emit = uLampCol*uLampI*prm.w*0.55*base*1.6;
      m.alb *= 0.9;
    }
  }
  else if (mid == 7){
    // ---- wool (tartan / herringbone)
    vec3 base = unpackCol(prm.z, vec3(0.2, 0.25, 0.18));
    faceUV(lp, ln, uv, tu, tv);
    vec2 s = fract(uv*2.6);
    vec3 c = base;
    if (prm.w < 0.5){
      float a = step(0.38, s.x)*step(s.x, 0.62), b = step(0.38, s.y)*step(s.y, 0.62);
      float a2 = step(0.08, s.x)*step(s.x, 0.12), b2 = step(0.08, s.y)*step(s.y, 0.12);
      c = mix(c, vec3(0.03, 0.04, 0.08), 0.5*(a + b));
      c = mix(c, vec3(0.3, 0.05, 0.03), 0.6*max(a2, b2));
      c = mix(c, vec3(0.45, 0.38, 0.22), 0.4*step(abs(s.x - 0.8), 0.01));
    } else {
      float hb = step(0.5, fract(uv.x*14.0 + abs(fract(uv.y*14.0) - 0.5)));
      c *= 0.85 + 0.2*hb;
    }
    m.alb = c*(0.85 + 0.25*vnoise3(lp*120.0));
    m.rough = 1.0;
    bump = (vec3(vnoise3(lp*80.0), vnoise3(lp*80.0 + 4.0), vnoise3(lp*80.0 + 8.0)) - 0.5)*0.5;
  }
  else if (mid == 8){
    // ---- worn leather
    vec3 base = unpackCol(prm.z, vec3(0.3, 0.12, 0.045));
    float n1 = fbm3l(lp*5.0 + seed);
    float wear = smoothstep(0.52, 0.78, fbm3l(lp*3.2 + seed*2.0));
    // edge wear on rounded boxes
    vec3 inner = max(abs(lp) - (hs - prm.x - 0.02), 0.0);
    float edgeW = smoothstep(0.0, 0.05, length(inner))*0.8;
    wear = clamp(wear + edgeW*0.7*vnoise3(lp*25.0), 0.0, 1.0);
    m.alb = base*(0.78 + 0.45*n1);
    m.alb = mix(m.alb, base*1.9 + vec3(0.03, 0.015, 0.0), wear*0.6);
    float cr = 1.0 - abs(vnoise3(lp*vec3(11.0, 16.0, 11.0) + seed)*2.0 - 1.0);
    m.alb *= 1.0 - 0.35*smoothstep(0.9, 0.99, cr);
    m.rough = mix(0.33, 0.62, wear) + 0.1*vnoise3(lp*40.0);
    m.spec = 0.045;
    bump = (vec3(vnoise3(lp*190.0), vnoise3(lp*190.0 + 7.0), vnoise3(lp*190.0 + 13.0)) - 0.5)*0.1;
    bump += (vec3(vnoise3(lp*9.0 + seed), vnoise3(lp*9.0 + seed + 2.0), vnoise3(lp*9.0 + seed + 5.0)) - 0.5)*0.25;
    if (prm.w > 0.5){
      // chesterfield tufting on the faces
      faceUV(lp, ln, uv, tu, tv);
      vec2 t = uv/vec2(0.13, 0.11);
      vec2 g1 = floor(t) + 0.5, g2 = floor(t + 0.5);
      vec2 d1 = t - g1, d2 = t - g2;
      vec2 d = dot(d1, d1) < dot(d2, d2) ? d1 : d2;
      float r = length(d);
      float k = exp(-r*r*9.0)*1.2;
      bump += -(tu*d.x + tv*d.y)*k*1.5;
      m.alb *= mix(1.0, 0.45, smoothstep(0.1, 0.0, r));
      // diamond pleats
      m.alb *= 1.0 - 0.25*smoothstep(0.06, 0.0, abs(abs(d.x) - abs(d.y)))*smoothstep(0.1, 0.45, r);
    }
  }
  else if (mid == 9){
    // ---- polished antique wood
    vec3 base = unpackCol(prm.z, vec3(0.2, 0.1, 0.05));
    vec3 g = grainFrame(lp, hs);
    if (type == 2 || type == 4) g = lp.yxz;
    float late = 0.0; float wt = hq ? woodTone(g*vec3(1.0, 1.4, 1.4), seed, late) : 0.9;
    m.alb = base*wt*(0.85 + 0.3*vnoise3(g*vec3(0.5, 8.0, 8.0) + seed));
    float wear = vnoise3(wp*7.0);
    m.rough = prm.w > 0.01 ? prm.w : (0.24 + 0.2*wear);
    if (prm.w > 0.5) m.alb *= 1.15;
    m.spec = 0.05;
    bump = (vec3(vnoise3(wp*140.0), vnoise3(wp*140.0 + 3.0), vnoise3(wp*140.0 + 6.0)) - 0.5)*0.03;
  }
  else if (mid == 10 || mid == 30){
    // ---- brass / gilt
    float t = fbm3l(wp*14.0 + seed);
    vec3 F0 = mid == 10 ? vec3(0.9, 0.72, 0.38) : vec3(0.95, 0.72, 0.33);
    if (mid == 30){
      // moulding profile across the bar
      vec3 hl = hs;
      float across = prm.w > 0.5 ? lp.x/hl.x : lp.y/hl.y;
      float prof = sin(across*PI*3.0 + 0.4)*0.5 + 0.5;
      vec3 axis = prm.w > 0.5 ? vec3(1, 0, 0) : vec3(0, 1, 0);
      bump = axis*cos(across*PI*3.0 + 0.4)*0.9;
      F0 *= 0.55 + 0.45*prof;
      float bead = step(0.5, fract((prm.w > 0.5 ? lp.y : lp.x)*55.0));
      F0 *= 0.9 + 0.1*bead;
      float wornG = smoothstep(0.6, 0.8, fbm3l(wp*20.0));
      m.alb = mix(F0, vec3(0.3, 0.12, 0.06), wornG*0.5);
      m.metal = 1.0 - wornG*0.5; m.rough = 0.3 + 0.2*t;
    } else {
      m.alb = mix(F0, vec3(0.3, 0.2, 0.09), smoothstep(0.45, 0.85, t)*0.8);
      m.metal = 1.0; m.rough = mix(0.16, 0.45, t);
    }
  }
  else if (mid == 11){
    // ---- blackened wrought iron
    float n = vnoise3(wp*30.0);
    m.alb = vec3(0.028, 0.026, 0.024)*(0.7 + 0.6*n);
    m.spec = 0.07; m.rough = 0.4 + 0.25*n;
    bump = (vec3(vnoise3(wp*60.0), vnoise3(wp*60.0 + 2.0), vnoise3(wp*60.0 + 4.0)) - 0.5)*0.25;
  }
  else if (mid == 12){
    // ---- glass: came pattern handled by glassCame(); here the lead came surface
    m.alb = vec3(0.04, 0.04, 0.042); m.spec = 0.06; m.rough = 0.45;
  }
  else if (mid == 13){
    // ---- books
    float mt, rg; vec3 bb;
    m.alb = books(lp, ln, hs, seed, mt, rg, bb);
    m.metal = mt; m.rough = rg; bump = bb;
  }
  else if (mid == 14){
    // ---- rug
    m.alb = rugPattern(lp.xz, hs.xz, prm.w);
    m.rough = 1.0;
    bump = (vec3(vnoise3(wp*150.0), 0.0, vnoise3(wp*150.0 + 5.0)) - 0.5)*0.35;
  }
  else if (mid == 16){
    m.alb = vec3(0.82, 0.77, 0.64); m.rough = 0.35;
    m.emit = uCandleCol*uLampI*0.004*smoothstep(-0.02, 0.0, lp.y - hs.y);
  }
  else if (mid == 21){
    // ---- slate
    vec2 suv;
    if (type == 4){ float ang = atan(lp.z, lp.x); float rr = mix(hs.x, hs.z, (lp.y + hs.y)/(2.0*hs.y)); suv = vec2(ang*max(rr, 0.3), -lp.y*1.18); }
    else suv = vec2(lp.x, lp.z);
    float rowH = 0.19;
    float row = floor(suv.y/rowH); float fr = fract(suv.y/rowH);
    float sw = 0.27;
    float sx = suv.x/sw + hash11(row)*0.5 + mod(row, 2.0)*0.5;
    float si = floor(sx); float fs = fract(sx);
    float h = hash12(vec2(si, row));
    vec3 c = mix(vec3(0.06, 0.065, 0.075), vec3(0.13, 0.13, 0.15), h);
    c = mix(c, vec3(0.1, 0.08, 0.08), step(0.85, hash12(vec2(si, row) + 3.0))*0.6);
    c *= 0.85 + 0.3*vnoise2(suv*vec2(20.0, 4.0));
    float gapv = 1.0 - smoothstep(0.0, 0.03, min(fs, 1.0 - fs));
    float shadow = smoothstep(0.0, 0.12, fr);
    c *= (0.5 + 0.5*shadow)*(1.0 - 0.6*gapv);
    float lich = smoothstep(0.7, 0.85, fbm2(suv*0.8 + 3.0));
    c = mix(c, vec3(0.35, 0.36, 0.25), lich*0.5);
    m.alb = c; m.rough = 0.55 - 0.1*h; m.spec = 0.045;
    if (type == 4) bump = vec3(0.0, -(fr - 0.5)*0.3, 0.0); else bump = vec3(0.0, 0.0, (fr - 0.5)*0.3);
    if (uWet > 0.0){ m.alb *= mix(1.0, 0.6, uWet); m.rough = mix(m.rough, 0.12, uWet); }
  }
  else if (mid == 22){
    // ---- clipped box / yew / tree foliage
    vec3 p = wp*(prm.w > 0.5 ? 9.0 : 26.0);
    float v = vnoise3(p); float v2 = vnoise3(p*2.7 + 3.0);
    vec3 base = prm.w > 0.5 ? vec3(0.05, 0.085, 0.025) : vec3(0.03, 0.06, 0.018);
    m.alb = base*(0.55 + 0.8*v*v2 + 0.3*fbm3l(wp*1.5));
    m.alb = mix(m.alb, vec3(0.09, 0.1, 0.03), smoothstep(0.7, 0.9, v2)*0.5);
    m.rough = 0.65; m.spec = 0.035;
    bump = (vec3(vnoise3(p*1.3), vnoise3(p*1.3 + 5.0), vnoise3(p*1.3 + 9.0)) - 0.5)*(prm.w > 0.5 ? 2.6 : 1.8);
  }
  else if (mid == 23){
    float t = fbm3l(wp*9.0 + seed);
    m.alb = mix(vec3(0.93, 0.6, 0.47), vec3(0.45, 0.25, 0.15), smoothstep(0.4, 0.8, t)*0.7);
    m.metal = 1.0; m.rough = 0.18 + 0.2*t;
  }
  else if (mid == 24){
    // ---- glazed ceramic (optionally blue & white)
    vec3 base = unpackCol(prm.z, vec3(0.8, 0.78, 0.72));
    m.alb = base; m.rough = 0.07; m.spec = 0.05;
    if (prm.w > 0.5){
      float r = length(lp.xz)/max(hs.x, 1e-3);
      float ang = atan(lp.z, lp.x);
      float blue = step(0.86, r)*step(r, 0.97);
      blue += step(0.6, r)*step(r, 0.66);
      float fl = step(0.55, vnoise2(vec2(ang*4.0, r*10.0) + seed))*step(0.68, r)*step(r, 0.84);
      fl += step(0.6, vnoise2(vec2(ang*3.0, r*6.0) + seed*2.0))*step(r, 0.5);
      if (type == 2 && abs(ln.y) < 0.5){ float yy = lp.y/hs.y; blue = step(0.7, abs(yy)); fl = step(0.55, vnoise2(vec2(ang*3.0, yy*4.0) + seed))*step(abs(yy), 0.6); }
      m.alb = mix(vec3(0.82, 0.8, 0.76), vec3(0.05, 0.1, 0.35), clamp(blue + fl, 0.0, 1.0));
    }
    m.alb *= 0.95 + 0.05*vnoise3(wp*20.0);
  }
  else if (mid == 25){
    m.alb = vec3(0.02, 0.018, 0.016)*(0.6 + 0.8*fbm3l(wp*6.0)); m.rough = 1.0;
    // glow from the fire on soot is handled by lights; add a touch of hot back
  }
  else if (mid == 26){
    // ---- painted cabinetry
    vec3 base = unpackCol(prm.z, vec3(0.5, 0.55, 0.45));
    vec3 g = grainFrame(lp, hs);
    float brush = vnoise3(g*vec3(2.0, 160.0, 160.0));
    m.alb = base*(0.94 + 0.08*brush);
    vec3 inner = max(abs(lp) - (hs - 0.012), 0.0);
    float edge = step(0.0001, length(inner))*step(0.6, vnoise3(wp*30.0));
    m.alb = mix(m.alb, vec3(0.3, 0.2, 0.12), edge*0.6);
    m.rough = 0.5; m.spec = 0.045;
    bump = vec3(0.0, brush - 0.5, 0.0)*0.04;
  }
  else if (mid == 27){
    vec3 p = wp*2.0;
    float v = abs(sin(p.x*2.0 + p.z*1.3 + fbm3l(p*1.5)*7.0));
    m.alb = mix(vec3(0.5, 0.5, 0.48), vec3(0.76, 0.75, 0.72), smoothstep(0.0, 0.25, v));
    m.rough = 0.2; m.spec = 0.045;
  }
  else if (mid == 28){
    // ---- firewood logs (x=1 in fire, x=2 ember bed)
    if (prm.w > 1.5){
      float ash = vnoise3(wp*18.0);
      m.alb = mix(vec3(0.03, 0.025, 0.02), vec3(0.22, 0.21, 0.2), smoothstep(0.35, 0.7, ash)); m.rough = 1.0;
      m.emit = ember(wp, 1.2)*smoothstep(0.55, 0.8, vnoise3(wp*9.0 + 4.0));
    } else {
      bool cap = type == 2 && abs(ln.y) > 0.5;
      if (cap){
        float r = length(lp.xz);
        float ring = fract(r*60.0 + vnoise2(lp.xz*20.0));
        m.alb = mix(vec3(0.42, 0.3, 0.18), vec3(0.3, 0.2, 0.11), smoothstep(0.3, 0.8, ring));
        m.alb = mix(m.alb, vec3(0.08, 0.06, 0.04), smoothstep(hs.x*0.8, hs.x, r));
      } else {
        float ang = atan(lp.z, lp.x);
        float fis = vnoise2(vec2(ang*9.0, lp.y*2.5 + seed));
        m.alb = vec3(0.11, 0.08, 0.06)*(0.5 + 0.9*fis);
        m.alb = mix(m.alb, vec3(0.2, 0.19, 0.16), smoothstep(0.7, 0.9, vnoise2(vec2(ang*3.0, lp.y*1.0 + seed)))*0.5);
        bump = vec3(cos(ang), 0.0, sin(ang))*(fis - 0.5)*0.9;
      }
      m.rough = 0.95;
      if (prm.w > 0.5){
        float charred = smoothstep(0.2, 0.7, vnoise3(wp*12.0));
        m.alb = mix(m.alb, vec3(0.02, 0.018, 0.016), max(charred, 0.6));
        float under = smoothstep(0.3, -0.5, qrot(q, ln).y);
        float cracks = smoothstep(0.62, 0.78, vnoise3(wp*24.0));
        m.emit = ember(wp, 0.8)*max(under*0.7, cracks)*smoothstep(0.35, 0.55, vnoise3(wp*20.0));
      }
    }
  }
  else if (mid == 29){
    if (ln.z > 0.5){
      vec2 puv = lp.xy/hs.xy*0.5 + 0.5;
      m.alb = paintingColor(puv, prm.w, seed);
      m.rough = prm.w > 3.5 ? 1.0 : 0.35; m.spec = 0.045;
      bump = (vec3(vnoise2(puv*300.0), vnoise2(puv*300.0 + 3.0), 0.0) - 0.5)*0.06;
    } else { m.alb = vec3(0.15, 0.13, 0.1); m.rough = 0.9; }
  }
  else if (mid == 31){
    vec3 base = unpackCol(prm.z, vec3(0.8, 0.74, 0.58));
    m.alb = base; m.rough = 0.1; m.spec = 0.05;
    if (type == 4 && ln.y < 0.0) m.alb = vec3(0.8);
  }
  else if (mid == 32){ m.alb = vec3(0.62, 0.62, 0.6); m.metal = 1.0; m.rough = 0.08 + 0.05*vnoise3(wp*20.0); }
  else if (mid == 33){
    vec2 muv = lp.xy/hs.xy;
    float fox = smoothstep(0.7, 1.0, max(abs(muv.x), abs(muv.y)))*vnoise2(muv*6.0);
    m.alb = mix(vec3(0.86, 0.85, 0.82), vec3(0.3, 0.27, 0.22), fox*0.8);
    m.metal = 1.0; m.rough = 0.02 + fox*0.2;
    if (ln.z < 0.5){ m.alb = vec3(0.1); m.metal = 0.0; m.rough = 0.8; }
  }
  else if (mid == 34){
    float seam = 1.0 - smoothstep(0.0, 0.03, abs(fract(wp.x/0.65) - 0.5) - 0.44);
    m.alb = vec3(0.3, 0.31, 0.32)*(0.8 + 0.4*fbm2(wp.xz*0.8)) + vec3(0.1)*smoothstep(0.7, 0.9, vnoise2(wp.xz*3.0));
    m.rough = 0.55; bump = vec3(-sign(fract(wp.x/0.65) - 0.5)*seam, 0.0, 0.0)*0.8;
    if (uWet > 0.0){ m.alb *= mix(1.0, 0.7, uWet); m.rough = mix(m.rough, 0.08, uWet); }
  }
  else if (mid == 35){
    m.alb = vec3(0.45, 0.22, 0.12)*(0.75 + 0.4*fbm3l(wp*6.0));
    m.alb = mix(m.alb, vec3(0.55, 0.5, 0.42), smoothstep(0.65, 0.85, vnoise3(wp*8.0))*0.5);
    m.rough = 0.85;
  }
  else if (mid == 36){ m.alb = vec3(0.5, 0.5, 0.48)*(0.8 + 0.3*vnoise3(wp*15.0)); m.metal = 1.0; m.rough = 0.35; }
  else if (mid == 37){ m.alb = vec3(0.9); m.rough = 0.3; m.emit = uLampCol*uLampI*0.7*(0.6 + 0.4*smoothstep(-1.0, 0.5, lp.y/hs.y)); }
  else if (mid == 38){
    m.alb = unpackCol(prm.z, vec3(0.5)); m.rough = prm.w > 0.01 ? prm.w : 0.5;
    m.alb *= 0.92 + 0.12*vnoise3(wp*30.0 + seed);
    if (prm.w > 0.9) bump = (vec3(vnoise3(wp*8.0), vnoise3(wp*8.0 + 1.0), vnoise3(wp*8.0 + 2.0)) - 0.5)*0.8;
  }
  else if (mid == 40){
    // distant meadow hills with hedgerows and copses
    vec2 p = wp.xz;
    vec3 c = mix(vec3(0.09, 0.13, 0.04), vec3(0.14, 0.15, 0.06), fbm2(p*0.01));
    float field = hash12(floor(p/vec2(90.0, 70.0)));
    c = mix(c, vec3(0.2, 0.17, 0.08), step(0.72, field)*0.7);
    float wood = smoothstep(0.55, 0.62, fbm2(p*0.008 + 7.0));
    c = mix(c, vec3(0.025, 0.045, 0.015), wood);
    c *= 0.8 + 0.4*vnoise2(p*0.3);
    m.alb = c; m.rough = 0.85;
    bump = (vec3(vnoise3(wp*0.5), 0.0, vnoise3(wp*0.5 + 3.0)) - 0.5)*(0.3 + wood*1.5);
  }
  else if (mid == 39){
    m.alb = globeColor(normalize(lp)); m.rough = 0.25; m.spec = 0.05;
  }
  if (!hq) bump = vec3(0);
  m.n = normalize(qrot(q, normalize(ln + bump)));
  return m;
}

// ground plane material (lawn / gravel)
Mat groundMat(vec3 wp){
  Mat m; m.metal = 0.0; m.spec = 0.03; m.emit = vec3(0); m.trans = 0.0;
  vec2 p = wp.xz;
  float edge = fbm2(p*0.4)*0.8;
  float dRect = max(abs(p.x) - 16.0, abs(p.y) - 11.0);
  bool drive = p.x > -1.5 + 0.4*sin(p.y*0.05) && p.x < 4.5 + 0.4*sin(p.y*0.05) && p.y > 11.0 && p.y < 90.0;
  float g = max(step(dRect, 4.2 + edge*0.5), float(drive));
  vec3 bump;
  if (g > 0.5){
    vec2 q = p*22.0;
    vec2 ip = floor(q), fp = fract(q);
    float md = 8.0; vec2 mc = vec2(0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      vec2 o = vec2(i, j); vec2 r = o + hash22(ip + o) - fp; float d = dot(r, r);
      if (d < md){ md = d; mc = ip + o; }
    }
    float h = hash12(mc);
    vec3 c = mix(vec3(0.42, 0.38, 0.32), vec3(0.6, 0.55, 0.46), h);
    c = mix(c, vec3(0.3, 0.26, 0.22), step(0.85, hash12(mc + 3.0)));
    float peb = 1.0 - smoothstep(0.0, 0.35, md);
    m.alb = c*(0.55 + 0.45*peb)*(0.85 + 0.25*fbm2(p*0.5));
    m.rough = 0.85;
    bump = vec3(hash12(mc + 1.0) - 0.5, 0.0, hash12(mc + 2.0) - 0.5)*peb*1.2;
    if (uWet > 0.0){
      float pud = smoothstep(0.55, 0.7, fbm2(p*0.25 + 4.0))*uWet;
      m.alb *= mix(1.0, 0.55, uWet); m.rough = mix(m.rough, 0.35, uWet);
      m.alb = mix(m.alb, vec3(0.02), pud*0.7); m.rough = mix(m.rough, 0.02, pud); bump *= 1.0 - pud;
    }
  } else {
    float garden = 1.0 - smoothstep(45.0, 60.0, max(abs(p.x), abs(p.y - 8.0)));
    float stripe = step(0.5, fract((p.x + 1.5)/3.2))*garden;
    vec3 c = mix(vec3(0.075, 0.13, 0.035), vec3(0.09, 0.145, 0.042), stripe);
    c = mix(vec3(0.1, 0.13, 0.045), c, garden);
    c *= 0.72 + 0.56*fbm2(p*0.9);
    c = mix(c, vec3(0.13, 0.12, 0.06), (1.0 - garden)*smoothstep(0.45, 0.8, fbm2(p*0.12 + 3.0))*0.6);
    c = mix(c, vec3(0.16, 0.16, 0.06), smoothstep(0.65, 0.9, fbm2(p*0.2 + 7.0))*0.4);
    c *= 0.8 + 0.4*vnoise2(p*60.0);
    m.alb = c; m.rough = 0.8;
    bump = (vec3(vnoise2(p*70.0), 0.0, vnoise2(p*70.0 + 3.0)) - 0.5)*1.4 + vec3(stripe - 0.5*garden, 0.0, 0.0)*0.12;
    if (uWet > 0.0){ m.alb *= mix(1.0, 0.75, uWet); m.rough = mix(m.rough, 0.45, uWet); }
  }
  m.n = normalize(vec3(0, 1, 0) + bump);
  return m;
}

// lead came pattern for leaded windows: returns 1 on lead
float glassCame(vec3 lp, vec3 ln, vec3 hs, float plain){
  if (plain > 0.5) return 0.0;
  vec2 uv = abs(ln.x) > 0.5 ? lp.zy : lp.xy;
  if (hs.x < hs.z) uv = lp.zy;
  vec2 qd = vec2(uv.x/0.13 + uv.y/0.2, -uv.x/0.13 + uv.y/0.2);
  vec2 f = abs(fract(qd) - 0.5);
  float d = 0.5 - max(f.x, f.y);
  return step(d, 0.045);
}

// ------------------------------------------------ BRDF
float G1(float nx, float a2){ return 2.0*nx/(nx + sqrt(a2 + (1.0 - a2)*nx*nx)); }
vec3 evalBRDF(Mat m, vec3 n, vec3 v, vec3 l){
  float nl = dot(n, l); if (nl <= 0.0) return vec3(0);
  float nv = max(dot(n, v), 1e-4);
  vec3 h = normalize(v + l);
  float nh = max(dot(n, h), 0.0), vh = max(dot(v, h), 0.0);
  float a = max(m.rough*m.rough, 0.0025); float a2 = a*a;
  float dd = nh*nh*(a2 - 1.0) + 1.0;
  float D = a2/(PI*dd*dd);
  float G = G1(nl, a2)*G1(nv, a2);
  vec3 F0 = mix(vec3(m.spec), m.alb, m.metal);
  vec3 F = F0 + (1.0 - F0)*pow(1.0 - vh, 5.0);
  vec3 spec = D*G*F/(4.0*nl*nv);
  vec3 diff = (1.0 - m.metal)*m.alb/PI*(1.0 - m.spec);
  return diff + spec;
}
void onb(vec3 n, out vec3 b1, out vec3 b2){
  float s = n.z >= 0.0 ? 1.0 : -1.0; float a = -1.0/(s + n.z); float b = n.x*n.y*a;
  b1 = vec3(1.0 + s*n.x*n.x*a, s*b, -s*n.x); b2 = vec3(b, s + n.y*n.y*a, -n.y);
}
vec3 sampleVNDF(vec3 Ve, float a, vec2 u){
  vec3 Vh = normalize(vec3(a*Ve.x, a*Ve.y, Ve.z));
  float lensq = Vh.x*Vh.x + Vh.y*Vh.y;
  vec3 T1 = lensq > 0.0 ? vec3(-Vh.y, Vh.x, 0.0)*inversesqrt(lensq) : vec3(1, 0, 0);
  vec3 T2 = cross(Vh, T1);
  float r = sqrt(u.x); float phi = 2.0*PI*u.y;
  float t1 = r*cos(phi), t2 = r*sin(phi);
  float s = 0.5*(1.0 + Vh.z);
  t2 = (1.0 - s)*sqrt(1.0 - t1*t1) + s*t2;
  vec3 Nh = t1*T1 + t2*T2 + sqrt(max(0.0, 1.0 - t1*t1 - t2*t2))*Vh;
  return normalize(vec3(a*Nh.x, a*Nh.y, max(0.0, Nh.z)));
}
float specProb(Mat m, float nv){
  vec3 F0 = mix(vec3(m.spec), m.alb, m.metal);
  float Fv = lum(F0 + (1.0 - F0)*pow(1.0 - nv, 5.0));
  if (m.metal > 0.9) return 1.0;
  float d = lum(m.alb)*(1.0 - m.metal);
  return clamp(Fv/(Fv + d + 1e-4), 0.08, 0.92);
}
// returns direction; weight = f*cos/pdf
vec3 sampleBRDF(Mat m, vec3 n, vec3 v, out vec3 w, out bool specular){
  vec3 b1, b2; onb(n, b1, b2);
  float nv = max(dot(n, v), 1e-4);
  float ps = specProb(m, nv);
  float a = max(m.rough*m.rough, 0.0025);
  vec3 l;
  specular = rnd() < ps;
  if (specular){
    vec3 Ve = vec3(dot(v, b1), dot(v, b2), nv);
    vec3 H = sampleVNDF(Ve, a, vec2(rnd(), rnd()));
    vec3 h = H.x*b1 + H.y*b2 + H.z*n;
    l = reflect(-v, h);
  } else {
    float r1 = rnd(), r2 = rnd();
    float r = sqrt(r1), ph = 2.0*PI*r2;
    l = r*cos(ph)*b1 + r*sin(ph)*b2 + sqrt(max(0.0, 1.0 - r1))*n;
  }
  float nl = dot(n, l);
  if (nl <= 0.0){ w = vec3(0); return l; }
  vec3 h = normalize(v + l);
  float nh = max(dot(n, h), 0.0);
  float a2 = a*a; float dd = nh*nh*(a2 - 1.0) + 1.0; float D = a2/(PI*dd*dd);
  float pdfS = D*G1(nv, a2)/(4.0*nv);
  float pdfD = nl/PI;
  float pdf = ps*pdfS + (1.0 - ps)*pdfD;
  w = evalBRDF(m, n, v, l)*nl/max(pdf, 1e-6);
  w = min(w, vec3(20.0));
  return l;
}

// ------------------------------------------------ shadows (any-hit with transmission)
vec3 transmit(int id, vec3 lp, vec3 ln, int fl){
  if ((fl & 8) != 0) return vec3(0.35);
  vec4 b = texelFetch(uPrims, pUV(id, 1), 0);
  vec4 d = texelFetch(uPrims, pUV(id, 3), 0);
  if (int(b.w + 0.5) == 12) return (1.0 - glassCame(lp, ln, b.xyz, d.w))*vec3(0.84, 0.87, 0.82);
  return unpackCol(d.z, vec3(0.62, 0.56, 0.46))*0.45;
}
bool shadowBoxes(vec3 ro, vec3 rd, vec3 inv, float tmax, int root, inout vec3 T){
  int stack[32]; int sp = 0; stack[sp++] = root;
  while (sp > 0){
    int ni = stack[--sp];
    for (int c = 0; c < 2; c++){
      vec4 n0 = texelFetch(uNodes, nUV(ni, c*2), 0), n1 = texelFetch(uNodes, nUV(ni, c*2 + 1), 0);
      vec2 tt = aabb(n0.xyz, n1.xyz, ro, inv);
      if (tt.x > tt.y || tt.y < 0.0 || tt.x > tmax) continue;
      if (n1.w < 0.5){ stack[sp++] = int(n0.w + 0.5); continue; }
      int s = int(n0.w + 0.5), cnt = int(n1.w + 0.5);
      for (int i = 0; i < cnt; i++){
        vec3 lp, ln; int fl;
        float t = boxHit(s + i, ro, rd, 1e-4, lp, ln, fl);
        if (t > 0.0 && t < tmax && (fl & 5) == 0){
          if ((fl & 2) == 0) return false;
          T *= transmit(s + i, lp, ln, fl);
          if (max(T.x, max(T.y, T.z)) < 0.01) return false;
        }
      }
    }
  }
  return true;
}
bool shadowRounded(vec3 ro, vec3 rd, vec3 inv, float tmax, int root, inout vec3 T){
  int stack[32]; int sp = 0; stack[sp++] = root;
  while (sp > 0){
    int ni = stack[--sp];
    for (int c = 0; c < 2; c++){
      vec4 n0 = texelFetch(uNodes, nUV(ni, c*2), 0), n1 = texelFetch(uNodes, nUV(ni, c*2 + 1), 0);
      vec2 tt = aabb(n0.xyz, n1.xyz, ro, inv);
      if (tt.x > tt.y || tt.y < 0.0 || tt.x > tmax) continue;
      if (n1.w < 0.5){ stack[sp++] = int(n0.w + 0.5); continue; }
      int s = int(n0.w + 0.5), cnt = int(n1.w + 0.5);
      for (int i = 0; i < cnt; i++){
        vec3 lp, ln; int fl;
        float t = rboxHit(s + i, ro, rd, 1e-4, lp, ln, fl);
        if (t > 0.0 && t < tmax && (fl & 5) == 0){
          if ((fl & 2) == 0) return false;
          T *= transmit(s + i, lp, ln, fl);
          if (max(T.x, max(T.y, T.z)) < 0.01) return false;
        }
      }
    }
  }
  return true;
}
bool shadowShapes(vec3 ro, vec3 rd, vec3 inv, float tmax, int root, inout vec3 T){
  int stack[32]; int sp = 0; stack[sp++] = root;
  while (sp > 0){
    int ni = stack[--sp];
    for (int c = 0; c < 2; c++){
      vec4 n0 = texelFetch(uNodes, nUV(ni, c*2), 0), n1 = texelFetch(uNodes, nUV(ni, c*2 + 1), 0);
      vec2 tt = aabb(n0.xyz, n1.xyz, ro, inv);
      if (tt.x > tt.y || tt.y < 0.0 || tt.x > tmax) continue;
      if (n1.w < 0.5){ stack[sp++] = int(n0.w + 0.5); continue; }
      int s = int(n0.w + 0.5), cnt = int(n1.w + 0.5);
      for (int i = 0; i < cnt; i++){
        vec3 lp, ln; int fl;
        float t = primHit(s + i, ro, rd, 1e-4, lp, ln, fl);
        if (t > 0.0 && t < tmax && (fl & 5) == 0){
          if ((fl & 2) == 0) return false;
          T *= transmit(s + i, lp, ln, fl);
          if (max(T.x, max(T.y, T.z)) < 0.01) return false;
        }
      }
    }
  }
  return true;
}

vec3 shadowT(vec3 ro, vec3 rd, float tmax){
  vec3 T = vec3(1);
  if (rd.y < 0.0){ float tg = (GROUND_Y - ro.y)/rd.y; if (tg > 1e-4 && tg < tmax) return vec3(0); }
  vec3 inv = 1.0/vec3(abs(rd.x) < 1e-9 ? 1e-9 : rd.x, abs(rd.y) < 1e-9 ? 1e-9 : rd.y, abs(rd.z) < 1e-9 ? 1e-9 : rd.z);
  if (!shadowBoxes(ro, rd, inv, tmax, uRoot0, T)) return vec3(0);
  if (!shadowRounded(ro, rd, inv, tmax, uRoot1, T)) return vec3(0);
  if (!shadowShapes(ro, rd, inv, tmax, uRoot2, T)) return vec3(0);
  return T;
}

// ------------------------------------------------ sky
vec3 skyLUT(vec3 rd){
  float el = asin(clamp(rd.y, 0.0, 1.0));
  float u = atan(rd.z, rd.x)/(2.0*PI) + 0.5;
  float v = sqrt(el/(0.5*PI));
  return texture(uSky, vec2(u, v)).rgb;
}
float cloudDensity(vec2 p){
  float n = fbm2(p);
  float cov = uCloud;
  return smoothstep(1.0 - cov - 0.08, 1.0 - cov + 0.28, n + 0.15*cov);
}
vec2 cloudCoord(vec3 rd){ return rd.xz/max(rd.y, 0.03)*0.55 + uCloudOff; }
float cloudShadow(vec3 p){
  if (uCloud < 0.02 || uSunDir.y <= 0.0) return 1.0;
  vec2 c = cloudCoord(uSunDir) + p.xz*0.00035;
  float d = cloudDensity(c);
  return 1.0 - d*mix(0.8, 0.97, uCloud);
}
vec3 skyFull(vec3 rd){
  vec3 s = skyLUT(rd);
  if (rd.y > 0.0){
    // distant tree line and hills
    float az = atan(rd.z, rd.x);
    float el = asin(rd.y);
    float hill = 0.012 + 0.018*vnoise2(vec2(az*2.0, 1.0)) + 0.01*vnoise2(vec2(az*7.0, 3.0));
    float trees = hill + 0.012*vnoise2(vec2(az*40.0, 5.0)) + 0.006*vnoise2(vec2(az*160.0, 7.0));
    if (el < trees){
      vec3 hz = skyLUT(normalize(vec3(rd.x, 0.02, rd.z)));
      vec3 amb = skyLUT(vec3(0, 1, 0))*0.6 + uSunE*max(uSunDir.y, 0.0)*0.05;
      vec3 fol = vec3(0.04, 0.06, 0.03)*amb*(0.7 + 0.6*vnoise2(vec2(az*300.0, el*300.0)));
      float haze = 0.62 + 0.3*uHaze;
      return mix(fol, hz, haze);
    }
    if (uCloud > 0.01){
      float d = cloudDensity(cloudCoord(rd));
      d *= smoothstep(0.0, 0.12, rd.y);
      float mu = max(dot(rd, uSunDir), 0.0);
      float thick = fbm2(cloudCoord(rd)*2.0 + 3.0);
      vec3 lit = uSunEClear*(0.06 + 0.35*pow(mu, 8.0))*(1.0 - 0.55*thick)*mix(1.0, 0.25, uCloud*uCloud);
      vec3 amb = skyLUT(vec3(0, 1, 0))*2.2 + skyLUT(normalize(vec3(rd.x, 0.1, rd.z)))*0.5;
      vec3 cc = lit + amb*(0.7 - 0.3*thick);
      s = mix(s, cc, d);
    }
  }
  return s;
}

// ------------------------------------------------ direct lighting (NEE)
vec3 sampleCone(vec3 dir, float cosMax){
  float u1 = rnd(), u2 = rnd();
  float ct = 1.0 - u1*(1.0 - cosMax); float st = sqrt(max(0.0, 1.0 - ct*ct)); float ph = 2.0*PI*u2;
  vec3 b1, b2; onb(dir, b1, b2);
  return normalize(b1*cos(ph)*st + b2*sin(ph)*st + dir*ct);
}
vec3 direct(vec3 p, vec3 gn, Mat m, vec3 v){
  vec3 L = vec3(0);
  vec3 n = m.n;
  vec3 po = p + gn*2e-3;
  // sun
  if (uSunDir.y > -0.02 && lum(uSunE) > 1e-5){
    vec3 l = sampleCone(uSunDir, uSunCos);
    float nl = dot(n, l);
    if (nl > 0.0 && dot(gn, l) > 0.0){
      vec3 f = evalBRDF(m, n, v, l);
      if (lum(f) > 0.0){
        vec3 T = shadowT(po, l, 1e4);
        if (lum(T) > 0.0) L += T*uSunE*cloudShadow(p)*f*nl;
      }
    }
  }
  // local lights: pick one by importance
  int room = roomId(p);
  if (uNumLights > 0){
    float wsum = 0.0;
    for (int i = 0; i < 48; i++){
      if (i >= uNumLights) break;
      vec3 d = uLightPos[i].xyz - p; float r = uLightPos[i].w;
      float w = uLightCol[i].w/max(dot(d, d), r*r*4.0)*(roomId(uLightPos[i].xyz) == room ? 1.0 : 0.02);
      wsum += w;
    }
    if (wsum > 0.0){
      float x = rnd()*wsum; int sel = 0; float wsel = 0.0; float acc = 0.0;
      for (int i = 0; i < 48; i++){
        if (i >= uNumLights) break;
        vec3 d = uLightPos[i].xyz - p; float r = uLightPos[i].w;
        float w = uLightCol[i].w/max(dot(d, d), r*r*4.0)*(roomId(uLightPos[i].xyz) == room ? 1.0 : 0.02);
        acc += w; sel = i; wsel = w;
        if (acc >= x) break;
      }
      vec3 c = uLightPos[sel].xyz; float r = uLightPos[sel].w;
      vec3 d = c - p; float d2 = dot(d, d);
      if (d2 > r*r*1.01){
        float dist = sqrt(d2);
        float cosMax = sqrt(max(0.0, 1.0 - r*r/d2));
        vec3 l = sampleCone(d/dist, cosMax);
        float nl = dot(n, l);
        if (nl > 0.0 && dot(gn, l) > 0.0){
          float pdf = 1.0/(2.0*PI*(1.0 - cosMax));
          vec3 Le = uLightCol[sel].rgb/(4.0*PI*PI*r*r);
          vec3 T = shadowT(po, l, dist - r);
          L += T*Le*evalBRDF(m, n, v, l)*nl/pdf/(wsel/wsum);
        }
      }
    }
  }
  // skylight through window portals (interior points only; BSDF rays escaping to the sky are then ignored)
  if (room != 0 && uNumPortals > 0){
    float wsum = 0.0;
    for (int i = 0; i < 16; i++){
      if (i >= uNumPortals) break;
      vec4 C = uPortal[i*3]; vec3 U = uPortal[i*3 + 1].xyz, Vv = uPortal[i*3 + 2].xyz;
      vec3 N = normalize(cross(U, Vv))*uPortal[i*3 + 1].w;
      vec3 d = p - C.xyz; float dd = dot(d, d);
      float w = C.w*max(dot(N, d), 0.0)/(dd*sqrt(dd) + 0.05);
      wsum += w;
    }
    if (wsum > 0.0){
      float x = rnd()*wsum; int sel = 0; float wsel = 0.0; float acc = 0.0;
      for (int i = 0; i < 16; i++){
        if (i >= uNumPortals) break;
        vec4 C = uPortal[i*3]; vec3 U = uPortal[i*3 + 1].xyz, Vv = uPortal[i*3 + 2].xyz;
        vec3 N = normalize(cross(U, Vv))*uPortal[i*3 + 1].w;
        vec3 d = p - C.xyz; float dd = dot(d, d);
        float w = C.w*max(dot(N, d), 0.0)/(dd*sqrt(dd) + 0.05);
        acc += w; sel = i; wsel = w;
        if (acc >= x) break;
      }
      vec4 C = uPortal[sel*3]; vec3 U = uPortal[sel*3 + 1].xyz, Vv = uPortal[sel*3 + 2].xyz;
      vec3 N = normalize(cross(U, Vv))*uPortal[sel*3 + 1].w;
      vec3 s = C.xyz + (rnd()*2.0 - 1.0)*U + (rnd()*2.0 - 1.0)*Vv;
      vec3 d = s - p; float dist = length(d); vec3 l = d/dist;
      float cp = dot(N, -l);
      float nl = dot(n, l);
      if (cp > 0.0 && nl > 0.0 && dot(gn, l) > 0.0 && l.y > 0.0){
        float pdf = dist*dist/(C.w*cp)*(wsel/wsum);
        vec3 f = evalBRDF(m, n, v, l);
        vec3 T = shadowT(po, l, 1e4);
        vec3 c = T*skyLUT(l)*f*nl/pdf;
        L += min(c, vec3(4.0));
      }
    }
  }
  return L;
}

float phaseHG(float mu, float g){ return (1.0 - g*g)/(4.0*PI*pow(1.0 + g*g - 2.0*g*mu, 1.5)); }

// primary-segment media: exterior aerial perspective + interior dust shafts
void primaryMedia(vec3 ro, vec3 rd, float tEnd, inout vec3 L, inout vec3 thr){
  vec3 bmn = vec3(-15.0, 0.0, -10.0), bmx = vec3(15.0, 10.8, 10.0);
  vec3 inv = 1.0/vec3(abs(rd.x) < 1e-9 ? 1e-9 : rd.x, abs(rd.y) < 1e-9 ? 1e-9 : rd.y, abs(rd.z) < 1e-9 ? 1e-9 : rd.z);
  vec2 bi = aabb(bmn, bmx, ro, inv);
  float a = max(bi.x, 0.0), b = min(bi.y, tEnd);
  float inLen = max(b - a, 0.0);
  float outLen = max(tEnd - inLen, 0.0);
  if (uDust > 0.0 && inLen > 0.0 && lum(uSunE) > 1e-4){
    float ts = a + rnd()*inLen;
    vec3 ps = ro + rd*ts;
    vec3 T = shadowT(ps, uSunDir, 1e4);
    float sig = uDust*0.0003;
    L += thr*T*uSunE*cloudShadow(ps)*phaseHG(dot(rd, uSunDir), 0.6)*sig*inLen;
  }
  float sigF = 0.00012 + uHaze*uHaze*0.02;
  float Tf = exp(-outLen*sigF);
  if (outLen > 0.0 && Tf < 0.999){
    vec3 hz = skyLUT(normalize(vec3(rd.x, 0.05, rd.z)));
    vec3 insF = hz*(1.0 - Tf) + uSunE*cloudShadow(ro)*phaseHG(dot(rd, uSunDir), 0.7)*0.4*(1.0 - Tf)*sigF*400.0/(1.0 + sigF*400.0);
    L += thr*insF;
    thr *= Tf;
  }
}


vec3 flameEmit(vec3 lp, vec3 hs, float seed, bool candle){
  vec3 u = lp/hs;
  float y = u.y*0.5 + 0.5;
  if (candle){
    float core = smoothstep(1.0, 0.0, length(u*vec3(1.0, 0.8, 1.0)));
    vec3 c = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.9, 0.7), core);
    c = mix(c, vec3(0.2, 0.3, 1.0), smoothstep(0.3, 0.0, y)*0.4);
    return c*core*uLampI*2.5*uCandleCol;
  }
  float n = fbm3l(vec3(u.x*1.6 + seed, u.y*1.2 - uTime*2.2, u.z*1.6));
  float n2 = vnoise3(vec3(u.x*4.0, u.y*3.0 - uTime*4.0, u.z*4.0 + seed));
  float r = length(u.xz)*(0.8 + 0.6*y);
  float dens = clamp((1.0 - r) + (n - 0.5)*1.6 + (n2 - 0.5)*0.5 - y*0.9, 0.0, 1.0);
  dens = pow(dens, 1.5);
  vec3 hot = vec3(1.0, 0.82, 0.5), mid = vec3(1.0, 0.45, 0.1), cool = vec3(0.7, 0.14, 0.02);
  vec3 c = mix(hot, mid, smoothstep(0.1, 0.5, y + (0.5 - dens)*0.5));
  c = mix(c, cool, smoothstep(0.5, 0.95, y));
  return c*dens*uFireI*2.6;
}

void main(){
  ivec2 pix = ivec2(gl_FragCoord.xy);
  rs = uint(pix.x)*1973u + uint(pix.y)*9277u + uint(uFrame)*26699u;
  rs = rs ^ (rs >> 13u); rnd(); rnd();
  vec2 jit = vec2(rnd(), rnd()) - 0.5;
  vec2 ndc = ((gl_FragCoord.xy + jit)/uRes)*2.0 - 1.0;
  float aspect = uRes.x/uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamFwd + ndc.x*aspect*uTanHalf*uCamRight + ndc.y*uTanHalf*uCamUp);

  vec3 L = vec3(0), thr = vec3(1);
  bool chain = true;
  bool gSet = false;
  vec3 gAlb = vec3(1), gN = -rd, gEmis = vec3(0); float gDist = 1e4;
  float pathLen = 0.0;
  int bounce = 0;
  bool portalDone = false;
  bool first = true;
  bool primarySeg = true;
  vec3 camRo = ro, camRd = rd;

  for (int step = 0; step < 24; step++){
    Hit h;
    bool hit = trace(ro, rd, 1e5, chain, h);

    if (!hit){
      if (primarySeg){ primaryMedia(camRo, camRd, pathLen + 1500.0, L, thr); primarySeg = false; }
      if (!chain && portalDone) break;
      vec3 sky = chain ? skyFull(rd) : skyLUT(rd);
      if (bounce > 0) sky *= min(1.0, uIndClamp/max(lum(thr*sky), 1e-9));
      if (chain && dot(rd, uSunDir) > uSunCos){
        float sunOmega = 2.0*PI*(1.0 - uSunCos);
        float cs = 1.0;
        if (uCloud > 0.01) cs = 1.0 - cloudDensity(cloudCoord(rd));
        sky += min(uSunE/sunOmega*cs, vec3(3e4));
      }
      L += thr*sky;
      if (!gSet){ gSet = true; gAlb = vec3(1); gN = -rd; gDist = 1e4; gEmis = L; }
      break;
    }

    vec3 wp = ro + rd*h.t;
    pathLen += h.t;
    Mat m; vec3 gn;
    int mid;
    if (h.id == -2){
      m = groundMat(wp); gn = vec3(0, 1, 0); mid = 19;
    } else {
      vec4 pa = texelFetch(uPrims, pUV(h.id, 0), 0);
      vec4 pb = texelFetch(uPrims, pUV(h.id, 1), 0);
      vec4 pq = texelFetch(uPrims, pUV(h.id, 2), 0);
      vec4 pd = texelFetch(uPrims, pUV(h.id, 3), 0);
      int type = int(pa.w + 0.5) & 7;
      int pflags = (int(pa.w + 0.5) >> 3) & 31;
      mid = int(pb.w + 0.5);
      if ((pflags & 8) != 0){
        // porous foliage volume: march for leaf clumps, pass through otherwise
        vec3 o = qinv(pq, ro - pa.xyz), d = qinv(pq, rd);
        vec2 te = iEll2(o, d, pb.xyz);
        float t0 = max(te.x, 0.0), t1 = te.y;
        float dt = (t1 - t0)/12.0;
        float jit = rnd();
        float tl = -1.0; vec3 nl = vec3(0, 1, 0);
        for (int k = 0; k < 12; k++){
          float tk = t0 + (float(k) + jit)*dt;
          vec3 pk = o + d*tk;
          vec3 u = pk/pb.xyz;
          float dens = vnoise3(pk*2.2 + pa.xyz)*0.65 + vnoise3(pk*7.0 + pa.xyz)*0.35 - dot(u, u)*0.5;
          if (dens > 0.33){ tl = tk; nl = normalize(u*0.8 + (vec3(vnoise3(pk*5.0), vnoise3(pk*5.0 + 2.0), vnoise3(pk*5.0 + 5.0)) - 0.5)*1.6); break; }
        }
        if (tl < 0.0){ ro = ro + rd*(t1 + 1e-3); pathLen += t1 - h.t; continue; }
        pathLen += tl - h.t;
        wp = ro + rd*tl;
        h.ln = nl; h.lp = o + d*tl;
      }
      if (mid == 15 || mid == 17){
        // emissive flame volume: integrate along chord, continue through
        vec3 o = qinv(pq, ro - pa.xyz), d = qinv(pq, rd);
        vec2 te = iEll2(o, d, pb.xyz);
        float t0 = max(te.x, 0.0), t1 = te.y;
        vec3 e = vec3(0);
        for (int k = 0; k < 3; k++){
          float tk = mix(t0, t1, (float(k) + 0.5)/3.0);
          e += flameEmit(o + d*tk, pb.xyz, pd.y, mid == 17);
        }
        float chord = (t1 - t0)/(2.0*max(max(pb.x, pb.y), pb.z));
        L += thr*e/3.0*clamp(chord*2.0, 0.0, 1.5);
        ro = ro + rd*(t1 + 1e-4);
        pathLen += t1 - h.t;
        continue;
      }
      m = getMat(mid, wp, h.lp, h.ln, pb.xyz, pd, pq, type, bounce == 0);
      gn = normalize(qrot(pq, h.ln));
      if (mid == 12){
        float came = glassCame(h.lp, h.ln, pb.xyz, pd.w);
        if (came < 0.5){
          if (dot(gn, rd) > 0.0) gn = -gn;
          float c = abs(dot(gn, rd));
          float F = 0.04 + 0.96*pow(1.0 - c, 5.0);
          F = min(1.0, F*1.9);
          if (rnd() < F){ rd = reflect(rd, gn); ro = wp + gn*1e-3; }
          else {
            // old glass: slight waviness
            vec3 wob = (vec3(vnoise3(wp*9.0), vnoise3(wp*9.0 + 3.0), vnoise3(wp*9.0 + 6.0)) - 0.5)*0.012*(1.0 - pd.w);
            rd = normalize(rd + wob);
            ro = wp + rd*2e-3;
            thr *= vec3(0.9, 0.93, 0.88);
          }
          continue;
        }
      }
    }
    if (primarySeg){ primaryMedia(camRo, camRd, pathLen, L, thr); primarySeg = false; }
    if (dot(gn, rd) > 0.0) gn = -gn;
    if (dot(m.n, gn) < 0.0) m.n = normalize(m.n - gn*dot(m.n, gn)*1.01);
    vec3 v = -rd;
    if (dot(m.n, v) < 0.0) m.n = normalize(m.n + gn*(0.01 - dot(m.n, v)));

    if (chain) L += thr*m.emit;
    if (!gSet){
      gSet = true;
      gAlb = thr*m.alb;
      gAlb = max(gAlb, vec3(0.004));
      gN = gn; gDist = pathLen; gEmis = L;
    }
    if (bounce >= uMaxBounce) break;

    bool deltaLike = m.rough < 0.1 && (m.metal > 0.5 || mid == 33);
    portalDone = !deltaLike && roomId(wp) != 0 && uNumPortals > 0;
    if (!deltaLike){
      vec3 c = thr*direct(wp, gn, m, v);
      if (bounce > 0) c *= min(1.0, uIndClamp/max(lum(c), 1e-9));
      L += c;
    }

    vec3 w; bool spec;
    vec3 nd = sampleBRDF(m, m.n, v, w, spec);
    if (dot(nd, gn) <= 0.0 || lum(w) <= 0.0) break;
    thr *= w;
    chain = chain && spec && m.rough < 0.1;
    ro = wp + gn*2e-3;
    rd = nd;
    bounce++;
    if (bounce > 2){
      float pr = clamp(max(thr.x, max(thr.y, thr.z)), 0.05, 0.95);
      if (rnd() > pr) break;
      thr /= pr;
    }
  }
  L = min(L, vec3(6e4));
  if (any(isnan(L)) || any(isinf(L))) L = vec3(0);
  if (!gSet){ gEmis = L; }
  if (any(isnan(gAlb)) || any(isnan(gN)) || any(isnan(gEmis)) || dot(gN, gN) < 1e-8){ gAlb = vec3(1); gN = -camRd; gEmis = L; }
  vec4 prev0 = texelFetch(uPrev0, pix, 0), prev1 = texelFetch(uPrev1, pix, 0), prev2 = texelFetch(uPrev2, pix, 0), prev3 = texelFetch(uPrev3, pix, 0);
  if (uDebug == 1){ L = gAlb*0.18; gEmis = L; }
  float il = lum(max(L - gEmis, 0.0)/max(gAlb, vec3(0.004)));
  o0 = vec4(mix(prev0.rgb, L, uBlend), mix(prev0.a, il*il, uBlend));
  o1 = vec4(mix(prev1.rgb, gAlb, uBlend), 1.0);
  o2 = mix(prev2, vec4(gN, min(gDist, 1e4)), uBlend);
  o3 = vec4(mix(prev3.rgb, min(gEmis, L), uBlend), mix(prev3.a, il, uBlend));
}`;

// ---------------------------------------------------------------- denoiser (edge-aware a-trous on demodulated illumination)
SH.denoise = `#version 300 es
precision highp float;
uniform sampler2D uIn;      // illumination (or radiance on first pass)
uniform sampler2D uAlb, uND, uEm, uMom;
uniform int uStep;
uniform int uFirst;
uniform float uSigL;        // user strength
uniform float uSpp;
uniform float uPass;
uniform float uLumRef;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform float uTanHalf;
uniform vec2 uRes;
out vec4 o;
float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 illum(ivec2 p){
  if (uFirst == 1){
    vec3 r = texelFetch(uIn, p, 0).rgb, a = texelFetch(uAlb, p, 0).rgb, e = texelFetch(uEm, p, 0).rgb;
    vec3 il = min(max(r - e, 0.0)/max(a, vec3(0.004)), vec3(1e5));
    return (any(isnan(il)) || any(isinf(il))) ? vec3(0) : il;
  }
  return texelFetch(uIn, p, 0).rgb;
}
float varAt(ivec2 p){
  float m1 = texelFetch(uEm, p, 0).a, m2 = texelFetch(uMom, p, 0).a;
  return max(m2 - m1*m1, 0.0)/uSpp;
}
vec3 wpos(ivec2 p, float dist){
  vec2 ndc = (vec2(p) + 0.5)/uRes*2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + ndc.x*(uRes.x/uRes.y)*uTanHalf*uCamRight + ndc.y*uTanHalf*uCamUp);
  return uCamPos + rd*dist;
}
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = ivec2(uRes);
  vec4 nd = texelFetch(uND, p, 0);
  vec3 c0 = illum(p);
  if (uFirst == 1){
    // outlier (firefly / dead pixel) rejection against the 3x3 neighbourhood
    float mx = 0.0, mn = 1e20;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      if (i == 0 && j == 0) continue;
      ivec2 q = clamp(p + ivec2(i, j), ivec2(0), sz - 1);
      if (texelFetch(uND, q, 0).w > 9000.0) continue;
      float lq = lum(illum(q)); mx = max(mx, lq); mn = min(mn, lq);
    }
    float l = lum(c0);
    if (nd.w < 9000.0 && uSigL > 0.0){
      float hi = 2.5*mx + 1e-6, lo = 0.3*min(mn, 1e19);
      if (l > hi) c0 *= hi/l;
      else if (l < lo) c0 = l > 1e-9 ? c0*(lo/l) : vec3(lo);
    }
    o = vec4(c0, 1.0); return;
  }
  if (nd.w > 9000.0 || uSigL <= 0.0){ o = vec4(c0, 1.0); return; }
  vec3 n0 = nd.xyz/max(length(nd.xyz), 1e-6);
  vec3 p0 = wpos(p, nd.w);
  float l0 = lum(c0);
  // 3x3 prefiltered variance of the mean
  float v = 0.0, lm = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    ivec2 q = clamp(p + ivec2(i, j), ivec2(0), sz - 1);
    float w = (i == 0 && j == 0) ? 0.25 : (i == 0 || j == 0 ? 0.125 : 0.0625);
    v += varAt(q)*w;
    lm += lum(illum(q))*w;
  }
  float sig = uSigL*(4.0*sqrt(v) + 2.0*lm/sqrt(uSpp) + 1.5*uLumRef/sqrt(uSpp))*pow(0.65, uPass) + 1e-6;
  const float k[3] = float[3](0.375, 0.25, 0.0625);
  vec3 sum = vec3(0); float ws = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++){
    ivec2 q = p + ivec2(i, j)*uStep;
    if (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) continue;
    vec4 ndq = texelFetch(uND, q, 0);
    if (ndq.w > 9000.0) continue;
    vec3 cq = illum(q);
    float wn = pow(max(dot(n0, ndq.xyz/max(length(ndq.xyz), 1e-6)), 0.0), 32.0);
    vec3 pq = wpos(q, ndq.w);
    float wp = exp(-abs(dot(n0, pq - p0))/(0.004 + 0.01*nd.w));
    float wl = exp(-abs(l0 - lum(cq))/sig);
    float w = k[abs(i)]*k[abs(j)]*wn*wp*wl;
    sum += cq*w; ws += w;
  }
  o = vec4(sum/max(ws, 1e-9), 1.0);
}`;

// ---------------------------------------------------------------- composite (to HDR + log-luminance for exposure)
SH.composite = `#version 300 es
precision highp float;
uniform sampler2D uIllum, uAlb, uEm, uRad;
uniform int uRaw;
out vec4 o;
float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 c;
  if (uRaw == 1) c = texelFetch(uRad, p, 0).rgb;
  else c = texelFetch(uIllum, p, 0).rgb*texelFetch(uAlb, p, 0).rgb + texelFetch(uEm, p, 0).rgb;
  c = min(c, vec3(6e4));
  if (any(isnan(c)) || any(isinf(c)) || !(lum(c) >= 0.0)) c = vec3(0);
  c = max(c, vec3(0));
  o = vec4(c, log(max(lum(c), 1e-5)));
}`;

// ---------------------------------------------------------------- final tonemap
SH.final = `#version 300 es
precision highp float;
uniform sampler2D uHDR;
uniform float uExposure;
uniform float uBloom;
uniform vec2 uOut;
uniform float uLevels;
uniform float uGrain;
uniform int uFrame;
uniform float uLocal;
out vec4 o;
vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v + 0.0245786) - 0.000090537; vec3 b = v*(0.983729*v + 0.4329510) + 0.238081; return a/b; }
vec3 aces(vec3 c){
  const mat3 I = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 O = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = I*c; c = RRTAndODTFit(c); c = O*c; return clamp(c, 0.0, 1.0);
}
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
void main(){
  vec2 uv = gl_FragCoord.xy/uOut;
  vec3 c = texture(uHDR, uv).rgb;
  vec3 b = vec3(0);
  float wsum = 0.0;
  for (int i = 2; i < 8; i++){
    float lv = float(i); if (lv > uLevels) break;
    float w = 1.0/float(i);
    b += textureLod(uHDR, uv, lv).rgb*w; wsum += w;
  }
  b /= max(wsum, 1e-4);
  c = mix(c, b, uBloom);
  // local tone mapping (exposure-fusion style): pull bright regions such as windows down, lift deep shadows slightly
  float la = textureLod(uHDR, uv, max(uLevels - 4.0, 1.0)).a, lb = textureLod(uHDR, uv, max(uLevels - 2.5, 1.0)).a;
  float lg = textureLod(uHDR, uv, uLevels).a;
  float dl = 0.5*(la + lb) - lg;
  c *= exp(-uLocal*(0.42*max(dl, 0.0) + 0.12*min(dl, 0.0)));
  c *= uExposure;
  c = aces(c*1.1);
  // subtle vignette
  vec2 d = uv - 0.5;
  c *= 1.0 - 0.28*dot(d, d)*1.6;
  c = pow(c, vec3(1.0/2.2));
  float g = h12(gl_FragCoord.xy + float(uFrame % 64)*13.1) - 0.5;
  c += g*(uGrain + 1.0/255.0);
  o = vec4(c, 1.0);
}`;
