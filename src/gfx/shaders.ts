/*
 * Two passes, identical in both shading languages:
 *
 *  1. scatter  (low res) — for every pixel, march towards each emitter through
 *     the blurred glyph mask. Beer–Lambert transmittance gives a soft shadow
 *     behind each letter; integrating the emitter's falloff along the same
 *     ray, attenuated by what's been crossed so far, gives faint shafts.
 *  2. composite (full res) — upsample, tone-map gently, fade the edges out
 *     and dither. The letters themselves are real DOM text on top.
 */

export const WGSL = /* wgsl */ `
struct Light {
  pos: vec2f,
  radius: f32,
  strength: f32,
  color: vec3f,
  _pad: f32,
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

// #0a0a0b, the page background.
const PAGE_BG = vec3f(0.039, 0.039, 0.043);

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var mask: texture_2d<f32>;
@group(0) @binding(3) var scatterTex: texture_2d<f32>;

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
  // A fixed per-pixel start offset hides step banding without shimmering.
  let jitter = hash12(fc.xy);
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
      let occ = textureSampleLevel(mask, linearSampler, p, 0.0).r;
      transmit *= exp(-occ * 70.0 * stepLen);
      let q = (p - L.pos) * asp;
      shafts += transmit * r2 / (dot(q, q) * 6.0 + r2);
      p += stepUv;
    }

    let d = toLight * asp;
    let pool0 = r2 / (dot(d, d) + r2);
    col += L.color * L.strength * (pool0 * pool0 * transmit + shafts * stepLen * u.gain);
  }

  return vec4f(col, 1.0);
}

@fragment
fn fsComposite(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / u.res;
  let hdr = textureSampleLevel(scatterTex, linearSampler, uv, 0.0).rgb;

  // Soft shoulder: keeps overlapping pools pastel instead of blowing to white.
  var col = 1.0 - exp(-hdr * u.exposure);
  let v = uv - vec2f(0.5, 0.45);
  col *= 1.0 - smoothstep(0.2, 0.95, length(v * vec2f(1.0, 1.3)));
  col *= 1.0 - smoothstep(0.55, 1.0, uv.y);
  col = pow(col, vec3f(1.0 / 2.2));
  // Lift onto the page background so the hero's edges meet it seamlessly.
  col = PAGE_BG + (1.0 - PAGE_BG) * col;
  col += (hash12(fc.xy) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
`;

const GLSL_COMMON = /* glsl */ `#version 300 es
precision highp float;

// uHead: [res.xy, sres.xy] [time, count, samples, exposure] [aspect, gain, -, -]
uniform vec4 uHead[3];
// uLights[2i]: pos.xy, radius, strength   uLights[2i+1]: rgb, -
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
uniform sampler2D uMask;

void main() {
  vec2 sres = uHead[0].zw;
  int count = int(uHead[1].y);
  int n = int(uHead[1].z);
  float aspect = uHead[2].x;
  float gain = uHead[2].y;

  // Flip to a top-left origin so UVs match the DOM and the mask canvas.
  vec2 fc = vec2(gl_FragCoord.x, sres.y - gl_FragCoord.y);
  vec2 uv = fc / sres;
  vec2 asp = vec2(aspect, 1.0);
  float invN = 1.0 / float(n);
  float jitter = hash12(fc);
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
      float occ = textureLod(uMask, p, 0.0).r;
      transmit *= exp(-occ * 70.0 * stepLen);
      vec2 q = (p - a.xy) * asp;
      shafts += transmit * r2 / (dot(q, q) * 6.0 + r2);
      p += stepUv;
    }

    vec2 d = toLight * asp;
    float pool0 = r2 / (dot(d, d) + r2);
    col += b.rgb * a.w * (pool0 * pool0 * transmit + shafts * stepLen * gain);
  }

  outColor = vec4(col, 1.0);
}
`;

export const GLSL_COMPOSITE =
  GLSL_COMMON +
  /* glsl */ `
// #0a0a0b, the page background.
const vec3 PAGE_BG = vec3(0.039, 0.039, 0.043);

uniform sampler2D uScatter;
uniform float uScatterScale;

void main() {
  vec2 res = uHead[0].xy;
  float exposure = uHead[1].w;

  vec2 fc = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 uv = fc / res;
  // The scatter framebuffer keeps GL's bottom-left origin.
  vec3 hdr = textureLod(uScatter, vec2(uv.x, 1.0 - uv.y), 0.0).rgb * uScatterScale;

  vec3 col = 1.0 - exp(-hdr * exposure);
  vec2 v = uv - vec2(0.5, 0.45);
  col *= 1.0 - smoothstep(0.2, 0.95, length(v * vec2(1.0, 1.3)));
  col *= 1.0 - smoothstep(0.55, 1.0, uv.y);
  col = pow(col, vec3(1.0 / 2.2));
  // Lift onto the page background so the hero's edges meet it seamlessly.
  col = PAGE_BG + (1.0 - PAGE_BG) * col;
  col += (hash12(fc) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}
`;
