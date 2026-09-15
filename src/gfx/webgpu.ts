import { SHAPE_ID, SHAPE_PHYSICS, type ShapeName } from "./shapes";
import type { Theme } from "./theme";
import {
  cameraBasis,
  clamp,
  damp,
  lookAt,
  multiply,
  perspective,
  type Vec3,
} from "./math";
import type { Backend, BackendOptions } from "./types";

/* ===========================================================================
   Shared WGSL — particle layout, hashing, value noise, curl, shape targets
   =========================================================================== */

const COMMON_WGSL = /* wgsl */ `
struct Particle {
  pos: vec3<f32>,
  seed: f32,
  vel: vec3<f32>,
  energy: f32,
}

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn hash11(p: f32) -> f32 {
  var x = fract(p * 0.1031);
  x *= x + 33.33;
  x *= x + x;
  return fract(x);
}

fn hash31(p: vec3<f32>) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

fn noise3(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = hash31(i);
  let n100 = hash31(i + vec3<f32>(1.0, 0.0, 0.0));
  let n010 = hash31(i + vec3<f32>(0.0, 1.0, 0.0));
  let n110 = hash31(i + vec3<f32>(1.0, 1.0, 0.0));
  let n001 = hash31(i + vec3<f32>(0.0, 0.0, 1.0));
  let n101 = hash31(i + vec3<f32>(1.0, 0.0, 1.0));
  let n011 = hash31(i + vec3<f32>(0.0, 1.0, 1.0));
  let n111 = hash31(i + vec3<f32>(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

fn potential(p: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    noise3(p),
    noise3(p + vec3<f32>(31.41, 17.73, 8.31)),
    noise3(p + vec3<f32>(-9.22, 43.17, 21.64))
  );
}

// Divergence-free flow via the curl of a noise potential. Forward differences
// keep this to four potential() evaluations instead of six.
fn curlNoise(p: vec3<f32>) -> vec3<f32> {
  let e = 0.32;
  let p0 = potential(p);
  let px = potential(p + vec3<f32>(e, 0.0, 0.0));
  let py = potential(p + vec3<f32>(0.0, e, 0.0));
  let pz = potential(p + vec3<f32>(0.0, 0.0, e));
  return vec3<f32>(
    (py.z - p0.z) - (pz.y - p0.y),
    (pz.x - p0.x) - (px.z - p0.z),
    (px.y - p0.y) - (py.x - p0.x)
  ) / e;
}

fn shapeTarget(id: u32, i: u32, n: f32, t: f32) -> vec3<f32> {
  let fi = f32(i);
  let r1 = hash11(fi * 1.71 + 0.37);
  let r2 = hash11(fi * 3.13 + 11.79);
  let r3 = hash11(fi * 5.97 + 27.41);

  switch id {
    // ---- 0 : node lattice --------------------------------------------------
    case 0u: {
      // An ordered grid where every node is a tight cluster of particles, so
      // each one reads as a single soft point of light rather than a smear.
      let cols = 150u;
      let rows = 100u;

      // Scramble the index before binning. A plain i % cells would hand the
      // leftover particles to the first N cells, banding one region brighter.
      var h = i;
      h = h ^ (h >> 16u);
      h = h * 2246822519u;
      h = h ^ (h >> 13u);
      h = h * 3266489917u;
      h = h ^ (h >> 16u);
      let cell = h % (cols * rows);

      let u = f32(cell % cols) / f32(cols - 1u) - 0.5;
      let v = f32(cell / cols) / f32(rows - 1u) - 0.5;
      // Spans overshoot the frame so the grid never shows an edge.
      let x = u * 13.6;
      let y = v * 9.0;
      let z = sin(x * 1.05 + t * 0.62) * cos(y * 0.95 - t * 0.44) * 0.52;
      let jitter = vec3<f32>(
        hash11(fi * 2.13) - 0.5,
        hash11(fi * 4.27) - 0.5,
        hash11(fi * 6.41) - 0.5
      ) * 0.017;
      return vec3<f32>(x, y, z) + jitter;
    }
    // ---- 2 : fibonacci sphere ---------------------------------------------
    case 2u: {
      let k = fi + 0.5;
      let phi = acos(1.0 - 2.0 * k / n);
      let theta = PI * (1.0 + sqrt(5.0)) * k;
      return vec3<f32>(cos(theta) * sin(phi), sin(theta) * sin(phi), cos(phi)) * 1.68;
    }
    // ---- 3 : torus ---------------------------------------------------------
    case 3u: {
      let u = r1 * TAU;
      let v = r2 * TAU;
      let bigR = 1.35;
      let smallR = 0.52;
      return vec3<f32>(
        (bigR + smallR * cos(v)) * cos(u),
        smallR * sin(v),
        (bigR + smallR * cos(v)) * sin(u)
      );
    }
    // ---- 4 : double helix --------------------------------------------------
    case 4u: {
      let y = (r2 - 0.5) * 3.5;
      let ang = r2 * 5.0 * TAU + t * 0.25;
      let rad = 0.88;
      let s1 = vec3<f32>(cos(ang) * rad, y, sin(ang) * rad);
      let s2 = vec3<f32>(cos(ang + PI) * rad, y, sin(ang + PI) * rad);
      if (r3 < 0.16) { return mix(s1, s2, r1); }  // rungs
      if (r1 < 0.5) { return s1; }
      return s2;
    }
    // ---- 5 : spiral galaxy -------------------------------------------------
    case 5u: {
      let arms = 3.0;
      let arm = floor(r1 * arms);
      let rad = pow(r2, 0.55) * 2.45;
      let scatter = (hash11(fi * 9.13) - 0.5) * (0.3 + rad * 0.34);
      let ang = rad * 1.85 + arm * (TAU / arms) + t * 0.06 + scatter;
      let y = (hash11(fi * 13.77) - 0.5) * 0.4 * exp(-rad * 0.55);
      return vec3<f32>(cos(ang) * rad, y, sin(ang) * rad);
    }
    // ---- 1 : open field ----------------------------------------------------
    case 1u, default: {
      let th = r1 * TAU;
      let ph = acos(2.0 * r2 - 1.0);
      let rad = 1.3 + r3 * 1.7;
      return vec3<f32>(
        rad * sin(ph) * cos(th) * 1.55,
        rad * sin(ph) * sin(th) * 0.82,
        rad * cos(ph)
      );
    }
  }
}
`;

