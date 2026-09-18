// The keys as bars standing on a baseline, snapped to device pixels so every
// edge is crisp, plus a faint reflection below. Keys flash the colour of the
// pass that moved them, then settle back to grey.

struct Bars {
  // width, height (device px), key count, time
  frame: vec4f,
  // left, right, baseline, max height (device px)
  area: vec4f,
  // pointer x (device px), hover strength, -, -
  pointer: vec4f,
  palette: array<vec4f, 6>,
}

@group(0) @binding(0) var<uniform> bars: Bars;
@group(0) @binding(1) var<storage, read> keys: array<vec4f>;

struct Varyings {
  @builtin(position) position: vec4f,
  // 0 at the top of the bar, 1 at the baseline.
  @location(0) v: f32,
  @location(1) color: vec3f,
  @location(2) alpha: f32,
}

fn cornerOf(vi: u32) -> vec2f {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0)
  );
  return corners[vi];
}

fn toClip(px: vec2f) -> vec4f {
  let ndc = px / bars.frame.xy * 2.0 - 1.0;
  return vec4f(ndc.x, -ndc.y, 0.0, 1.0);
}

struct Bar {
  x0: f32,
  x1: f32,
  height: f32,
  color: vec3f,
  glow: f32,
}

fn bar(ii: u32) -> Bar {
  let key = keys[ii];
  let pitch = (bars.area.y - bars.area.x) / bars.frame.z;
  let x0 = round(bars.area.x + f32(ii) * pitch);
  let x1 = round(bars.area.x + f32(ii + 1u) * pitch) - max(1.0, round(pitch * 0.22));

  let flash = key.z;
  let hover = bars.pointer.y * exp(-pow((0.5 * (x0 + x1) - bars.pointer.x) / (pitch * 6.0), 2.0));
  let grey = vec3f(0.3, 0.32, 0.38) + vec3f(0.22) * hover;

  var b: Bar;
  b.x0 = x0;
  b.x1 = max(x1, x0 + 1.0);
  b.height = max(round(key.y * bars.area.w), 1.0);
  b.color = mix(grey, bars.palette[u32(key.w) % 6u].rgb * 1.2, smoothstep(0.05, 0.9, flash));
  b.glow = flash;
  return b;
}

@vertex
fn vs_bars(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let b = bar(ii);
  let c = cornerOf(vi);
  let top = bars.area.z - b.height;

  var out: Varyings;
  out.position = toClip(vec2f(mix(b.x0, b.x1, c.x), mix(top, bars.area.z, c.y)));
  out.v = c.y;
  out.color = b.color;
  out.alpha = 0.8 + 0.2 * b.glow;
  return out;
}

@vertex
fn vs_reflect(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let b = bar(ii);
  let c = cornerOf(vi);
  let depth = b.height * 0.3;

  var out: Varyings;
  // A gap of one bar-width's worth of pixels, then the mirror image.
  out.position = toClip(vec2f(mix(b.x0, b.x1, c.x), bars.area.z + 3.0 + depth * c.y));
  out.v = c.y;
  out.color = b.color;
  out.alpha = 0.16 + 0.1 * b.glow;
  return out;
}

@fragment
fn fs_bars(in: Varyings) -> @location(0) vec4f {
  // Lit from the top: a touch brighter at the cap, settling towards the base.
  let shade = mix(1.15, 0.7, in.v);
  let a = in.alpha;
  return vec4f(in.color * shade * a, a);
}

@fragment
fn fs_reflect(in: Varyings) -> @location(0) vec4f {
  let a = in.alpha * (1.0 - in.v) * (1.0 - in.v);
  return vec4f(in.color * a, a);
}
