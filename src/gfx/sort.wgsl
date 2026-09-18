// A bitonic sort running on the GPU, drawn as a row of bars. Each key is
// x: value (0..1), y: displayed height (eases towards x), z: flash (0..1),
// w: palette index of the pass that last moved it.

struct Sort {
  n: u32,
  // Bitonic pass: compare i with i ^ j, ascending where (i & k) == 0.
  j: u32,
  k: u32,
  // Shuffle: swap pairs within [lo, hi) using mask j, gated by a hash of seed.
  lo: u32,
  hi: u32,
  seed: f32,
  // Palette index to flash moved keys with.
  hue: f32,
  // Per-frame easing: fraction of the gap closed, and flash kept.
  ease: f32,
  fade: f32,
}

@group(0) @binding(0) var<uniform> sort: Sort;
@group(0) @binding(1) var<storage, read_write> keys: array<vec4f>;

fn hash(x: u32, seed: f32) -> f32 {
  return fract(sin(f32(x) * 12.9898 + seed * 78.233) * 43758.5453);
}

fn exchange(i: u32, l: u32) {
  let a = keys[i];
  let b = keys[l];
  keys[i] = vec4f(b.x, a.y, 1.0, sort.hue);
  keys[l] = vec4f(a.x, b.y, 1.0, sort.hue);
}

@compute @workgroup_size(64)
fn bitonic(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let l = i ^ sort.j;
  if (i >= sort.n || l <= i || l >= sort.n) { return; }
  let ascending = (i & sort.k) == 0u;
  if ((keys[i].x > keys[l].x) == ascending) { exchange(i, l); }
}

@compute @workgroup_size(64)
fn shuffle(@builtin(global_invocation_id) id: vec3u) {
  let i = sort.lo + id.x;
  let l = i ^ sort.j;
  if (i >= sort.hi || l <= i || l < sort.lo || l >= sort.hi) { return; }
  if (hash(i, sort.seed) < 0.5) { exchange(i, l); }
}

@compute @workgroup_size(64)
fn relax(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= sort.n) { return; }
  var key = keys[i];
  key.y += (key.x - key.y) * sort.ease;
  key.z *= sort.fade;
  keys[i] = key;
}
