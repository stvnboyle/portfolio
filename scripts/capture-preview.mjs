// Captures the home page's link preview (src/app/opengraph-image.png and twitter-image.png) from
// the live hero, in a "poster" framing: no nav links or HUD, the name bigger and centred, its
// letters held at full colour, and the domain underneath. Rendered at 2× (2400×1260).
//
// The swarm is random, so it saves a few frames around the moment the circuit is fully lit;
// pick one and copy it over both images.
//
//   npm run build && python3 -m http.server 4173 -d out
//   node scripts/capture-preview.mjs            # → preview-<ms>.png in the current directory
//
// LIT picks which letters of the name stay charged, as 1-based positions ignoring the space
// ("7-11" is Boyle, "1,4,9" three scattered letters); the rest cool to plain white, or to a dim
// unpowered grey with UNLIT=dim. Unset, every letter is charged.
//
//   LIT=1-4 UNLIT=dim node scripts/capture-preview.mjs   # the current image: "Stev" mid-charge
//
// PLAYWRIGHT_CORE points at a playwright-core install (default: the one under ~/git-good).
import { homedir } from "node:os";

const core =
  process.env.PLAYWRIGHT_CORE ??
  `${homedir()}/git-good/node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core/index.mjs`;
const { chromium } = await import(core);

const URL = process.env.URL ?? "http://localhost:4173/";
/** Ms after load: the robots have wired up every letter and pulses are running round the ring. */
const FRAMES = [2900, 3100, 3300, 3500];

const POSTER = `
  .hero__hud, .vitals, .task-label, .nav__links, .nav .kbd-button, .nav__ray { display: none !important; }
  .nav { position: fixed !important; top: auto !important; bottom: 34px; left: 0; right: 0;
         background: none !important; border: 0 !important; backdrop-filter: none !important; }
  .nav__inner { display: flex !important; justify-content: center !important; }
  .nav__brand { font-size: 1.25rem; margin: 0 auto; }
  :root { --text-display: 8.5rem; }
  .hero__inner { padding-top: 150px; display: flex; flex-direction: column; align-items: center; }
  .hero__eyebrow { font-size: 1.4rem; }
  /* Charged letters stay in their robot's colour instead of cooling to white. */
  .hero .hero__name [data-g] { --cool: 0.12 !important; --fill: 1 !important; }
`;

/** "1,4,7-11" → [1, 4, 7, 8, 9, 10, 11]. */
const positions = (spec) =>
  spec.split(",").flatMap((part) => {
    const [from, to = from] = part.split("-").map(Number);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  });

/** Mirrors profile.name, which the hero splits into one .glow-word per word (GlowHeadings). */
const NAME = "Steven Boyle";

/** Settles the letters LIT leaves out: white with no glow, or dim grey with UNLIT=dim. */
function unlitCss(spec, dim) {
  const lit = new Set(positions(spec));
  const words = NAME.split(" ");
  return words
    .flatMap((word, w) => [...word].map((_, i) => ({ n: words.slice(0, w).join("").length + i + 1, w, i })))
    .filter(({ n }) => !lit.has(n))
    .map(
      ({ w, i }) =>
        `.hero .hero__name .glow-word:nth-of-type(${w + 1}) [data-g]:nth-child(${i + 1}) { --cool: 1 !important;${
          dim ? " --fg: #3b3d4a;" : ""
        } }`,
    )
    .join("\n");
}

const LIT = process.env.LIT;
const DIM = process.env.UNLIT === "dim";
const css = POSTER + (LIT ? unlitCss(LIT, DIM) : "");
/** Filename suffix, so variants don't overwrite each other. */
const tag = LIT ? `-${LIT.replaceAll(",", "_")}${DIM ? "-dim" : ""}` : "";

const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--use-angle=metal"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
// Before the swarm lays the circuit out round the name, so it wires up the poster's layout.
await page.addInitScript((css) => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
  });
}, css);
await page.goto(URL, { waitUntil: "networkidle" });

const field = await page.evaluate(() => document.querySelector(".hero")?.dataset.field);
if (field !== "live") console.warn(`hero field is "${field}", not "live": is WebGPU available?`);

let at = 0;
for (const ms of FRAMES) {
  await page.waitForTimeout(ms - at);
  at = ms;
  await page.screenshot({ path: `preview${tag}-${ms}.png` });
  console.log(`preview${tag}-${ms}.png`);
}
await browser.close();