const COMPUTE_WGSL = /* wgsl */ `
${COMMON_WGSL}

struct Sim {
  dt: f32,
  time: f32,
  shape: f32,
  morph: f32,
  turbulence: f32,
  attract: f32,
  damping: f32,
  _pad0: f32,
  pointer: vec3<f32>,
  pointerActive: f32,
  burst: vec3<f32>,
  burstAmount: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> sim: Sim;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let n = arrayLength(&particles);
  if (i >= n) { return; }

  var p = particles[i];
  let dt = min(sim.dt, 0.033);

  // NB: "target" is a WGSL reserved keyword, hence "goal".
  let goal = shapeTarget(u32(sim.shape), i, f32(n), sim.time);
  var force = vec3<f32>(0.0, 0.0, 0.0);

  // Spring toward the current shape. The morph term surges briefly on a shape
  // change so the field snaps into its new form, then settles.
  force += (goal - p.pos) * (sim.attract * (1.0 + sim.morph * 3.0));

  // Ambient turbulence.
  let flow = curlNoise(p.pos * 0.42 + vec3<f32>(0.0, 0.0, sim.time * 0.085));
  force += flow * sim.turbulence;

  // Pointer pushes particles away; 1/r² with an epsilon so it never blows up.
  if (sim.pointerActive > 0.001) {
    let d = p.pos - sim.pointer;
    let dist2 = dot(d, d) + 0.09;
    let push = min(sim.pointerActive * 3.6 / dist2, 30.0);
    force += (d / sqrt(dist2)) * push;
  }

  // Click / tap shockwave.
  if (sim.burstAmount > 0.001) {
    let d = p.pos - sim.burst;
    let dist2 = dot(d, d) + 0.22;
    force += (d / sqrt(dist2)) * (sim.burstAmount * 30.0 / dist2);
  }

  p.vel += force * dt;
  p.vel *= exp(-sim.damping * dt);
  p.pos += p.vel * dt;

  // Soft containment so nothing escapes the frame permanently.
  let far = length(p.pos);
  if (far > 6.5) {
    p.pos *= 6.5 / far;
    p.vel *= 0.35;
  }

  p.energy = clamp(length(p.vel) * 0.4, 0.0, 1.0);
  particles[i] = p;
}
`;

