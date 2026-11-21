/**
 * POC: the hero's robots as physically based 3D models, rendered with three.js'
 * WebGPURenderer and TSL node materials (WebGPU, falling back to WebGL2).
 *
 * The robot is the same design as the 2D one (agents-render.wgsl): a helmet
 * with a dark glass visor, an LED strip and a sweeping scanner eye, swept-back
 * fins, a chin plate and twin thrusters, modelled from primitives so there are
 * no assets to load. Every part is an InstancedMesh sharing one instance
 * matrix buffer and one tint buffer; per-robot animation (scanner, exhaust
 * length, colour) runs in TSL on the GPU.
 *
 * Motion is a small CPU boids swarm with tasks: a task appears, the nearest
 * idle robots orbit it and take on its colour, then it completes with a pulse
 * and they disperse. Good enough to judge the look; the real hero keeps its
 * GPU simulation (agents.wgsl).
 */
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Euler,
  ExtrudeGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  RenderPipeline,
  Scene,
  Shape,
  TorusGeometry,
  Vector3,
  WebGPURenderer,
  type BufferGeometry,
  type Material,
} from "three/webgpu";
import {
  float,
  instancedDynamicBufferAttribute,
  instanceIndex,
  mix,
  pass,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../palette";

export type LabStats = { backend: string; robots: number; tasks: number; fps: number };

/* --- the robot ------------------------------------------------------------ */

/** Where the thrusters' nozzles end, in robot units (height ≈ 1, y up). */
const NOZZLE_Y = -0.43;

function at(geometry: BufferGeometry, x: number, y: number, z: number) {
  geometry.translate(x, y, z);
  return geometry;
}

/** One swept fin, mirrored to the side `side` (±1). Same outline as the 2D robot's. */
function fin(side: number) {
  const shape = new Shape();
  shape.moveTo(0.32, 0.19);
  shape.lineTo(0.58, 0.45);
  shape.lineTo(0.37, -0.06);
  shape.closePath();
  const g = new ExtrudeGeometry(shape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  g.translate(0, 0, -0.035);
  if (side < 0) g.scale(-1, 1, 1);
  return g;
}

/** The robot's parts, one merged geometry per material. */
function robotParts() {
  const strip = (g: BufferGeometry) => {
    // Every merged geometry needs the same attributes.
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    return g.index ? g.toNonIndexed() : g;
  };
  const merge = (parts: BufferGeometry[]) => mergeGeometries(parts.map(strip))!;

  const shell = merge([at(new RoundedBoxGeometry(0.74, 0.58, 0.52, 5, 0.17), 0, 0.02, 0)]);
  const trim = merge([
    fin(1),
    fin(-1),
    at(new RoundedBoxGeometry(0.46, 0.11, 0.36, 3, 0.04), 0, -0.3, 0),
    at(new CylinderGeometry(0.062, 0.085, 0.13, 20), 0.175, -0.365, 0),
    at(new CylinderGeometry(0.062, 0.085, 0.13, 20), -0.175, -0.365, 0),
  ]);
  const visor = merge([at(new RoundedBoxGeometry(0.6, 0.19, 0.08, 3, 0.04), 0, 0.025, 0.24)]);
  const led = merge([at(new RoundedBoxGeometry(0.49, 0.04, 0.02, 1, 0.008), 0, 0.025, 0.28)]);
  const eye = merge([at(new RoundedBoxGeometry(0.12, 0.065, 0.03, 2, 0.015), 0, 0.025, 0.29)]);
  // Exhaust: open cones hanging from each nozzle, apex down; stretched per robot in TSL.
  const cone = (x: number) => at(new CylinderGeometry(0.06, 0.0, 0.34, 16, 1, true), x, NOZZLE_Y - 0.17, 0);
  const flame = merge([cone(0.175), cone(-0.175)]);
  return { shell, trim, visor, led, eye, flame };
}

/* --- the scene ------------------------------------------------------------ */

type Robot = {
  p: Vector3;
  v: Vector3;
  /** Smoothed lean (roll), turn (yaw) and pitch. */
  roll: number;
  yaw: number;
  pitch: number;
  task: number;
  /** How much of a task's colour it has taken on, and that colour. */
  weight: number;
  color: Color;
};

type Task = {
  p: Vector3;
  color: Color;
  age: number;
  life: number;
  /** Seconds since completion, or -1 while open. */
  done: number;
  ring: Mesh;
  ringMaterial: MeshBasicNodeMaterial;
};

/** Idle body: a mid gunmetal, so the clear coat and rim light do the work. */
const IDLE = new Color(0.36, 0.38, 0.43);

/**
 * Starts the POC on `canvas` (sized by CSS). Returns a teardown.
 * `onStats` gets a readout once a second.
 */
export function startRobots3D(canvas: HTMLCanvasElement, onStats: (s: LabStats) => void): () => void {
  let disposed = false;
  let frame = 0;
  const cleanups: Array<() => void> = [];

  void (async () => {
    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true });
    await renderer.init();
    if (disposed) return renderer.dispose();
    cleanups.push(() => renderer.dispose());

    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 0.95;
    const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "webgpu" : "webgl2";

    const small = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
    const COUNT = small ? 36 : 72;

    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    scene.environmentIntensity = 0.42;

    // A soft key from the top left and a cool rim from behind, like a product shot.
    const key = new DirectionalLight(0xfff4e8, 1.7);
    key.position.set(-4, 6, 8);
    const rim = new DirectionalLight(0x8fb4ff, 3.2);
    rim.position.set(3, 2, -6);
    scene.add(key, rim);

    const camera = new PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 14);

    /* --- materials (TSL) -------------------------------------------------- */

    // Per robot: rgb of its task, and how much of it it has taken on.
    const tintData = new Float32Array(COUNT * 4);
    const tintAttr = new InstancedBufferAttribute(tintData, 4).setUsage(DynamicDrawUsage);
    const tint = instancedDynamicBufferAttribute<"vec4">(tintAttr, "vec4");

    // The body: clear-coated metal, slate when idle, anodised in the task's colour while working.
    const shellMat = new MeshPhysicalNodeMaterial({ metalness: 0.9, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.08 });
    shellMat.colorNode = mix(vec3(IDLE.r, IDLE.g, IDLE.b), tint.xyz.mul(0.85), tint.w);

    const trimMat = new MeshPhysicalNodeMaterial({ metalness: 0.9, roughness: 0.42 });
    trimMat.colorNode = mix(vec3(0.17, 0.18, 0.21), tint.xyz.mul(0.45), tint.w.mul(0.6));

    // Dark glass: no diffuse to speak of, all reflection.
    const visorMat = new MeshPhysicalNodeMaterial({ color: 0x050608, metalness: 0.2, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 });

    const eyeColor = mix(vec3(0.78, 0.96, 1.0), tint.xyz.mul(1.3).add(0.25), tint.w);
    const ledMat = new MeshBasicNodeMaterial();
    ledMat.colorNode = eyeColor.mul(0.55);

    // The scanner eye, HDR so it blooms. Its sweep across the visor is in its instance matrix.
    const eyeMat = new MeshBasicNodeMaterial();
    eyeMat.colorNode = eyeColor.mul(4.0);

    // Exhaust: hot near the nozzle, cooling to the task colour, flickering. Its length is in its instance matrix.
    const flameMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    const along = uv().y; // 1 at the nozzle, 0 at the tip
    const fire = mix(vec3(1.0, 0.55, 0.18), tint.xyz.mul(1.2).add(0.1), tint.w.mul(0.6));
    const flicker = sin(time.mul(31.0).add(float(instanceIndex).mul(1.7))).mul(0.12).add(0.88);
    flameMat.colorNode = mix(fire, vec3(1.0, 0.95, 0.85), smoothstep(0.75, 1.0, along)).mul(3.0);
    flameMat.opacityNode = along.mul(flicker);

    /* --- instanced parts ---------------------------------------------------- */

    const parts = robotParts();
    const meshes: InstancedMesh[] = [];
    const matrices = new InstancedBufferAttribute(new Float32Array(COUNT * 16), 16).setUsage(DynamicDrawUsage);
    // The scanner eyes and the exhaust move relative to the body, so they get their own matrices.
    const eyeMatrices = new InstancedBufferAttribute(new Float32Array(COUNT * 16), 16).setUsage(DynamicDrawUsage);
    const flameMatrices = new InstancedBufferAttribute(new Float32Array(COUNT * 16), 16).setUsage(DynamicDrawUsage);
    const add = (geometry: BufferGeometry, material: Material, order = 0, instanceMatrix = matrices) => {
      const mesh = new InstancedMesh(geometry, material, COUNT);
      mesh.instanceMatrix = instanceMatrix;
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      geometry.setAttribute("tint", tintAttr);
      scene.add(mesh);
      meshes.push(mesh);
    };
    add(parts.shell, shellMat);
    add(parts.trim, trimMat);
    add(parts.visor, visorMat);
    add(parts.led, ledMat);
    add(parts.eye, eyeMat, 0, eyeMatrices);
    add(parts.flame, flameMat, 1, flameMatrices);

    /* --- post: HDR bloom on what's brighter than white ---------------------- */

    const pipeline = new RenderPipeline(renderer);
    const scenePass = pass(scene, camera);
    const color = scenePass.getTextureNode("output");
    const glow = bloom(color, 0.55, 0.35, 1.0);
    // Keep the canvas transparent so the page shows through; bloom adds light over it.
    pipeline.outputNode = vec4(color.rgb.add(glow.rgb), color.a);

    /* --- sizing -------------------------------------------------------------- */

    let halfH = 1;
    let halfW = 1;
    let robotScale = 0.4;
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      halfW = halfH * camera.aspect;
      // About 46px tall on a desktop hero, a little smaller on phones.
      robotScale = ((small ? 34 : 42) / h) * halfH * 2;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    cleanups.push(() => ro.disconnect());

    /* --- swarm ---------------------------------------------------------------- */

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const robots: Robot[] = Array.from({ length: COUNT }, () => ({
      p: new Vector3(rand(-halfW, halfW), rand(-halfH, halfH), rand(-3, 1.5)),
      v: new Vector3(rand(-1, 1), rand(-1, 1), 0).setLength(rand(0.4, 0.8)),
      roll: 0,
      yaw: 0,
      pitch: 0,
      task: -1,
      weight: 0,
      color: IDLE.clone(),
    }));

    const tasks: Array<Task | null> = [null, null];
    let nextTask = 1.2;
    let colorIndex = 0;

    const ringGeometry = new TorusGeometry(1, 0.012, 8, 96);
    const openTask = (slot: number, x: number, y: number) => {
      const c = PALETTE[colorIndex++ % PALETTE.length];
      const ringMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
      const ringColor = uniform(new Color(c[0], c[1], c[2]));
      const ringStrength = uniform(0);
      ringMaterial.colorNode = ringColor.mul(2.2);
      ringMaterial.opacityNode = ringStrength;
      const ring = new Mesh(ringGeometry, ringMaterial);
      ring.userData = { ringStrength };
      ring.position.set(x, y, 0);
      scene.add(ring);
      const task: Task = { p: new Vector3(x, y, 0), color: new Color(c[0], c[1], c[2]), age: 0, life: rand(8, 11), done: -1, ring, ringMaterial };
      tasks[slot] = task;
      // The nearest idle robots form its crew.
      robots
        .filter((r) => r.task < 0)
        .sort((a, b) => a.p.distanceToSquared(task.p) - b.p.distanceToSquared(task.p))
        .slice(0, small ? 7 : 12)
        .forEach((r) => (r.task = slot));
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2 * halfW;
      const y = -((e.clientY - rect.top) / rect.height - 0.5) * 2 * halfH;
      const slot = tasks.findIndex((t) => !t);
      if (slot >= 0) openTask(slot, x, y);
    };
    canvas.addEventListener("click", onClick);
    cleanups.push(() => canvas.removeEventListener("click", onClick));

    const steer = new Vector3();
    const sep = new Vector3();
    const ali = new Vector3();
    const coh = new Vector3();
    const tmp = new Vector3();
    const m = new Matrix4();
    const q = new Quaternion();
    const euler = new Euler(0, 0, 0, "YXZ");
    const scale = new Vector3();
    const local = new Matrix4();
    const out = new Matrix4();
    let clock = 0;

    let last = performance.now();
    let frames = 0;
    let windowStart = last;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      clock += dt;

      // Tasks: open one every so often somewhere clear of the name, run them, close them.
      nextTask -= dt;
      if (nextTask <= 0) {
        nextTask = rand(4, 7);
        const slot = tasks.findIndex((t) => !t);
        if (slot >= 0) openTask(slot, rand(-halfW * 0.1, halfW * 0.8), rand(-halfH * 0.6, halfH * 0.1));
      }
      tasks.forEach((t, slot) => {
        if (!t) return;
        t.age += dt;
        const strength = t.ring.userData.ringStrength as { value: number };
        if (t.done < 0) {
          strength.value = Math.min(1, t.age) * (0.35 + 0.1 * Math.sin(t.age * 3));
          t.ring.scale.setScalar(0.75 + 0.03 * Math.sin(t.age * 2));
          if (t.age > t.life) {
            t.done = 0;
            for (const r of robots) if (r.task === slot) r.task = -1;
          }
        } else {
          // Completion: a pulse that swells out past the crew and fades.
          t.done += dt;
          const k = Math.min(1, t.done / 1.4);
          t.ring.scale.setScalar(0.75 + 2.2 * (1 - (1 - k) ** 3));
          strength.value = (1 - k) * 0.9;
          if (k >= 1) {
            scene.remove(t.ring);
            t.ringMaterial.dispose();
            tasks[slot] = null;
          }
        }
      });

      // Boids in the hero's plane, plus an orbit round the robot's task.
      for (const r of robots) {
        sep.set(0, 0, 0);
        ali.set(0, 0, 0);
        coh.set(0, 0, 0);
        let n = 0;
        for (const o of robots) {
          if (o === r) continue;
          tmp.subVectors(r.p, o.p);
          tmp.z *= 0.5;
          const d2 = tmp.lengthSq();
          if (d2 < 0.55) sep.addScaledVector(tmp, 1 / Math.max(d2, 0.01));
          if (d2 < 1.6) {
            ali.add(o.v);
            coh.add(o.p);
            n++;
          }
        }
        steer.copy(sep).multiplyScalar(0.09);
        if (n) {
          steer.addScaledVector(ali.divideScalar(n).sub(r.v), 0.4);
          steer.addScaledVector(coh.divideScalar(n).sub(r.p), 0.05);
        }

        const task = r.task >= 0 ? tasks[r.task] : null;
        if (task && task.done < 0) {
          // Orbit: pull to the ring, swing round it.
          tmp.subVectors(task.p, r.p);
          tmp.z = 0;
          const d = tmp.length();
          const radius = 0.75;
          steer.addScaledVector(tmp.normalize(), (d - radius) * 2.2);
          steer.add(new Vector3(-tmp.y, tmp.x, 0).multiplyScalar(1.6));
          r.weight = Math.min(1, r.weight + dt * 1.2 * (d < 1.4 ? 1 : 0.2));
          r.color.lerp(task.color, Math.min(1, dt * 2));
        } else {
          r.weight = Math.max(0, r.weight - dt * 0.35);
        }

        // Stay on screen (with a margin) and near the plane.
        const mx = halfW * 0.92;
        const my = halfH * 0.88;
        if (r.p.x < -mx) steer.x += (-mx - r.p.x) * 3;
        if (r.p.x > mx) steer.x -= (r.p.x - mx) * 3;
        if (r.p.y < -my) steer.y += (-my - r.p.y) * 3;
        if (r.p.y > my) steer.y -= (r.p.y - my) * 3;
        steer.z += (-0.7 - r.p.z) * 0.08;

        r.v.addScaledVector(steer, dt);
        const speed = r.v.length();
        const max = task ? 1.8 : 0.9;
        if (speed > max) r.v.multiplyScalar(max / speed);
        if (speed < 0.3) r.v.multiplyScalar(0.3 / Math.max(speed, 1e-3));
        r.p.addScaledVector(r.v, dt);

        // Lean into the direction of travel, turn a little towards it, nose down when climbing.
        const k = 1 - Math.exp(-dt * 5);
        r.roll += (Math.max(-0.9, Math.min(0.9, -r.v.x * 0.55)) - r.roll) * k;
        r.yaw += (Math.max(-0.7, Math.min(0.7, r.v.x * 0.5)) - r.yaw) * k;
        r.pitch += (Math.max(-0.5, Math.min(0.5, -r.v.y * 0.35)) - r.pitch) * k;
      }

      robots.forEach((r, i) => {
        euler.set(r.pitch, r.yaw, r.roll);
        q.setFromEuler(euler);
        scale.setScalar(robotScale);
        m.compose(r.p, q, scale);
        m.toArray(matrices.array, i * 16);
        tintData.set([r.color.r, r.color.g, r.color.b, r.weight], i * 4);
        // The scanner sweeps side to side across the visor, quicker while working.
        const scan = 0.2 * Math.sin(clock * (1.4 + 2.6 * r.weight) + i * 0.37);
        out.multiplyMatrices(m, local.makeTranslation(scan, 0, 0)).toArray(eyeMatrices.array, i * 16);
        // The exhaust stretches down from the nozzles with speed, flickering.
        const burn = (0.7 + Math.min(0.7, r.v.length() * 0.45)) * (0.88 + 0.12 * Math.sin(clock * 31 + i * 1.7));
        local.makeTranslation(0, NOZZLE_Y, 0).multiply(new Matrix4().makeScale(1, burn, 1)).multiply(new Matrix4().makeTranslation(0, -NOZZLE_Y, 0));
        out.multiplyMatrices(m, local).toArray(flameMatrices.array, i * 16);
      });
      matrices.needsUpdate = true;
      eyeMatrices.needsUpdate = true;
      flameMatrices.needsUpdate = true;
      tintAttr.needsUpdate = true;

      pipeline.render();

      frames++;
      if (now - windowStart >= 1000) {
        onStats({ backend, robots: COUNT, tasks: tasks.filter(Boolean).length, fps: Math.round((frames * 1000) / (now - windowStart)) });
        frames = 0;
        windowStart = now;
      }
    };
    frame = requestAnimationFrame(tick);
  })().catch((error: Error) => console.error("[lab] robots3d failed", error));

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    for (const fn of cleanups) fn();
  };
}
