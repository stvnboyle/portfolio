/*
 * Two passes, identical in both shading languages:
 *
 *  1. scatter  (low res) — for every pixel, march towards each emitter through
 *     the soft glyph mask. Beer–Lambert transmittance gives the hard shadow
 *     wedge behind each letter; integrating the emitter's falloff along the
 *     same ray, attenuated by what's been crossed so far, gives the
 *     volumetric shafts.
 *  2. composite (full res) — upsample the scatter, cut the letterforms out of
 *     it with the crisp mask, rim-light their edges from each emitter's
 *     direction, add the optics (core, anamorphic streak, hexagonal aperture
 *     ghosts), then tone-map.
 */

export const WGSL = /* wgsl */ `
struct Light {
  pos: vec2f,
  radius: f32,
  strength: f32,
  color: vec3f,
  occ: f32,
}

struct Uniforms {
  res: vec2f,
  sres: vec2f,
  time: f32,
  count: f32,
  samples: f32,
  exposure: f32,
  aspect: f32,
  gain: f32,
  _pad0: f32,
  _pad1: f32,
  lights: array<Light, 6>,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var softMask: texture_2d<f32>;
@group(0) @binding(3) var fullMask: texture_2d<f32>;
@group(0) @binding(4) var scatterTex: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn fsScatter(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / u.sres;
  let asp = vec2f(u.aspect, 1.0);
  let n = i32(u.samples);
  let invN = 1.0 / u.samples;
  // A per-pixel start offset turns step banding into fine grain.
  let jitter = hash12(fc.xy + vec2f(fract(u.time * 0.61) * 173.0, fract(u.time * 0.37) * 211.0));
  var col = vec3f(0.0);

  for (var i = 0; i < i32(u.count); i++) {
    let L = u.lights[i];
    let toLight = L.pos - uv;
    let stepUv = toLight * invN;
    let stepLen = length(stepUv * asp);
    let r2 = L.radius * L.radius;

    var p = uv + stepUv * jitter;
    var transmit = 1.0;
    var shafts = 0.0;
    for (var k = 0; k < n; k++) {
      let occ = textureSampleLevel(softMask, linearSampler, p, 0.0).r;
      transmit *= exp(-occ * 260.0 * stepLen);
      let q = (p - L.pos) * asp;
      shafts += transmit * r2 / (dot(q, q) * 14.0 + r2);
      p += stepUv;
    }

    let d = toLight * asp;
    let pool0 = r2 / (dot(d, d) + r2);
    let pool = pool0 * pool0;
    col += L.color * L.strength * (pool * transmit + shafts * stepLen * u.gain);
  }

  return vec4f(col, 1.0);
}

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

fn sdHexagon(p: vec2f, r: f32) -> f32 {
  let k = vec3f(-0.866025404, 0.5, 0.577350269);
  var q = abs(p);
  q -= 2.0 * min(dot(k.xy, q), 0.0) * k.xy;
  q -= vec2f(clamp(q.x, -k.z * r, k.z * r), r);
  return length(q) * sign(q.y);
}

fn ghost(p: vec2f, r: f32) -> f32 {
  let h = sdHexagon(p, r);
  return smoothstep(0.003, -0.003, h) * 0.008 + smoothstep(0.002, 0.0, abs(h)) * 0.018;
}

fn maskAt(uv: vec2f) -> f32 {
  return textureSampleLevel(fullMask, linearSampler, uv, 0.0).r;
}

@fragment
fn fsComposite(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / u.res;
  let asp = vec2f(u.aspect, 1.0);
  var hdr = textureSampleLevel(scatterTex, linearSampler, uv, 0.0).rgb;

  let px = vec2f(1.5) / u.res;
  let m = maskAt(uv);
  let g = vec2f(
    maskAt(uv + vec2f(px.x, 0.0)) - maskAt(uv - vec2f(px.x, 0.0)),
    maskAt(uv + vec2f(0.0, px.y)) - maskAt(uv - vec2f(0.0, px.y))
  );
  let gl = length(g);
  let outward = -g / max(gl, 1e-4);
  let edge = clamp(gl * 1.1, 0.0, 1.0);

  // Letterforms: near-black, holding only a trace of the light around them.
  hdr = mix(hdr, hdr * 0.035 + vec3f(0.004), m);

  let centre = vec2f(0.5, 0.5);
  for (var i = 0; i < i32(u.count); i++) {
    let L = u.lights[i];
    let tint = L.color * L.strength;
    let q = (uv - L.pos) * asp;
    let d = length(q);
    let toLight = -q / max(d, 1e-4);
    let vis = 1.0 - L.occ;

    // Rim light on whichever edge faces the emitter.
    let facing = max(dot(outward, toLight), 0.0);
    hdr += tint * edge * facing * facing * (L.radius / (d + L.radius)) * 2.4;

    // Core and anamorphic streak — hidden when a letter eclipses the source.
    let core = exp(-d * d / 0.00007) * 3.0 + exp(-d * 30.0) * 0.3;
    let streak = exp(-abs(q.y) * 700.0) * exp(-abs(q.x) * 5.0) * 0.35;
    hdr += (tint * 0.55 + vec3f(0.45 * L.strength)) * core * vis + tint * streak * vis;

    // Aperture ghosts reflected through the optical centre, with a little
    // chromatic spread between channels.
    let axis = centre - L.pos;
    for (var j = 0; j < 3; j++) {
      let fj = f32(j);
      let gq = (uv - (centre + axis * (0.35 + fj * 0.55))) * asp;
      let r = 0.022 + fj * 0.026;
      let body = vec3f(ghost(gq, r), ghost(gq, r * 1.04), ghost(gq, r * 1.08));
      hdr += tint * body * vis;
    }
  }

  var col = aces(hdr * u.exposure);
  let v = uv - 0.5;
  col *= 1.0 - dot(v, v) * 1.1;
  col *= 1.0 - smoothstep(0.62, 1.0, uv.y);
  col = pow(col, vec3f(1.0 / 2.2));
  col += (hash12(fc.xy + fract(u.time) * 419.0) - 0.5) * 0.02;
  return vec4f(col, 1.0);
}
`;

