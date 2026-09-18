// Agents as small chevrons pointing where they're heading, and tasks as rings
// with a progress arc that fills while agents work on them. Shapes are signed
// distance fields in local pixel space, antialiased to one pixel.

struct View {
  // width, height (CSS px), chevron length (px), time
  frame: vec4f,
}

// x, y (px), working radius (px), strength (0..1)
struct Tasks {
  at: array<vec4f, 8>,
  tint: array<vec4f, 8>,
  // progress (0..1), completion burst (0..1), -, -
  progress: array<vec4f, 8>,
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> agents: array<vec4f>;
@group(0) @binding(2) var<uniform> tasks: Tasks;

struct Varyings {
  @builtin(position) position: vec4f,
  // Local position in pixels.
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) alpha: f32,
  @location(3) @interpolate(flat) index: u32,
}

fn cornerOf(vi: u32) -> vec2f {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0)
  );
  return corners[vi];
}

fn toClip(px: vec2f) -> vec4f {
  let ndc = px / view.frame.xy * 2.0 - 1.0;
  return vec4f(ndc.x, -ndc.y, 0.0, 1.0);
}

@vertex
fn vs_agents(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let s = agents[2u * ii];
  let tint = agents[2u * ii + 1u];
  let corner = cornerOf(vi);
  let size = view.frame.z;

  // Rotate the quad to the agent's heading.
  let forward = normalize(s.zw + vec2f(1e-4, 0.0));
  let side = vec2f(-forward.y, forward.x);
  let local = corner * (size * 0.5 + 1.5);
  let world = s.xy + forward * local.x + side * local.y;

  var out: Varyings;
  out.position = toClip(world);
  out.local = local;
  out.color = mix(vec3f(0.5, 0.52, 0.6), tint.rgb * 1.2 + vec3f(0.05), smoothstep(0.0, 0.7, tint.w));
  out.alpha = 0.38 + 0.62 * tint.w;
  out.index = ii;
  return out;
}

// Distance to a chevron pointing along +x: two short strokes meeting at the tip.
fn chevron(p: vec2f, size: f32) -> f32 {
  let h = size * 0.5;
  let q = vec2f(p.x, abs(p.y));
  let a = vec2f(h, 0.0);
  let b = vec2f(-h, h * 0.62);
  let ab = b - a;
  let t = clamp(dot(q - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(q - a - ab * t);
}

@fragment
fn fs_agents(in: Varyings) -> @location(0) vec4f {
  let d = chevron(in.local, view.frame.z) - 0.75;
  let a = (1.0 - smoothstep(-0.5, 0.5, d)) * in.alpha;
  if (a <= 0.0) { discard; }
  return vec4f(in.color * a, a);
}

@vertex
fn vs_tasks(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let t = tasks.at[ii];
  let burst = tasks.progress[ii].y;
  let reach = (t.z + 24.0) * (1.0 + burst * 1.5);

  var out: Varyings;
  out.position = toClip(t.xy + cornerOf(vi) * reach);
  out.local = cornerOf(vi) * reach;
  out.color = tasks.tint[ii].rgb;
  out.alpha = max(t.w, burst);
  out.index = ii;
  return out;
}

const TAU: f32 = 6.28318530718;

@fragment
fn fs_tasks(in: Varyings) -> @location(0) vec4f {
  let t = tasks.at[in.index];
  let progress = tasks.progress[in.index].x;
  let burst = tasks.progress[in.index].y;
  let d = length(in.local);
  let r = t.z * 0.5;

  // A dim track, and a bright arc for how much of the task is done.
  let ring = 1.0 - smoothstep(0.6, 1.4, abs(d - r));
  let angle = fract(atan2(in.local.x, -in.local.y) / TAU + 1.0);
  let done = step(angle, progress);
  let core = 1.0 - smoothstep(1.5, 2.5, d);

  // On completion the ring expands and fades out.
  let wave = (1.0 - smoothstep(0.6, 1.8, abs(d - r * (1.0 + burst * 2.5)))) * burst * (1.0 - burst);

  let a = (ring * mix(0.18, 0.95, done) + core * 0.9) * t.w + wave * 3.0;
  return vec4f(in.color * a, a);
}
