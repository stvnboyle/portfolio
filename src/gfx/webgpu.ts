import { DAMPING, MAX_DROPS, WAVE_C2, type Grid } from "./field";
import { WGSL_RENDER, WGSL_SIMULATE } from "./shaders";
import type { Renderer } from "./types";

const SIM_BYTES = 96;
const VIEW_BYTES = 112;
const CLEAR = { r: 0.039, g: 0.039, b: 0.043, a: 1 };

export async function createWebGPURenderer(canvas: HTMLCanvasElement, grid: Grid): Promise<Renderer> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error("navigator.gpu unavailable");
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("no WebGPU adapter");

  const device = await adapter.requestDevice();
  // The render pass reads heights from a storage buffer in the vertex stage,
  // which compatibility-mode devices don't allow.
  if (device.limits.maxStorageBuffersPerShaderStage < 2) {
    device.destroy();
    throw new Error("storage buffers unavailable in the vertex stage");
  }

  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("no webgpu canvas context");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  const simulateModule = device.createShaderModule({ code: WGSL_SIMULATE, label: "wave-simulate" });
  const renderModule = device.createShaderModule({ code: WGSL_RENDER, label: "wave-render" });
  // An invalid module otherwise yields pipelines that fail silently every
  // frame. Throwing here lets the engine fall back to WebGL2 instead.
  for (const module of [simulateModule, renderModule]) {
    const { messages } = await module.getCompilationInfo();
    const errors = messages.filter((m) => m.type === "error");
    if (errors.length) {
      device.destroy();
      throw new Error(`WGSL: ${errors.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join("; ")}`);
    }
  }

  const cells = grid.gx * grid.gz;
  const heights = [0, 1].map(() =>
    device.createBuffer({ size: cells * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
  );
  const simBuffer = device.createBuffer({ size: SIM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const viewBuffer = device.createBuffer({ size: VIEW_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const simulatePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: simulateModule, entryPoint: "step" },
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
            // Premultiplied "over": discs overlap softly at the horizon.
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  // stepGroups[k] reads heights[k] and writes the next state into the other
  // buffer; renderGroups[k] draws from heights[k].
  const stepGroups = [0, 1].map((k) =>
    device.createBindGroup({
      layout: simulatePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: simBuffer } },
        { binding: 1, resource: { buffer: heights[k] } },
        { binding: 2, resource: { buffer: heights[1 - k] } },
      ],
    })
  );
  const renderGroups = [0, 1].map((k) =>
    device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: viewBuffer } },
        { binding: 1, resource: { buffer: heights[k] } },
      ],
    })
  );

  let latest = 0;
  const simData = new ArrayBuffer(SIM_BYTES);
  const simU32 = new Uint32Array(simData);
  const simF32 = new Float32Array(simData);

  return {
    kind: "webgpu",
    grid,

    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
    },

    render({ view, steps, drops }) {
      for (let s = 0; s < steps; s++) {
        const injected = s === 0 ? drops.slice(0, MAX_DROPS) : [];
        simU32[0] = grid.gx;
        simU32[1] = grid.gz;
        simU32[2] = injected.length;
        simF32[3] = DAMPING;
        simF32[4] = WAVE_C2;
        injected.forEach((d, i) => simF32.set([d.x, d.z, d.radius, d.amp], 8 + i * 4));
        device.queue.writeBuffer(simBuffer, 0, simData);

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(simulatePipeline);
        pass.setBindGroup(0, stepGroups[latest]);
        pass.dispatchWorkgroups(Math.ceil(grid.gx / 16), Math.ceil(grid.gz / 16));
        pass.end();
        device.queue.submit([encoder.finish()]);
        latest = 1 - latest;
      }

      device.queue.writeBuffer(viewBuffer, 0, view);
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          { view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: CLEAR },
        ],
      });
      pass.setPipeline(renderPipeline);
      pass.setBindGroup(0, renderGroups[latest]);
      pass.draw(6, cells);
      pass.end();
      device.queue.submit([encoder.finish()]);
    },

    destroy() {
      heights.forEach((b) => b.destroy());
      simBuffer.destroy();
      viewBuffer.destroy();
      context.unconfigure();
      device.destroy();
    },
  };
}
