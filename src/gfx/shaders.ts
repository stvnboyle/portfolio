/*
 * Wave field.
 *
 *  simulate (compute, WebGPU only) — one explicit step of the 2D wave
 *    equation, ∂²h/∂t² = c²∇²h, on the grid with light damping. Two height
 *    buffers ping-pong: the older one is overwritten with the next state.
 *    The WebGL2 path runs the same step on the CPU (see sim.ts).
 *  render — every grid node is an instanced camera-facing disc, lifted by
 *    the simulated height plus a slow analytic swell so the surface is never
 *    still. Brightness follows the crests; distance fades it to nothing.
 */

export const WGSL_SIMULATE = /* wgsl */ `
struct Sim {
  gx: u32,
  gz: u32,
  dropCount: u32,
  damping: f32,
  c2: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
  // x, z, radius, amplitude
  drops: array<vec4f, 4>,
}

@group(0) @binding(0) var<uniform> sim: Sim;
@group(0) @binding(1) var<storage, read> current: array<f32>;
@group(0) @binding(2) var<storage, read_write> previous: array<f32>;

@compute @workgroup_size(16, 16)
fn step(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= sim.gx || id.y >= sim.gz) { return; }

  let x = id.x;
  let z = id.y;
  let i = z * sim.gx + x;
  // Clamped neighbours make the edges reflect.
  let l = z * sim.gx + max(x, 1u) - 1u;
  let r = z * sim.gx + min(x + 1u, sim.gx - 1u);
  let d = (max(z, 1u) - 1u) * sim.gx + x;
  let u = min(z + 1u, sim.gz - 1u) * sim.gx + x;

  let lap = current[l] + current[r] + current[d] + current[u] - 4.0 * current[i];
  var next = (2.0 * current[i] - previous[i] + sim.c2 * lap) * sim.damping;

  for (var k = 0u; k < sim.dropCount; k++) {
    let drop = sim.drops[k];
    let dx = f32(x) - drop.x;
    let dz = f32(z) - drop.y;
    next += drop.w * exp(-(dx * dx + dz * dz) / (drop.z * drop.z));
  }

  previous[i] = next;
}
`;

export const WGSL_RENDER = /* wgsl */ `
struct View {
  viewProj: mat4x4f,
  // p00, p11, point size, time
  a: vec4f,
  // grid x, grid z, width, depth
  b: vec4f,
  // near z, height scale, aspect, -
  c: vec4f,
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> heights: array<f32>;

struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) corner: vec2f,
  @location(1) crest: f32,
  @location(2) fade: f32,
}

fn swell(x: f32, z: f32, t: f32) -> f32 {
  return sin(x * 0.42 + t * 0.55) * 0.16
    + sin(z * 0.63 - t * 0.4 + x * 0.18) * 0.12
    + sin((x - z) * 1.25 + t * 0.8) * 0.035;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0)
  );

  let gx = u32(view.b.x);
  let fx = f32(ii % gx) / (view.b.x - 1.0);
  let fz = f32(ii / gx) / (view.b.y - 1.0);
  let x = (fx - 0.5) * view.b.z;
  let z = view.c.x - fz * view.b.w;

  let simulated = heights[ii] * view.c.y;
  let h = simulated + swell(x, z, view.a.w);

  var clip = view.viewProj * vec4f(x, h, z, 1.0);
  let corner = corners[vi];
  // Offsetting before the perspective divide keeps the discs world-sized.
  clip.x += corner.x * view.a.z * view.a.x;
  clip.y += corner.y * view.a.z * view.a.y;

  var out: Varyings;
  out.position = clip;
  out.corner = corner;
  out.crest = clamp(simulated * 2.4 + h * 0.9, -1.0, 1.0);
  // Fade in off the near edge, out towards the horizon and the sides.
  out.fade = smoothstep(0.0, 0.06, fz) * (1.0 - smoothstep(0.35, 0.95, fz))
    * (1.0 - smoothstep(0.32, 0.5, abs(fx - 0.5)));
  return out;
}

@fragment
fn fs(in: Varyings) -> @location(0) vec4f {
  let d = length(in.corner);
  if (d > 1.0) { discard; }
  let disc = smoothstep(1.0, 0.35, d);

  let lift = max(in.crest, 0.0);
  let base = vec3f(0.55, 0.57, 0.62);
  let accent = vec3f(0.55, 0.72, 1.0);
  let color = mix(base, accent, lift) * (0.28 + 0.9 * lift);
  let alpha = disc * in.fade * (0.45 + 0.55 * lift);
  return vec4f(color * alpha, alpha);
}
`;

export const GLSL_VERTEX = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;

// uView[0]: p00, p11, point size, time
// uView[1]: grid x, grid z, width, depth
// uView[2]: near z, height scale, aspect, -
uniform mat4 uViewProj;
uniform vec4 uView[3];
uniform sampler2D uHeights;

out vec2 vCorner;
out float vCrest;
out float vFade;

float swell(float x, float z, float t) {
  return sin(x * 0.42 + t * 0.55) * 0.16
    + sin(z * 0.63 - t * 0.4 + x * 0.18) * 0.12
    + sin((x - z) * 1.25 + t * 0.8) * 0.035;
}

const vec2 CORNERS[6] = vec2[6](
  vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
  vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0)
);

void main() {
  int gx = int(uView[1].x);
  int ix = gl_InstanceID % gx;
  int iz = gl_InstanceID / gx;
  float fx = float(ix) / (uView[1].x - 1.0);
  float fz = float(iz) / (uView[1].y - 1.0);
  float x = (fx - 0.5) * uView[1].z;
  float z = uView[2].x - fz * uView[1].w;

  float simulated = texelFetch(uHeights, ivec2(ix, iz), 0).r * uView[2].y;
  float h = simulated + swell(x, z, uView[0].w);

  vec4 clip = uViewProj * vec4(x, h, z, 1.0);
  vec2 corner = CORNERS[gl_VertexID];
  clip.x += corner.x * uView[0].z * uView[0].x;
  clip.y += corner.y * uView[0].z * uView[0].y;

  gl_Position = clip;
  vCorner = corner;
  vCrest = clamp(simulated * 2.4 + h * 0.9, -1.0, 1.0);
  vFade = smoothstep(0.0, 0.06, fz) * (1.0 - smoothstep(0.35, 0.95, fz))
    * (1.0 - smoothstep(0.32, 0.5, abs(fx - 0.5)));
}
`;

export const GLSL_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 vCorner;
in float vCrest;
in float vFade;
out vec4 outColor;

void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  float disc = smoothstep(1.0, 0.35, d);

  float lift = max(vCrest, 0.0);
  vec3 base = vec3(0.55, 0.57, 0.62);
  vec3 accent = vec3(0.55, 0.72, 1.0);
  vec3 color = mix(base, accent, lift) * (0.28 + 0.9 * lift);
  float alpha = disc * vFade * (0.45 + 0.55 * lift);
  outColor = vec4(color * alpha, alpha);
}
`;