const RENDER_WGSL = /* wgsl */ `
${COMMON_WGSL}

struct View {
  viewProj: mat4x4<f32>,
  right: vec3<f32>,
  pointSize: f32,
  up: vec3<f32>,
  intensity: f32,
  colorA: vec3<f32>,
  fade: f32,
  colorB: vec3<f32>,
  _pad: f32,
}

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) tint: vec3<f32>,
  @location(2) alpha: f32,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> view: View;

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  let p = particles[ii];

  // Two triangles, derived arithmetically to avoid indexing a local array.
  let cx = select(-1.0, 1.0, vi == 1u || vi == 4u || vi == 5u);
  let cy = select(-1.0, 1.0, vi == 2u || vi == 3u || vi == 5u);

  let size = view.pointSize * (0.55 + p.energy * 0.9);
  let world = p.pos + view.right * (cx * size) + view.up * (cy * size);

  var out: VSOut;
  out.clip = view.viewProj * vec4<f32>(world, 1.0);
  out.uv = vec2<f32>(cx, cy);
  out.tint = mix(view.colorA, view.colorB, clamp(p.energy * 1.45, 0.0, 1.0));
  out.alpha = view.intensity * view.fade;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  if (d > 1.0) { discard; }
  // Soft halo plus a tight hot core — reads as a point of light, not a disc.
  let halo = pow(1.0 - d, 2.4);
  let core = pow(1.0 - d, 14.0) * 0.85;
  let a = (halo + core) * in.alpha;
  return vec4<f32>(in.tint * a, a);  // premultiplied, additively blended
}
`;

/* ===========================================================================
   Renderer
   =========================================================================== */

const PARTICLE_BYTES = 32; // vec3 pos + f32 seed + vec3 vel + f32 energy
const SIM_BYTES = 64;
const VIEW_BYTES = 128;
const FOV = (50 * Math.PI) / 180;
const CAM_DIST = 5.75;

/**
 * Portrait viewports are far narrower than the bounded shapes, so pull the
 * camera back until they fit. The lattice is meant to bleed off the edges.
 */
export function camDistFor(aspect: number): number {
  const needed = 1.95 / (Math.tan(FOV / 2) * Math.max(aspect, 0.3));
  return clamp(needed, CAM_DIST, 9.8);
}

