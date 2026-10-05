// Agents as small flying robots that lean hard into their direction of
// travel, with twin thrusters whose exhaust streams out behind them. Tasks are rings with a progress arc
// that fills while agents work on them, and a pulse that starts small and
// swells well out past the crew when one is done.
// Shapes are signed distance fields, antialiased to one pixel.

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
  // progress (0..1), completion burst (0..1), pulse reach (task radii), -
  progress: array<vec4f, 8>,
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> agents: array<vec4f>;
@group(0) @binding(2) var<uniform> tasks: Tasks;

// The name intro's lasers (intro.ts): from under each robot to where it's
// etching (x0, y0, x1, y1, px), and colour + strength.
struct Beams {
  line: array<vec4f, 8>,
  tint: array<vec4f, 8>,
}

@group(0) @binding(3) var<uniform> beams: Beams;

struct Varyings {
  @builtin(position) position: vec4f,
  // Local position: robot units (a tenth of its height) for agents, pixels for tasks.
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) alpha: f32,
  @location(3) @interpolate(flat) index: u32,
  // Thruster flicker (0..1).
  @location(4) thrust: f32,
  // Task colour and how much of it the agent has taken on.
  @location(5) tint: vec4f,
  // Exhaust direction (robot frame) and length (robot units).
  @location(6) exhaust: vec3f,
  // Scanner eye's position across the visor (robot units).
  @location(7) scan: f32,
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

// The robot's box in its own units (a tenth of its height, y down): room for
// the fins either side and for the exhaust streaming out behind the thrusters.
const BOX_HALF_WIDTH: f32 = 8.0;
const BOX_TOP: f32 = -5.2;
const BOX_BOTTOM: f32 = 10.5;

@vertex
fn vs_agents(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let s = agents[3u * ii];
  let tint = agents[3u * ii + 1u];
  let info = agents[3u * ii + 2u];
  let alive = info.x;
  let corner = cornerOf(vi);
  // Robots in the name's formation shrink to a pixel of it (info.w, see agents.wgsl).
  let unit = view.frame.z * 0.1 * select(1.0, info.w, info.z != 0.0);

  // Robots lean hard into their direction of travel, head first.
  let tilt = clamp(s.z * 0.02, -0.9, 0.9);
  let c = cos(tilt);
  let sn = sin(tilt);
  let local = vec2f(corner.x * BOX_HALF_WIDTH, mix(BOX_TOP, BOX_BOTTOM, corner.y * 0.5 + 0.5));
  let world = s.xy + vec2f(local.x * c - local.y * sn, local.x * sn + local.y * c) * unit;

  // Exhaust streams back against the direction of travel (in the robot's own
  // frame), always with some downward thrust, and stretches with speed.
  let speed = length(s.zw);
  let heading = vec2f(s.z * c + s.w * sn, -s.z * sn + s.w * c) / max(speed, 1e-3);
  let burn = clamp(speed / 70.0, 0.0, 1.3);
  let exhaustDir = normalize(vec2f(0.0, 0.7) - heading * burn);

  var out: Varyings;
  // Empty slots collapse to nothing.
  out.position = select(vec4f(0.0), toClip(world), alive > 0.5);
  out.local = local;
  out.color = mix(vec3f(0.6, 0.63, 0.72), tint.rgb * 1.1 + vec3f(0.06), smoothstep(0.0, 0.7, tint.w));
  out.tint = vec4f(tint.rgb, smoothstep(0.0, 0.7, tint.w));
  // Keep the name readable: idle agents fade out over the copy.
  let edge = max(max(view.copy.x - s.x, s.x - view.copy.z), max(view.copy.y - s.y, s.y - view.copy.w));
  let clear = mix(0.3, 1.0, smoothstep(-24.0, 12.0, edge));
  // Handed to the page (life 3, see agents.wgsl): fade out over the last HANDOFF px of the canvas.
  let handed = select(1.0, smoothstep(0.0, 24.0, view.frame.y - s.y), alive > 2.5);
  out.alpha = (0.5 + 0.5 * tint.w) * mix(clear, 1.0, tint.w) * handed;
  out.index = ii;
  out.thrust = 0.85 + 0.15 * sin(view.frame.w * 30.0 + f32(ii) * 1.7);
  out.exhaust = vec3f(exhaustDir, 1.8 + burn * 4.2);
  // The visor's scanner sweeps side to side, quicker while the robot's on a task.
  out.scan = 2.0 * sin(view.frame.w * (1.4 + 2.6 * tint.w) + f32(ii) * 0.37);
  return out;
}

