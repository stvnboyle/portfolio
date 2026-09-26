/**
 * In-page navigation for the home page: a quick eased "seek" to a section in
 * place of the browser's smooth scroll, with the nav's breadcrumb typing out
 * the section's path (as the post bar shows /writing/<slug>) and the
 * section's `// eyebrow` decoding in when it lands.
 */

import { drawRobot } from "@/gfx/strays";
import { drawRay, fitCanvas, RIDE_BEHIND } from "@/gfx/ray";
import type { Rgb } from "@/gfx/palette";

/** Characters an eyebrow cycles through before it settles. */
const GLYPHS = "01<>/\\[]{}=+*#_-";
const TYPE_MS = 22;
const DECODE_MS = 520;
const DECODE_STEP_MS = 40;

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* --- breadcrumb: the nav's shell prompt ----------------------------------- */

const typing = new WeakMap<HTMLElement, number>();

/** Types `el`'s text over to `text`, backspacing to the common prefix first. */
function typeInto(el: HTMLElement | null, text: string) {
  if (!el) return;
  window.clearInterval(typing.get(el));
  if (calm()) {
    el.textContent = text;
    return;
  }
  const timer = window.setInterval(() => {
    const shown = el.textContent ?? "";
    if (shown === text) window.clearInterval(timer);
    else if (!text.startsWith(shown)) el.textContent = shown.slice(0, -1);
    else el.textContent = text.slice(0, shown.length + 1);
  }, TYPE_MS);
  typing.set(el, timer);
}

let current: string | null = null;

/** Marks `id` as the section in view: the prompt's command and path, and the nav link's aria-current. */
export function setSection(id: string) {
  if (id === current) return;
  current = id;
  // At the root the prompt is just the site; in a section it has cd'd into it.
  typeInto(document.querySelector(".nav .nav__cmd"), id === "top" ? "" : "cd ");
  typeInto(document.querySelector(".nav__path"), id === "top" ? "" : `/${id}`);
  document.querySelectorAll<HTMLAnchorElement>(".nav__links a").forEach((a) => {
    if (a.hash === `#${id}`) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
}

/* --- eyebrow decode ------------------------------------------------------- */

const decoding = new WeakMap<HTMLElement, number>();

/** Scrambles `el`'s text and resolves it left to right. */
export function decode(el: HTMLElement) {
  if (calm()) return;
  const text = (el.dataset.text ??= el.textContent ?? "");
  window.clearInterval(decoding.get(el));
  const started = performance.now();
  const timer = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - started) / DECODE_MS);
    const settled = Math.floor(k * text.length);
    el.textContent =
      text.slice(0, settled) +
      [...text.slice(settled)].map((c) => (c === " " ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join("");
    if (k >= 1) window.clearInterval(timer);
  }, DECODE_STEP_MS);
  decoding.set(el, timer);
}

/* --- seek ----------------------------------------------------------------- */

let seeking = false;
let frame = 0;

/** True while a seek is travelling, so the scroll spy leaves the breadcrumb alone. */
export const isSeeking = () => seeking;

const easeInOutQuint = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);

/* --- the travel ray ----------------------------------------------------------- */

/** Each section's colour, for the ray and the robot riding it: the glow colours, and orange for contact. */
const TONES: Record<string, Rgb> = {
  top: [0.1, 0.92, 0.82],
  about: [1, 0.24, 0.6],
  timeline: [0.58, 0.31, 1],
  projects: [0.16, 0.48, 1],
  writing: [0.1, 0.92, 0.82],
  contact: [1, 0.62, 0.12],
};
/** The riding robot's height, px. */
const RAY_ROBOT = 15;
/** Seconds for the robot to fly off the end once the seek lands, while the ray fades. */
const COAST = 0.55;

let rayFrame = 0;

/**
 * A light ray along the bottom of the nav while a seek travels, in the colour
 * of where it's going, warming from the colour of where it left, with one of
 * the hero's robots riding its head. `progress` returns 0..1 while travelling
 * and null once landed, when the robot carries on off the end as the ray fades.
 */
