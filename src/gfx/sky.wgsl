// The hero's backdrop: a slate sky that deepens upwards, a horizon glow and
// soft aurora curtains tinted by whatever tasks are open. The canvas runs on
// below the hero so agents can leave it; below the hero's edge it's clear.

struct Sky {
  // horizon (0..1 of the hero), aspect, time, where the hero ends (uv y)
  frame: vec4f,
  // rgb of the open tasks, how much is going on (0..1)
  tint: vec4f,
}

@group(0) @binding(0) var<uniform> sky: Sky;

fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2f(1.0, 0.0)), w.x),
    mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), w.x),
    w.y
  );
}

fn fbm(p: vec2f) -> f32 {
  var sum = 0.0;
  var amp = 0.5;
  var q = p;
  for (var i = 0; i < 4; i++) {
    sum += noise(q) * amp;
    q = q * 2.03 + vec2f(1.7, 9.2);
    amp *= 0.5;
  }
  return sum;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (uv.y > sky.frame.w) { return vec4f(0.0); }
  // Measure everything within the hero, not the whole canvas.
  let v = uv.y / sky.frame.w;
  let horizon = sky.frame.x;
  let aspect = sky.frame.y;
  let t = sky.frame.z;
  let tint = sky.tint.rgb;
  let activity = sky.tint.a;

  let page = vec3f(0.039, 0.039, 0.043);
  // Distance above the horizon, in screen heights (negative below it).
  let above = horizon - v;

  // Sky: a lifted slate at the horizon, settling back to the page colour.
  var col = mix(vec3f(0.075, 0.082, 0.11), page, smoothstep(-0.05, 0.6, above));

  // Horizon glow, tinted by open tasks and breathing with how many there are.
  let band = exp(-abs(above) * 10.0);
  col += tint * band * (0.07 + 0.18 * activity);

  // Aurora curtains: folds that drift sideways, only in a band above the horizon.
  let x = uv.x * aspect;
  let fold = fbm(vec2f(x * 0.8 + t * 0.012, t * 0.02));
  let curtain = smoothstep(0.42, 0.85, fbm(vec2f(x * 1.6 + fold * 2.2, above * 2.5 - t * 0.015)));
  let reach = smoothstep(0.0, 0.06, above) * (1.0 - smoothstep(0.08, 0.42, above));
  let auroraColor = mix(vec3f(0.35, 0.45, 0.95), tint, 0.55);
  col += auroraColor * curtain * reach * (0.09 + 0.06 * activity);

  // A faint sheen on the floor, below the horizon.
  let below = max(-above, 0.0);
  col += tint * exp(-below * 5.0) * (0.03 + 0.05 * activity) * smoothstep(0.0, 0.05, below);

  // Hand back to the page colour at the bottom edge.
  col = mix(col, page, smoothstep(0.7, 1.0, v));

  // Dither so the long, dark gradients don't band.
  col += (hash(uv * vec2f(1733.0, 977.0) + t) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