export async function createWebGPUBackend(
  canvas: HTMLCanvasElement,
  opts: BackendOptions
): Promise<Backend> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error("navigator.gpu unavailable");
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) throw new Error("no WebGPU adapter");

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("no webgpu canvas context");

  // Storage buffers must be readable from the vertex stage for the billboarding
  // path; WebGPU compatibility mode reports 0 here.
  if (device.limits.maxStorageBuffersPerShaderStage < 1) {
    device.destroy();
    throw new Error("vertex-stage storage buffers unsupported");
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "premultiplied" });

  let count = opts.count;
  let particleBuffer = device.createBuffer({
    size: count * PARTICLE_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuffer, 0, seedParticles(count));

  const simBuffer = device.createBuffer({
    size: SIM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const viewBuffer = device.createBuffer({
    size: VIEW_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computeModule = device.createShaderModule({
    code: COMPUTE_WGSL,
    label: "field-compute",
  });
  const renderModule = device.createShaderModule({
    code: RENDER_WGSL,
    label: "field-render",
  });

  // A WGSL error otherwise produces an invalid pipeline that fails silently
  // every frame. Surfacing it here lets the engine fall back to WebGL2.
  await assertCompiled(computeModule, "compute");
  await assertCompiled(renderModule, "render");

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeModule, entryPoint: "main" },
  });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderModule, entryPoint: "vs" },
    fragment: {
      module: renderModule,
      entryPoint: "fs",
      targets: [
        {
          format,
          blend: {
            // Pure additive: light accumulates where particles overlap.
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  let computeBind: GPUBindGroup;
  let renderBind: GPUBindGroup;

  // Bind groups reference the particle buffer directly, so both are rebuilt
  // whenever the buffer is reallocated for a new particle count.
  function rebind() {
    computeBind = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuffer } },
        { binding: 1, resource: { buffer: simBuffer } },
      ],
    });
    renderBind = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuffer } },
        { binding: 1, resource: { buffer: viewBuffer } },
      ],
    });
  }
  rebind();

  const simData = new Float32Array(SIM_BYTES / 4);
  const viewData = new Float32Array(VIEW_BYTES / 4);

  const state = {
    shape: opts.shape,
    theme: opts.theme,
    morph: 1,
    turbulence: opts.turbulence,
    pointerActive: 0,
    pointer: [0, 0, 0] as Vec3,
    burst: [0, 0, 0] as Vec3,
    burstAmount: 0,
    fade: 0,
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
    paused: false,
    visible: true,
  };

  let dpr = 1;
  let width = 1;
  let height = 1;
  let raf = 0;
  let last = performance.now();
  let elapsed = 0;
  let destroyed = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr);
    width = Math.max(1, Math.round(rect.width * dpr));
    height = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = width;
    canvas.height = height;
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  function frame(now: number) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);

    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (state.paused || !state.visible || width < 2) return;
    elapsed += dt;

    // --- simulation uniforms ------------------------------------------------
    state.morph = damp(state.morph, 0, 2.6, dt);
    state.burstAmount = damp(state.burstAmount, 0, 3.4, dt);
    state.fade = damp(state.fade, 1, 1.6, dt);

    const physics = SHAPE_PHYSICS[state.shape];
    simData[0] = dt;
    simData[1] = elapsed;
    simData[2] = SHAPE_ID[state.shape];
    simData[3] = state.morph;
    simData[4] = physics.turbulence * state.turbulence;
    simData[5] = physics.attract;
    simData[6] = physics.damping;
    simData[7] = 0;
    simData[8] = state.pointer[0];
    simData[9] = state.pointer[1];
    simData[10] = state.pointer[2];
    simData[11] = state.pointerActive;
    simData[12] = state.burst[0];
    simData[13] = state.burst[1];
    simData[14] = state.burst[2];
    simData[15] = state.burstAmount;
    device.queue.writeBuffer(simBuffer, 0, simData);

    // --- camera -------------------------------------------------------------
    // Keep the drift small: the triangle is a flat mark, and much more yaw than
    // this reads as a skewed shape rather than a poised one.
    state.yaw = damp(state.yaw, state.targetYaw + Math.sin(elapsed * 0.12) * 0.06, 2.2, dt);
    state.pitch = damp(state.pitch, state.targetPitch + Math.sin(elapsed * 0.09) * 0.03, 2.2, dt);

    const aspect = width / height;
    const dist = camDistFor(aspect);
    const eye: Vec3 = [
      Math.sin(state.yaw) * Math.cos(state.pitch) * dist,
      Math.sin(state.pitch) * dist,
      Math.cos(state.yaw) * Math.cos(state.pitch) * dist,
    ];
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    const viewProj = multiply(perspective(FOV, aspect, 0.1, 100), view);
    const basis = cameraBasis(eye, [0, 0, 0], [0, 1, 0]);

    viewData.set(viewProj, 0);
    viewData.set(basis.right, 16);
    // Sprite radius is world-space, so apparent size would shrink as the camera
    // pulls back on portrait. Scale with distance to hold the line weight.
    viewData[19] = opts.pointSize * (dist / CAM_DIST);
    viewData.set(basis.up, 20);
    viewData[23] = opts.intensity;
    viewData.set(state.theme.colorA, 24);
    viewData[27] = state.fade;
    viewData.set(state.theme.colorB, 28);
    viewData[31] = 0;
    device.queue.writeBuffer(viewBuffer, 0, viewData);

    // --- passes -------------------------------------------------------------
    const encoder = device.createCommandEncoder();

    const pass = encoder.beginComputePass();
    pass.setPipeline(computePipeline);
    pass.setBindGroup(0, computeBind);
    pass.dispatchWorkgroups(Math.ceil(count / 64));
    pass.end();

    const draw = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context!.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    draw.setPipeline(renderPipeline);
    draw.setBindGroup(0, renderBind);
    draw.draw(6, count);
    draw.end();

    device.queue.submit([encoder.finish()]);
  }

  raf = requestAnimationFrame(frame);

  const vis = () => {
    state.visible = document.visibilityState === "visible";
    last = performance.now();
  };
  document.addEventListener("visibilitychange", vis);

  return {
    kind: "webgpu",
    adapterLabel: describeAdapter(adapter),
    get count() {
      return count;
    },
    setShape(shape: ShapeName) {
      state.shape = shape;
      state.morph = 1;
    },
    setTheme(theme: Theme) {
      state.theme = theme;
    },
    setTurbulence(v: number) {
      state.turbulence = v;
    },
    setPaused(p: boolean) {
      state.paused = p;
      last = performance.now();
    },
    setPointer(world: Vec3 | null) {
      if (world) {
        state.pointer = world;
        state.pointerActive = 1;
        state.targetYaw = clamp(world[0] * 0.04, -0.25, 0.25);
        state.targetPitch = clamp(-world[1] * 0.03, -0.18, 0.18);
      } else {
        state.pointerActive = 0;
        state.targetYaw = 0;
        state.targetPitch = 0;
      }
    },
    burst(world: Vec3) {
      state.burst = world;
      state.burstAmount = 1;
    },
    screenToWorld(ndcX: number, ndcY: number): Vec3 {
      const aspect = width / height;
      const dist = camDistFor(aspect);
      const halfH = Math.tan(FOV / 2) * dist;
      const halfW = halfH * aspect;
      const eye: Vec3 = [
        Math.sin(state.yaw) * Math.cos(state.pitch) * dist,
        Math.sin(state.pitch) * dist,
        Math.cos(state.yaw) * Math.cos(state.pitch) * dist,
      ];
      const b = cameraBasis(eye, [0, 0, 0], [0, 1, 0]);
      const x = ndcX * halfW;
      const y = ndcY * halfH;
      return [
        b.right[0] * x + b.up[0] * y,
        b.right[1] * x + b.up[1] * y,
        b.right[2] * x + b.up[2] * y,
      ];
    },
    setCount(next: number) {
      const clamped = Math.max(2048, Math.min(Math.round(next), opts.maxCount));
      if (clamped === count) return count;
      count = clamped;

      const previous = particleBuffer;
      particleBuffer = device.createBuffer({
        size: count * PARTICLE_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(particleBuffer, 0, seedParticles(count));
      rebind();
      previous.destroy();

      state.morph = 1;
      return count;
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", vis);
      device.destroy();
    },
  };
}

async function assertCompiled(module: GPUShaderModule, label: string): Promise<void> {
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === "error");
  if (!errors.length) return;
  const first = errors[0];
  throw new Error(
    `${label} shader failed at ${first.lineNum}:${first.linePos} — ${first.message}`
  );
}

function describeAdapter(adapter: GPUAdapter): string {
  const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
  if (!info) return "WebGPU device";
  const parts = [info.vendor, info.architecture].filter(Boolean);
  return parts.length ? parts.join(" ") : "WebGPU device";
}

/** Particles start scattered in a shell so the first frames read as an assembly. */
function seedParticles(count: number): Float32Array<ArrayBuffer> {
  const data = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const o = i * 8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 4.2 + Math.random() * 2.1;
    data[o + 0] = Math.sin(phi) * Math.cos(theta) * r;
    data[o + 1] = Math.sin(phi) * Math.sin(theta) * r;
    data[o + 2] = Math.cos(phi) * r;
    data[o + 3] = Math.random();
    data[o + 4] = 0;
    data[o + 5] = 0;
    data[o + 6] = 0;
    data[o + 7] = 0;
  }
  return data;
}
