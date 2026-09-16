export type Mask = {
  /** Blurred glyph coverage the rays march through. */
  canvas: HTMLCanvasElement;
  /** Bounds of the drawn glyphs, in 0..1 canvas UV. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
};

/**
 * Rasterises `text` into a low-resolution occlusion mask aligned with `host`.
 *
 * Each character is drawn at the position the DOM laid it out, read back via
 * a Range, so the shadows match the real heading — kerning, tracking, line
 * breaks and all — without re-implementing text layout on a canvas.
 */
export function buildMask(host: HTMLElement, text: HTMLElement, scale: number): Mask {
  const hostRect = host.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(hostRect.width * scale));
  canvas.height = Math.max(1, Math.round(hostRect.height * scale));

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(canvas.width / hostRect.width, canvas.height / hostRect.height);
  ctx.fillStyle = "#fff";
  // Softens penumbrae and widens thin strokes so coarse ray steps can't skip
  // them. Browsers without canvas filters just get slightly harder shadows.
  ctx.filter = "blur(3px)";

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

  return {
    canvas,
    bounds: Number.isFinite(x0)
      ? {
          x0: x0 / hostRect.width,
          y0: y0 / hostRect.height,
          x1: x1 / hostRect.width,
          y1: y1 / hostRect.height,
        }
      : { x0: 0.1, y0: 0.4, x1: 0.6, y1: 0.55 },
  };
}