const GLSL_COMMON = /* glsl */ `#version 300 es
precision highp float;

// uHead: [res.xy, sres.xy] [time, count, samples, exposure] [aspect, gain, -, -]
uniform vec4 uHead[3];
// uLights[2i]: pos.xy, radius, strength   uLights[2i+1]: rgb, occlusion
uniform vec4 uLights[12];

out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

export const GLSL_VERTEX = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const GLSL_SCATTER =
  GLSL_COMMON +
  /* glsl */ `
uniform sampler2D uSoftMask;

void main() {
  vec2 sres = uHead[0].zw;
  float time = uHead[1].x;
  int count = int(uHead[1].y);
  int n = int(uHead[1].z);
  float aspect = uHead[2].x;
  float gain = uHead[2].y;

  // Flip to a top-left origin so UVs match the DOM and the mask canvases.
  vec2 fc = vec2(gl_FragCoord.x, sres.y - gl_FragCoord.y);
  vec2 uv = fc / sres;
  vec2 asp = vec2(aspect, 1.0);
  float invN = 1.0 / float(n);
  float jitter = hash12(fc + vec2(fract(time * 0.61) * 173.0, fract(time * 0.37) * 211.0));
  vec3 col = vec3(0.0);

  for (int i = 0; i < count; i++) {
    vec4 a = uLights[i * 2];
    vec4 b = uLights[i * 2 + 1];
    vec2 toLight = a.xy - uv;
    vec2 stepUv = toLight * invN;
    float stepLen = length(stepUv * asp);
    float r2 = a.z * a.z;

    vec2 p = uv + stepUv * jitter;
    float transmit = 1.0;
    float shafts = 0.0;
    for (int k = 0; k < n; k++) {
      float occ = textureLod(uSoftMask, p, 0.0).r;
      transmit *= exp(-occ * 260.0 * stepLen);
      vec2 q = (p - a.xy) * asp;
      shafts += transmit * r2 / (dot(q, q) * 14.0 + r2);
      p += stepUv;
    }

    vec2 d = toLight * asp;
    float pool0 = r2 / (dot(d, d) + r2);
    float pool = pool0 * pool0;
    col += b.rgb * a.w * (pool * transmit + shafts * stepLen * gain);
  }

  outColor = vec4(col, 1.0);
}
`;

export const GLSL_COMPOSITE =
  GLSL_COMMON +
  /* glsl */ `
