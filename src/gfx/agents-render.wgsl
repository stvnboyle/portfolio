// Agents as tiny flying robots — a boxy body with two eyes, an antenna, and a
// flickering thruster underneath — tilting into the direction they fly. Tasks
// are rings with a progress arc that fills while agents work on them, and a
// pulse that starts small and swells outwards when one is done. Shapes are
// signed distance fields in local pixel space, antialiased to one pixel.

struct View {
  // width, height (CSS px), robot height (px), time
  frame: vec4f,
  // The hero copy's box (x0, y0, x1, y1, CSS px): idle agents dim as they cross it.
  copy: vec4f,
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
  // Thruster strength, flickering per agent.
  @location(4) thrust: f32,
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
  let s = agents[3u * ii];
  let tint = agents[3u * ii + 1u];
  let alive = agents[3u * ii + 2u].x;
  let corner = cornerOf(vi);
  let size = view.frame.z;

  // Robots stay upright and bank into their direction of travel.
  let tilt = clamp(s.z * 0.012, -0.5, 0.5);
  let c = cos(tilt);
  let sn = sin(tilt);
  let local = corner * size * 0.8;
  let world = s.xy + vec2f(local.x * c - local.y * sn, local.x * sn + local.y * c);

  var out: Varyings;
  // Empty slots collapse to nothing.
  out.position = select(vec4f(0.0), toClip(world), alive > 0.5);
  out.local = local / (size * 0.1);
  out.color = mix(vec3f(0.55, 0.57, 0.66), tint.rgb * 1.2 + vec3f(0.05), smoothstep(0.0, 0.7, tint.w));
  // Keep the name readable: idle agents fade out over the copy.
  let edge = max(max(view.copy.x - s.x, s.x - view.copy.z), max(view.copy.y - s.y, s.y - view.copy.w));
  let clear = mix(0.3, 1.0, smoothstep(-24.0, 12.0, edge));
  out.alpha = (0.45 + 0.55 * tint.w) * mix(clear, 1.0, tint.w);
  out.index = ii;
  out.thrust = 0.55 + 0.45 * sin(view.frame.w * 22.0 + f32(ii) * 1.7);
  return out;
}

fn roundBox(p: vec2f, half: vec2f, r: f32) -> f32 {
  let q = abs(p) - half + r;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn segment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let ab = b - a;
  let t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * t);
}

// A robot in a 10-unit-tall box, y down: body, eyes cut out, antenna on top.
fn robot(p: vec2f) -> f32 {
  var d = roundBox(p - vec2f(0.0, 0.6), vec2f(3.6, 2.9), 1.3);
  d = min(d, segment(p, vec2f(0.0, -2.2), vec2f(0.0, -4.0)) - 0.45);
  d = min(d, length(p - vec2f(0.0, -4.6)) - 0.95);
  let eyes = min(length(p - vec2f(-1.35, 0.3)), length(p - vec2f(1.35, 0.3))) - 0.8;
  return max(d, -eyes);
}

// The thruster: a short flame under the body.
fn flame(p: vec2f, length_: f32) -> f32 {
  let q = vec2f(abs(p.x), p.y - 3.6);
  let taper = mix(1.3, 0.0, clamp(q.y / length_, 0.0, 1.0));
  return max(q.x - taper, max(-q.y, q.y - length_));
}

@fragment
fn fs_agents(in: Varyings) -> @location(0) vec4f {
  // One local unit is a tenth of the robot's height; antialias over one pixel.
  let px = fwidth(in.local.x);
  let body = 1.0 - smoothstep(-0.5 * px, 0.5 * px, robot(in.local));
  let fire = (1.0 - smoothstep(-0.5 * px, 0.5 * px, flame(in.local, 1.4 + in.thrust * 1.6))) * (1.0 - body);

  let fireColor = mix(vec3f(1.0, 0.62, 0.2), in.color, 0.35);
  let a = body * in.alpha + fire * in.alpha * 0.8 * in.thrust;
  if (a <= 0.0) { discard; }
  let rgb = in.color * body * in.alpha + fireColor * fire * in.alpha * 0.8 * in.thrust;
  return vec4f(rgb, a);
}

@vertex
fn vs_tasks(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let t = tasks.at[ii];
  // Big enough for the completion pulse at its widest.
  let reach = t.z * 5.5 + 12.0;

  var out: Varyings;
  out.position = toClip(t.xy + cornerOf(vi) * reach);
  out.local = cornerOf(vi) * reach;
  out.color = tasks.tint[ii].rgb;
  out.alpha = max(t.w, tasks.progress[ii].y);
  out.index = ii;
  out.thrust = 0.0;
  return out;
}

const TAU: f32 = 6.28318530718;

// A ring of the given radius and width, antialiased.
fn band(d: f32, radius: f32, width: f32) -> f32 {
  return 1.0 - smoothstep(width * 0.5, width * 0.5 + 1.0, abs(d - radius));
}

@fragment
fn fs_tasks(in: Varyings) -> @location(0) vec4f {
  let t = tasks.at[in.index];
  let progress = tasks.progress[in.index].x;
  let burst = tasks.progress[in.index].y;
  let d = length(in.local);
  let r = t.z * 0.5;

  // A dim track, and a bright arc for how much of the task is done.
  let angle = fract(atan2(in.local.x, -in.local.y) / TAU + 1.0);
  let done = step(angle, progress);
  let idle = (band(d, r, 1.2) * mix(0.18, 0.95, done) + (1.0 - smoothstep(1.5, 2.5, d)) * 0.9) * t.w;

  // Done: a flash at the centre, then a pulse that starts small and swells
  // outwards, with a fainter echo just behind it.
  var pulse = 0.0;
  if (burst > 0.0) {
    let e = 1.0 - pow(1.0 - burst, 3.0);
    let fade = (1.0 - burst) * (1.0 - burst);
    pulse += band(d, mix(1.0, t.z * 5.0, e), mix(1.0, 3.0, e)) * fade * 1.4;
    let lag = clamp((burst - 0.15) / 0.85, 0.0, 1.0);
    let e2 = 1.0 - pow(1.0 - lag, 3.0);
    pulse += band(d, mix(1.0, t.z * 3.6, e2), 1.2) * (1.0 - lag) * (1.0 - lag) * 0.6 * step(0.001, lag);
    pulse += (1.0 - smoothstep(0.0, 0.25, burst)) * exp(-d / 6.0) * 1.2;
  }

  let a = idle + pulse;
  return vec4f(in.color * a, min(a, 1.0));
}
