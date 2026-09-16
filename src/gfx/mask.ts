export type Masks = {
  /** Glyphs at output resolution — used for the letterforms and their rim light. */
  full: HTMLCanvasElement;
  /** Downsampled and blurred — what the rays march through. */
  soft: HTMLCanvasElement;
  /** CPU copy of the soft mask, for occlusion tests at each emitter. */
  softPixels: Uint8ClampedArray;
  softWidth: number;
  softHeight: number;
  /** Bounds of the drawn glyphs, in 0..1 canvas UV. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
};

/**
 * Rasterises `text` into occlusion masks aligned with `host`.
 *
 * Each character is drawn at the position the DOM laid it out, read back via
 * a Range, so the mask matches the real heading exactly — kerning, tracking,
 * line breaks and all — without re-implementing text layout on a canvas.
 */
export function buildMasks(
  host: HTMLElement,
  text: HTMLElement,
  width: number,
  height: number,
  softScale: number
): Masks {
  const hostRect = host.getBoundingClientRect();
  const sx = width / hostRect.width;
  const sy = height / hostRect.height;

  const full = document.createElement("canvas");
  full.width = width;
  full.height = height;
  const ctx = full.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.scale(sx, sy);
  ctx.fillStyle = "#fff";

  const style = getComputedStyle(text);
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const probe = ctx.measureText("Hg");
  const size = parseFloat(style.fontSize);
  const ascent = probe.fontBoundingBoxAscent || size * 0.92;
  const descent = probe.fontBoundingBoxDescent || size * 0.22;
  const ascentRatio = ascent / (ascent + descent);

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;

  const range = document.createRange();
  const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const data = node.textContent ?? "";
    for (let i = 0; i < data.length; i++) {
      if (/\s/.test(data[i])) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width) continue;

      const left = r.left - hostRect.left;
      const top = r.top - hostRect.top;
      // An inline box's content area spans ascent + descent, so the baseline
      // sits at the same proportion down the character's rect.
      ctx.fillText(data[i], left, top + r.height * ascentRatio);

      x0 = Math.min(x0, left);
      y0 = Math.min(y0, top);
      x1 = Math.max(x1, left + r.width);
      y1 = Math.max(y1, top + r.height);
    }
  }

  const softWidth = Math.max(1, Math.round(hostRect.width * softScale));
  const softHeight = Math.max(1, Math.round(hostRect.height * softScale));
  const soft = document.createElement("canvas");
  soft.width = softWidth;
  soft.height = softHeight;
  const sctx = soft.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingQuality = "high";
  // Softens penumbrae and widens thin strokes so coarse ray steps can't skip
  // them. Browsers without canvas filters just get slightly harder shadows.
  sctx.filter = "blur(1px)";
  sctx.drawImage(full, 0, 0, softWidth, softHeight);
  sctx.filter = "none";

  const hasGlyphs = Number.isFinite(x0);

  return {
    full,
    soft,
    softPixels: sctx.getImageData(0, 0, softWidth, softHeight).data,
    softWidth,
    softHeight,
    bounds: hasGlyphs
      ? {
          x0: x0 / hostRect.width,
          y0: y0 / hostRect.height,
          x1: x1 / hostRect.width,
          y1: y1 / hostRect.height,
        }
      : { x0: 0.2, y0: 0.35, x1: 0.8, y1: 0.65 },
  };
}

/** Occlusion (0..1) of the soft mask at a UV coordinate. */
export function sampleMask(masks: Masks, u: number, v: number): number {
  const x = Math.floor(u * masks.softWidth);
  const y = Math.floor(v * masks.softHeight);
  if (x < 0 || y < 0 || x >= masks.softWidth || y >= masks.softHeight) return 0;
  return masks.softPixels[(y * masks.softWidth + x) * 4] / 255;
}