uniform sampler2D uFullMask;
uniform sampler2D uScatter;
uniform float uScatterScale;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

float sdHexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

float ghost(vec2 p, float r) {
  float h = sdHexagon(p, r);
  return smoothstep(0.003, -0.003, h) * 0.008 + smoothstep(0.002, 0.0, abs(h)) * 0.018;
}

float maskAt(vec2 uv) {
  return textureLod(uFullMask, uv, 0.0).r;
}

void main() {
  vec2 res = uHead[0].xy;
  float time = uHead[1].x;
  int count = int(uHead[1].y);
  float exposure = uHead[1].w;
  float aspect = uHead[2].x;

  vec2 fc = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 uv = fc / res;
  vec2 asp = vec2(aspect, 1.0);
  // The scatter framebuffer keeps GL's bottom-left origin.
  vec3 hdr = textureLod(uScatter, vec2(uv.x, 1.0 - uv.y), 0.0).rgb * uScatterScale;

  vec2 px = vec2(1.5) / res;
  float m = maskAt(uv);
  vec2 g = vec2(
    maskAt(uv + vec2(px.x, 0.0)) - maskAt(uv - vec2(px.x, 0.0)),
    maskAt(uv + vec2(0.0, px.y)) - maskAt(uv - vec2(0.0, px.y))
  );
  float gl = length(g);
  vec2 outward = -g / max(gl, 1e-4);
  float edge = clamp(gl * 1.1, 0.0, 1.0);

  hdr = mix(hdr, hdr * 0.035 + vec3(0.004), m);

  vec2 centre = vec2(0.5);
  for (int i = 0; i < count; i++) {
    vec4 a = uLights[i * 2];
    vec4 b = uLights[i * 2 + 1];
    vec3 tint = b.rgb * a.w;
    vec2 q = (uv - a.xy) * asp;
    float d = length(q);
    vec2 toLight = -q / max(d, 1e-4);
    float vis = 1.0 - b.a;

    float facing = max(dot(outward, toLight), 0.0);
    hdr += tint * edge * facing * facing * (a.z / (d + a.z)) * 2.4;

    float core = exp(-d * d / 0.00007) * 3.0 + exp(-d * 30.0) * 0.3;
    float streak = exp(-abs(q.y) * 700.0) * exp(-abs(q.x) * 5.0) * 0.35;
    hdr += (tint * 0.55 + vec3(0.45 * a.w)) * core * vis + tint * streak * vis;

    vec2 axis = centre - a.xy;
    for (int j = 0; j < 3; j++) {
      float fj = float(j);
      vec2 gq = (uv - (centre + axis * (0.35 + fj * 0.55))) * asp;
      float r = 0.022 + fj * 0.026;
      vec3 body = vec3(ghost(gq, r), ghost(gq, r * 1.04), ghost(gq, r * 1.08));
      hdr += tint * body * vis;
    }
  }

  vec3 col = aces(hdr * exposure);
  vec2 v = uv - 0.5;
  col *= 1.0 - dot(v, v) * 1.1;
  col *= 1.0 - smoothstep(0.62, 1.0, uv.y);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash12(fc + fract(time) * 419.0) - 0.5) * 0.02;
  outColor = vec4(col, 1.0);
}
`;