function flyRay(from: Rgb, to: Rgb, progress: () => number | null) {
  const canvas = document.querySelector<HTMLCanvasElement>(".nav__ray");
  const c = canvas?.getContext("2d");
  if (!canvas || !c) return;
  cancelAnimationFrame(rayFrame);
  let last = performance.now();
  let head = 0;
  let velocity = 0;
  let landed: number | null = null;
  let time = 0;

  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    time += dt;
    const [width, height] = fitCanvas(canvas, c);
    const p = progress();
    let fade = 1;
    const before = head;
    if (p !== null && landed === null) {
      head = 12 + p * (width - 24);
    } else {
      landed ??= time;
      const s = time - landed;
      if (s > COAST) {
        c.clearRect(0, 0, width, height);
        return;
      }
      // Off the end, speeding up.
      head += (Math.max(velocity, 300) + 2400 * s) * dt;
      fade = 1 - s / COAST;
    }
    velocity += ((head - before) / Math.max(dt, 1e-3) - velocity) * (1 - Math.exp(-dt * 10));

    const y = height / 2;
    drawRay(c, 0, head - RAY_ROBOT * RIDE_BEHIND, y, from, to, fade);
    drawRobot(c, head, y + 1.2 * Math.sin(time * 2.4), {
      vx: Math.max(-90, Math.min(90, velocity / 6)) + 8,
      vy: 0,
      tint: to,
      weight: 1,
      alpha: 1,
      time,
      seed: 0,
      size: RAY_ROBOT,
    });
    rayFrame = requestAnimationFrame(tick);
  };
  rayFrame = requestAnimationFrame(tick);
}

/**
 * Scrolls to the section `hash` names ("#top" for the hero). Returns false when
 * there's no such section, so the caller can let the browser handle the link.
 */
export function seek(hash: string) {
  const id = hash.slice(1);
  const target = id === "top" ? document.body : document.getElementById(id);
  if (!id || !target) return false;

  const root = document.documentElement;
  const offset = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
  const max = root.scrollHeight - window.innerHeight;
  const from = window.scrollY;
  const to = id === "top" ? 0 : Math.max(0, Math.min(max, target.getBoundingClientRect().top + from - offset));
  const distance = to - from;

  if (location.hash !== hash) history.pushState(null, "", hash);
  const head = TONES[id] ?? TONES.top;
  const left = TONES[current ?? "top"] ?? TONES.top;
  // Between two sections of the same colour, the ray still warms through another.
  const tail = left !== head ? left : head === TONES.timeline ? TONES.about : TONES.timeline;
  const tones = [tail, head] as const;
  setSection(id);
  cancelAnimationFrame(frame);

  let travelled: number | null = 0;
  const land = () => {
    seeking = false;
    travelled = null;
    const eyebrow = target.querySelector<HTMLElement>(".section__eyebrow");
    if (eyebrow) decode(eyebrow);
    stopListening();
  };

  // Any wheel, touch or key from the reader takes the scroll back.
  const interrupt = () => {
    cancelAnimationFrame(frame);
    land();
  };
  const stopListening = () => {
    window.removeEventListener("wheel", interrupt);
    window.removeEventListener("touchstart", interrupt);
    window.removeEventListener("keydown", interrupt);
  };

  if (calm() || Math.abs(distance) < 2) {
    window.scrollTo({ top: to, behavior: "instant" });
    land();
    return true;
  }

  // Longer hops take a little longer, but never drag.
  const duration = Math.min(1100, 420 + Math.sqrt(Math.abs(distance)) * 7);
  const started = performance.now();
  seeking = true;
  flyRay(tones[0], tones[1], () => travelled);
  // From the first frame on, so the key or tap that started the seek doesn't cancel it.
  let listening = false;

  const step = (now: number) => {
    if (!listening) {
      listening = true;
      window.addEventListener("wheel", interrupt, { passive: true });
      window.addEventListener("touchstart", interrupt, { passive: true });
      window.addEventListener("keydown", interrupt);
    }
    const t = Math.min(1, (now - started) / duration);
    window.scrollTo({ top: from + distance * easeInOutQuint(t), behavior: "instant" });
    travelled = t;
    if (t < 1) frame = requestAnimationFrame(step);
    else land();
  };
  frame = requestAnimationFrame(step);
  return true;
}

/**
 * A click handler for the document: in-page links (href="#…") seek instead of
 * jumping, on any page. The skip link keeps the browser's own jump.
 */
export function seekOnClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!link || link.classList.contains("skip-link")) return;
  if (seek(link.hash)) e.preventDefault();
}