fn roundBox(p: vec2f, half: vec2f, r: f32) -> f32 {
  let q = abs(p) - half + r;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// A capsule from a to b whose radius tapers from ra to rb.
fn taper(p: vec2f, a: vec2f, b: vec2f, ra: f32, rb: f32) -> f32 {
  let ab = b - a;
  let t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * t) - mix(ra, rb, t);
}

fn triangle(p: vec2f, a: vec2f, b: vec2f, c: vec2f) -> f32 {
  let e0 = b - a;
  let e1 = c - b;
  let e2 = a - c;
  let v0 = p - a;
  let v1 = p - b;
  let v2 = p - c;
  let pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  let pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  let pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  let s = sign(e0.x * e2.y - e0.y * e2.x);
  let d = min(min(
    vec2f(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
    vec2f(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
    vec2f(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

// Paints one shape over the colour so far (premultiplied).
fn layer(acc: vec4f, d: f32, px: f32, color: vec3f) -> vec4f {
  let cover = 1.0 - smoothstep(-0.5 * px, 0.5 * px, d);
  return vec4f(mix(acc.rgb, color, cover), acc.a + (1.0 - acc.a) * cover);
}

// The robot, in a 10-unit-tall box with y down: a crisp helmet with a lit rim,
// swept-back fins, a dark visor with an LED strip and a scanner eye that
// sweeps across it, a chin plate, and twin thrusters whose exhaust streams
// out behind it. Mirrored in strays.ts.
@fragment
fn fs_agents(in: Varyings) -> @location(0) vec4f {
  let p = in.local;
  // One screen pixel in robot units, whichever way the robot leans (fwidth
  // overestimates it on a tilt, which softens every edge).
  let px = length(vec2f(dpdx(p.x), dpdy(p.x)));
  let m = vec2f(abs(p.x), p.y);

  // Lit from above.
  let shade = mix(1.2, 0.74, clamp((p.y + 3.1) / 6.0, 0.0, 1.0));
  let body = in.color * shade;
  let trim = in.color * 0.6;
  let eye = mix(vec3f(0.78, 0.96, 1.0), in.tint.rgb * 1.3 + vec3f(0.25), in.tint.a);
  let fire = mix(vec3f(1.0, 0.62, 0.2), in.tint.rgb * 1.2 + vec3f(0.1), 0.55 * in.tint.a);

  var acc = vec4f(0.0);

  // Exhaust from both nozzles, tapering and fading as it streams away.
  let dir = in.exhaust.xy;
  let len = in.exhaust.z * in.thrust;
  let nozzle = vec2f(1.75, 4.2);
  var flame = 0.0;
  for (var k = 0; k < 2; k++) {
    let n = select(nozzle, vec2f(-nozzle.x, nozzle.y), k == 1);
    let d = taper(p, n, n + dir * len, 0.55, 0.05);
    let along = clamp(dot(p - n, dir) / len, 0.0, 1.0);
    flame = max(flame, (1.0 - smoothstep(-0.5 * px, 0.5 * px, d)) * (1.0 - along) * (1.0 - along));
  }
  acc = vec4f(fire * flame, flame);

  acc = layer(acc, triangle(m, vec2f(3.2, -1.9), vec2f(5.6, -4.3), vec2f(3.7, 0.6)) - 0.15, px, trim);
  acc = layer(acc, roundBox(m - vec2f(1.75, 3.75), vec2f(0.75, 0.6), 0.3), px, trim);
  acc = layer(acc, roundBox(p - vec2f(0.0, 3.0), vec2f(2.3, 0.55), 0.3), px, trim);
  let head = roundBox(p - vec2f(0.0, -0.2), vec2f(3.7, 2.9), 1.1);
  acc = layer(acc, head, px, body);
  // A crisp lit rim along the top of the helmet.
  acc = layer(acc, max(-head - 0.35, head) + select(1.0, 0.0, p.y < -1.2), px, body * 1.35);
  let visor = roundBox(p - vec2f(0.0, -0.25), vec2f(3.0, 0.95), 0.8);
  acc = layer(acc, visor, px, vec3f(0.04, 0.045, 0.06));
  // The LED strip, with the scanner eye and its glow inside the visor.
  let inside = 1.0 - smoothstep(-0.5 * px, 0.5 * px, visor);
  let strip = roundBox(p - vec2f(0.0, -0.25), vec2f(2.45, 0.2), 0.2);
  acc = layer(acc, strip, px, eye * 0.3);
  let glow = exp(-length((p - vec2f(in.scan, -0.25)) * vec2f(0.8, 1.6)) * 1.4) * inside;
  acc = vec4f(acc.rgb + eye * glow * 0.6, acc.a);
  acc = layer(acc, roundBox(p - vec2f(in.scan, -0.25), vec2f(0.65, 0.34), 0.3), px, eye * 1.15);

  let a = acc.a * in.alpha;
  if (a <= 0.003) { discard; }
  return vec4f(acc.rgb * a, a);
}

@vertex
fn vs_tasks(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let t = tasks.at[ii];
  // Big enough for the completion pulse at its widest.
  let reach = t.z * (tasks.progress[ii].z + 0.5) + 16.0;

  var out: Varyings;
  out.position = toClip(t.xy + cornerOf(vi) * reach);
  out.local = cornerOf(vi) * reach;
  out.color = tasks.tint[ii].rgb;
  out.alpha = max(t.w, tasks.progress[ii].y);
  out.index = ii;
  out.thrust = 0.0;
  out.tint = vec4f(0.0);
  out.exhaust = vec3f(0.0, 1.0, 1.0);
  out.scan = 0.0;
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
    let far = tasks.progress[in.index].z;
    pulse += band(d, mix(1.0, t.z * far, e), mix(1.5, 4.5, e)) * fade * 1.5;
    let lag = clamp((burst - 0.15) / 0.85, 0.0, 1.0);
    let e2 = 1.0 - pow(1.0 - lag, 3.0);
    pulse += band(d, mix(1.0, t.z * far * 0.68, e2), 1.8) * (1.0 - lag) * (1.0 - lag) * 0.7 * step(0.001, lag);
    pulse += (1.0 - smoothstep(0.0, 0.25, burst)) * exp(-d / 10.0) * 1.4;
  }

  let a = idle + pulse;
  return vec4f(in.color * a, min(a, 1.0));
}

// A laser from a robot down onto the name: a one-pixel white-hot core in a
// tight coloured glow, brightest where it lands, with a flickering spark there.
@vertex
fn vs_beams(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let line = beams.line[ii];
  let span = line.zw - line.xy;
  let len = max(length(span), 1.0);
  let dir = span / len;
  let across = vec2f(-dir.y, dir.x);
  let corner = cornerOf(vi);
  // Padded past the landing point for the spark.
  let local = vec2f(mix(-4.0, len + 14.0, corner.x * 0.5 + 0.5), corner.y * 14.0);

  var out: Varyings;
  out.position = select(vec4f(0.0), toClip(line.xy + dir * local.x + across * local.y), beams.tint[ii].w > 0.001);
  out.local = local;
  out.color = beams.tint[ii].rgb;
  out.alpha = beams.tint[ii].w;
  out.index = ii;
  out.thrust = len;
  out.tint = vec4f(0.0);
  out.exhaust = vec3f(0.0, 1.0, 1.0);
  out.scan = 0.0;
  return out;
}

@fragment
fn fs_beams(in: Varyings) -> @location(0) vec4f {
  let along = in.local.x;
  let off = abs(in.local.y);
  let len = in.thrust;

  let core = exp(-off * off / 0.3);
  let glow = exp(-off / 2.0) * 0.45;
  let shaft = (core + glow) * smoothstep(-3.0, 3.0, along) * (1.0 - smoothstep(len - 0.5, len + 0.5, along)) * mix(0.35, 1.0, clamp(along / len, 0.0, 1.0));

  let d = length(vec2f(along - len, in.local.y));
  let flicker = 0.8 + 0.2 * sin(view.frame.w * 47.0 + f32(in.index) * 2.1);
  let spark = (exp(-d * d / 3.0) * 1.6 + exp(-d / 4.0) * 0.6) * flicker;

  let white = core * 0.7 + exp(-d * d / 2.0);
  let color = mix(in.color * 1.25 + vec3f(0.1), vec3f(1.0), clamp(white, 0.0, 1.0));
  let a = clamp((shaft + spark) * in.alpha, 0.0, 1.0);
  if (a <= 0.003) { discard; }
  return vec4f(color * a, a);
}
