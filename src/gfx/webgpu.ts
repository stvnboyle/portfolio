import { WGSL } from "./shaders";
import { UNIFORM_FLOATS, type Renderer } from "./types";

const SCATTER_FORMAT: GPUTextureFormat = "rgba16float";

export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error("navigator.gpu unavailable");
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("no WebGPU adapter");

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("no webgpu canvas context");

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  const module = device.createShaderModule({ code: WGSL, label: "light-field" });
  // An invalid module otherwise yields pipelines that fail silently every
  // frame. Throwing here lets the engine fall back to WebGL2 instead.
  const { messages } = await module.getCompilationInfo();
  const errors = messages.filter((m) => m.type === "error");
  if (errors.length) {
    device.destroy();
    throw new Error(`WGSL: ${errors.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join("; ")}`);
  }

  const pipeline = (entryPoint: string, target: GPUTextureFormat) =>
    device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint, targets: [{ format: target }] },
      primitive: { topology: "triangle-list" },
    });
  const scatterPipeline = pipeline("fsScatter", SCATTER_FORMAT);
  const compositePipeline = pipeline("fsComposite", format);

  const uniformBuffer = device.createBuffer({
    size: UNIFORM_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  let mask: GPUTexture | null = null;
  let scatter: GPUTexture | null = null;
  let scatterGroup: GPUBindGroup | null = null;
  let compositeGroup: GPUBindGroup | null = null;

  // "auto" layouts only contain the bindings each entry point actually reads,
  // so the two passes get separate groups.
  function rebind() {
    if (!mask || !scatter) return;
    scatterGroup = device.createBindGroup({
      layout: scatterPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: mask.createView() },
      ],
    });
    compositeGroup = device.createBindGroup({
      layout: compositePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 3, resource: scatter.createView() },
      ],
    });
  }

  function upload(source: HTMLCanvasElement): GPUTexture {
    const texture = device.createTexture({
      size: [source.width, source.height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source }, { texture }, [source.width, source.height]);
    return texture;
  }

  return {
    kind: "webgpu",

    resize(width, height, scatterWidth, scatterHeight) {
      canvas.width = width;
      canvas.height = height;
      scatter?.destroy();
      scatter = device.createTexture({
        size: [scatterWidth, scatterHeight],
        format: SCATTER_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      rebind();
    },

    setMask(source) {
      mask?.destroy();
      mask = upload(source);
      rebind();
    },

    render(uniforms) {
      if (!scatter || !scatterGroup || !compositeGroup) return;
      device.queue.writeBuffer(uniformBuffer, 0, uniforms);
      const encoder = device.createCommandEncoder();

      const pass = (view: GPUTextureView, pipe: GPURenderPipeline, group: GPUBindGroup) => {
        const p = encoder.beginRenderPass({
          colorAttachments: [
            { view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } },
          ],
        });
        p.setPipeline(pipe);
        p.setBindGroup(0, group);
        p.draw(3);
        p.end();
      };

      pass(scatter.createView(), scatterPipeline, scatterGroup);
      pass(context.getCurrentTexture().createView(), compositePipeline, compositeGroup);
      device.queue.submit([encoder.finish()]);
    },

    destroy() {
      mask?.destroy();
      scatter?.destroy();
      uniformBuffer.destroy();
      context.unconfigure();
      device.destroy();
    },
  };
}
