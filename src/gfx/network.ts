import { MAX_INTRO, type Intro } from "./intro";
import type { Rgb } from "./palette";
import { seeded } from "./random";

type Vec4 = [number, number, number, number];

/**
 * Robots in the network, one per run of letters, left to right. Where there's
 * room (desktop) they're spread around the name: left of it, below, above the
 * right-hand letters (clear of the roles line) and right of it. Otherwise they
 * hang below it at staggered heights.
 */
const NODES = 4;
/** Seconds: the robots fly in, the wires trace out from them, then the pulses start. */
const FLY_IN = 1.1;
const WIRE = 0.8;
/** Pulses a letter takes to charge, how often each robot sends one, and how fast they travel (px/s). */
const PULSES = 4;
const SEND_EVERY = 0.2;
const SPEED = 420;
/** Seconds for a charged letter to cool to white, and for the wires to fade once every letter's charged. */
const COOL = 0.9;
const FADE = 0.8;
/** How far a letter's fill eases towards its charge each second. */
const FILL_RATE = 7;
/** Room a robot needs beside the name to sit there, px. */
const SIDE_ROOM = 110;
/** Diagonal corner cut on the traces, px. */
const CHAMFER = 6;
/** Gap between a letter's trace and the second trace running alongside it (every other letter), px. */
const PAIR_GAP = 3.5;
/** Seconds between idle pulses along the extra traces, while the letters charge. */
const IDLE_EVERY = 0.12;
/** Seconds between pulses along the power ring, once it's traced out. */
const RING_EVERY = 0.09;
/**
 * After this long since navigation the CSS fallback has already shown the
 * name (see .hero[data-intro] in globals.css), so the intro is skipped rather
 * than hiding it again.
 */
const LATEST_START_MS = 2000;

/** One colour per robot, left to right. Mirrors --glow-1..4 in globals.css. */
const COLOURS: Rgb[] = [
  [1, 0.24, 0.6],
  [0.58, 0.31, 1],
  [0.16, 0.48, 1],
  [0.1, 0.92, 0.82],
];
const SVG = "http://www.w3.org/2000/svg";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const zeros = (): Vec4[] => Array.from({ length: MAX_INTRO }, () => [0, 0, 0, 0]);
const css = (c: Rgb, a = 1) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")} / ${a})`;

type Wire = { node: number; letter: HTMLElement; path: SVGPathElement; pad: SVGCircleElement; hits: number; shown: number; charged: number | null };
/**
 * The rest of the board: stubs that branch
 * off each robot to a via, and a second trace alongside every other letter's.
 * They carry idle pulses but charge nothing.
 */
type Trace =
  | { kind: "stub"; node: number; path: SVGPathElement; via: SVGCircleElement; side: number; drop: number; reach: number }
  | { kind: "pair"; node: number; path: SVGPathElement; wire: Wire };
/**
 * The power ring: a trace from each robot to the next, all the way round, so
 * the four are wired together and pass power between them while they work.
 * Each segment shades from one robot's colour to the other's.
 */
type Ring = { path: SVGPathElement; gradient: SVGLinearGradientElement };
/**
 * A pulse on its way along a path; `wire` is set for the ones that charge a
 * letter, and `reverse` for ring pulses running from a segment's far end.
 */
type Pulse = { path: SVGPathElement; wire: Wire | null; sent: number; speed: number; dot: SVGGElement; reverse: boolean };
/** A robot's spot, which side of the name its traces feed the letters from, and the way it came in (and leaves). */
type Node = { x: number; y: number; feed: "below" | "above"; out: [number, number] };

/**
 * The name's entrance, wired up. Four robots fly in and take up spots around
 * the name like nodes on a board (see NODES), and circuit traces run from each to the
 * letters it looks after. The robots are wired to each other too, in a power
 * ring round the name with pulses flowing both ways along it, so the four
 * work as one; stubs off to vias, paired traces and solder pads fill out a
 * busy board. Then they send pulses down the wires, a few at a time, while
 * idle pulses run about the rest of the board: each pulse that lands on a
 * letter charges it a step, filling it up from
 * the side its trace comes in from, in the robot's colour, and a fully charged letter cools to
 * white. Once every letter's lit the traces fade and the robots fly off.
 *
 * The robots are scripted here and written into the GPU swarm (agents.wgsl)
 * each step. The traces and pulses are SVG in the hero's overlay, so they stay
 * crisp; the letters are CSS, driven per letter (GlowHeadings splits the name
 * into [data-g] spans) by --fill, --hot, --base and --cool, in the printed
 * style (.hero[data-print] in globals.css).
 */
export function createNetwork(hero: HTMLElement, canvas: HTMLCanvasElement, enabled: boolean, robot: number): Intro {
  const name = hero.querySelector<HTMLElement>(".hero__name");
  const overlay = hero.querySelector<HTMLElement>(".hero__overlay");
  const letters = name ? [...name.querySelectorAll<HTMLElement>("[data-g]")] : [];
  const intro: Intro = { at: zeros(), tint: zeros(), count: 0, beams: zeros(), beamTint: zeros(), update };

  let t = 0;
  let running = enabled && letters.length > 0 && Boolean(overlay) && performance.now() < LATEST_START_MS;
  if (!running || !name || !overlay) return intro;
  hero.dataset.intro = "etching";
  hero.dataset.print = "";

  const random = seeded(31);
  const svg = document.createElementNS(SVG, "svg");
  svg.classList.add("hero__wires");
  overlay.append(svg);
  // Extra traces under the letter traces, vias and pads on top, pulses over everything.
  const under = document.createElementNS(SVG, "g");
  const over = document.createElementNS(SVG, "g");
  const dots = document.createElementNS(SVG, "g");
  const defs = document.createElementNS(SVG, "defs");
  svg.append(defs, under, over, dots);

  const path = (layer: SVGGElement, node: number, alpha: number) => {
    const el = document.createElementNS(SVG, "path");
    el.setAttribute("stroke", css(COLOURS[node], alpha));
    layer.append(el);
    return el;
  };
  const circle = (node: number, radius: number, filled: boolean) => {
    const el = document.createElementNS(SVG, "circle");
    el.setAttribute("r", String(radius));
    el.setAttribute("fill", filled ? css(COLOURS[node]) : "var(--bg)");
    el.setAttribute("stroke", css(COLOURS[node], 0.7));
    over.append(el);
    return el;
  };

  // Each robot looks after a run of letters, left to right.
  const wires: Wire[] = letters.map((letter, i) => {
    const node = Math.min(NODES - 1, Math.floor((i / letters.length) * NODES));
    return { node, letter, path: path(under, node, 0.4), pad: circle(node, 1.7, true), hits: 0, shown: 0, charged: null };
  });
  // Where each robot's trace meets its bus.
  const junctions = Array.from({ length: NODES }, (_, k) => circle(k, 2.4, false));
  const traces: Trace[] = [
    ...Array.from({ length: NODES * 2 }, (_, i): Trace => {
      const node = i % NODES;
      // The outer robots branch outwards first; everyone gets one each way.
      const side = (i < NODES ? node < NODES / 2 : node >= NODES / 2) ? -1 : 1;
      return {
        kind: "stub",
        node,
        path: path(under, node, 0.2),
        via: circle(node, 2.4, false),
        side,
        drop: 12 + random() * 34,
        reach: 40 + random() * 120,
      };
    }),
    ...wires.filter((_, i) => i % 2 === 0).map((wire): Trace => ({ kind: "pair", node: wire.node, path: path(under, wire.node, 0.16), wire })),
  ];

  // The ring's segments, one fewer than the robots: a chain round the name that joins all four.
  const id = `ring-${Math.random().toString(36).slice(2, 8)}`;
  const ring: Ring[] = Array.from({ length: NODES - 1 }, (_, i) => {
    const gradient = document.createElementNS(SVG, "linearGradient");
    gradient.id = `${id}-${i}`;
    gradient.setAttribute("gradientUnits", "userSpaceOnUse");
    for (const offset of ["0", "1"]) {
      const stop = document.createElementNS(SVG, "stop");
      stop.setAttribute("offset", offset);
      gradient.append(stop);
    }
    defs.append(gradient);
    const el = document.createElementNS(SVG, "path");
    el.classList.add("hero__ring");
    el.setAttribute("stroke", `url(#${gradient.id})`);
    under.append(el);
    return { path: el, gradient };
  });
  let nextRing = 0;

  const pulses: Pulse[] = [];
  const sent = Array.from({ length: NODES }, () => 0);
  // Round robin through each robot's letters, until each has had its pulses.
  const next = Array.from({ length: NODES }, () => 0);
  let nextIdle = 0;
  let allCharged: number | null = null;

  const send = (on: SVGPathElement, node: number, wire: Wire | null, kind: "charge" | "ring" | "idle", reverse = false) => {
    const dot = document.createElementNS(SVG, "g");
    dot.classList.add("hero__pulse");
    dot.style.setProperty("--tone", css(COLOURS[node]));
    // Pulses carrying charge are the biggest, then power on the ring; idle ones are small and dim.
    const size = kind === "charge" ? 1 : kind === "ring" ? 0.85 : 0.7;
    const core = kind === "idle" ? css(COLOURS[node]) : "#fff";
    for (const [radius, fill] of [[4.5 * size, css(COLOURS[node], 0.25)], [2 * size, core]] as const) {
      const dotPart = document.createElementNS(SVG, "circle");
      dotPart.setAttribute("r", String(radius));
      dotPart.setAttribute("fill", fill);
      dot.append(dotPart);
    }
    dots.append(dot);
    const speed = kind === "charge" ? SPEED : SPEED * (kind === "ring" ? 0.8 + random() * 0.3 : 0.6 + random() * 0.5);
    pulses.push({ path: on, wire, sent: t, speed, dot, reverse });
  };

  /** Draws a traced path out from its start as `k` goes 0 → 1. */
  const reveal = (el: SVGPathElement, k: number) => {
    const length = el.getTotalLength();
    el.style.strokeDasharray = `${length}`;
    el.style.strokeDashoffset = `${length * (1 - k)}`;
  };

  /** An orthogonal route with cut corners: vertical from (x0, y0) to `bus`, across to x1, vertical to y1. */
  const route = (x0: number, y0: number, bus: number, x1: number, y1: number) => {
    const dx = x1 - x0;
    const c = Math.abs(dx) < CHAMFER * 2 ? 0 : CHAMFER;
    if (!c) return `M${x0},${y0} V${y1}`;
    const sx = Math.sign(dx);
    const up = Math.sign(bus - y0) || 1;
    const back = Math.sign(y1 - bus) || -1;
    return `M${x0},${y0} V${bus - up * c} L${x0 + sx * c},${bus} H${x1 - sx * c} L${x1},${bus + back * c} V${y1}`;
  };

  function finish() {
    running = false;
    intro.count = 0;
    svg.remove();
    hero.dataset.intro = "done";
    delete hero.dataset.print;
    for (const g of letters) for (const prop of ["--fill", "--angle", "--hot", "--base", "--cool"]) g.style.removeProperty(prop);
  }

  function update(dt: number) {
    if (!running || !name) return;
    t += dt;
    if (allCharged !== null && t > allCharged + Math.max(COOL, FADE) + 0.05) return finish();

    const origin = canvas.getBoundingClientRect();
    const box = name.getBoundingClientRect();
    const left = box.left - origin.left;
    const right = box.right - origin.left;
    const bottom = box.bottom - origin.top;
    const scale = Math.min(1, box.width / 700);

    // Where the robots go: spread around the name if there's room, or all below it.
    const top = box.top - origin.top;
    const middle = (top + bottom) / 2;
    const span = (k: number) => {
      const mine = wires.filter((w) => w.node === k).map((w) => w.letter.getBoundingClientRect());
      if (!mine.length) return [left + (k / NODES) * (right - left), left + ((k + 1) / NODES) * (right - left)];
      return [Math.min(...mine.map((r) => r.left)) - origin.left, Math.max(...mine.map((r) => r.right)) - origin.left];
    };
    const centre = (k: number) => (span(k)[0] + span(k)[1]) / 2;
    const roles = hero.querySelector(".hero__eyebrow")?.getBoundingClientRect();
    const spread =
      left >= SIDE_ROOM &&
      canvas.clientWidth - right >= SIDE_ROOM &&
      (!roles || roles.right - origin.left < span(2)[0] - 24);
    const below = (k: number, drop: number): Node => ({ x: centre(k), y: bottom + drop, feed: "below", out: [0, 1] });
    const nodes: Node[] = spread
      ? [
          { x: left - 70, y: middle + 14, feed: "below", out: [-1, 0.2] },
          below(1, 86),
          { x: centre(2), y: top - 62, feed: "above", out: [0.3, -1] },
          { x: right + 70, y: middle + 14, feed: "below", out: [1, 0.2] },
        ]
      : Array.from({ length: NODES }, (_, k) => ({
          ...below(k, (k % 2 === 0 ? 58 : 92) * Math.max(0.7, scale) + 8),
          out: [k < NODES / 2 ? -0.9 : 0.9, 1] as [number, number],
        }));

    const leaving = allCharged !== null && t > allCharged + 0.2 ? t - allCharged - 0.2 : 0;
    nodes.forEach((n, k) => {
      const bob = 3 * Math.sin(t * 2.4 + k * 1.7);
      let [x, y] = [n.x, n.y + bob];
      let [vx, vy] = [0, 7 * Math.cos(t * 2.4 + k * 1.7)];
      const [ox, oy] = n.out;
      if (t < FLY_IN) {
        // In from its own side, easing out onto its spot.
        const q = t / FLY_IN;
        const ease = 1 - (1 - q) ** 3;
        const from: [number, number] = [n.x + ox * 420, n.y + oy * 320];
        x = from[0] + (x - from[0]) * ease;
        y = from[1] + (y - from[1]) * ease;
        vx = ((n.x - from[0]) * 3 * (1 - q) ** 2) / FLY_IN;
        vy = ((n.y - from[1]) * 3 * (1 - q) ** 2) / FLY_IN;
      } else if (leaving) {
        // And back out the same way, speeding up.
        x += ox * 170 * leaving * leaving;
        y += oy * 170 * leaving * leaving;
        vx = ox * 340 * leaving;
        vy = oy * 340 * leaving;
      }
      const [r, g, b] = COLOURS[k];
      intro.at[k] = [x, y, vx, vy];
      intro.tint[k] = [r, g, b, 1];
    });
    intro.count = leaving > 0.9 ? 0 : NODES;

    // The letter traces: from the robot to its bus, across, and into the letter from that side.
    const trace = t < FLY_IN ? 0 : smooth(clamp01((t - FLY_IN) / WIRE));
    // Each robot's bus at its own height, so neighbouring traces never share a line.
    const bus = (k: number) => (nodes[k].feed === "above" ? top - 12 : bottom + 10 + (k % 2) * 12);
    // Traces leave a robot from whichever end faces its bus.
    const port = (n: Node, k: number) => (n.y > bus(k) ? n.y - robot * 0.55 : n.y + robot * 0.55);
    const base = (n: Node) => n.y + robot * 0.55;
    const letterEnd = (w: Wire) => {
      const r = w.letter.getBoundingClientRect();
      const from = nodes[w.node].feed === "above" ? r.top + r.height * 0.24 : r.bottom - r.height * 0.14;
      return [(r.left + r.right) / 2 - origin.left, from - origin.top];
    };
    for (const w of wires) {
      const n = nodes[w.node];
      const [lx, ey] = letterEnd(w);
      w.path.setAttribute("d", route(n.x, port(n, w.node), bus(w.node), lx, ey));
      reveal(w.path, trace);
      w.pad.setAttribute("cx", String(lx));
      w.pad.setAttribute("cy", String(ey));
      w.pad.style.opacity = String(trace >= 1 ? 0.5 + 0.5 * w.shown : 0);
    }
    junctions.forEach((j, k) => {
      j.setAttribute("cx", String(nodes[k].x));
      j.setAttribute("cy", String(bus(k)));
      j.style.opacity = String(trace);
    });

    // The rest of the board traces out just behind.
    const extra = t < FLY_IN ? 0 : smooth(clamp01((t - FLY_IN - 0.15) / WIRE));
    for (const tr of traces) {
      const n = nodes[tr.node];
      if (tr.kind === "stub") {
        // Stubs branch off away from the name: down from robots below it, up from the one above.
        const v = n.feed === "above" ? -1 : 1;
        const y00 = n.y + v * robot * 0.55;
        const x0 = n.x + tr.side * 4;
        const y0 = y00 + v * tr.drop;
        const x1 = x0 + tr.side * (CHAMFER + tr.reach * Math.max(0.5, scale));
        tr.path.setAttribute("d", `M${x0},${y00} V${y0} L${x0 + tr.side * CHAMFER},${y0 + v * CHAMFER} H${x1}`);
        tr.via.setAttribute("cx", String(x1 + tr.side * 2.4));
        tr.via.setAttribute("cy", String(y0 + v * CHAMFER));
        tr.via.style.opacity = String(extra >= 1 ? 1 : 0);
      } else {
        const [lx, ey] = letterEnd(tr.wire);
        const v = n.feed === "above" ? -1 : 1;
        tr.path.setAttribute(
          "d",
          route(n.x + PAIR_GAP, port(n, tr.node), bus(tr.node) + v * PAIR_GAP, lx + PAIR_GAP, ey + v * 6)
        );
      }
      reveal(tr.path, extra);
    }

    // The power ring: round the outside of the name, robot to robot, never across the letters.
    const pairs: Array<[number, number]> = spread
      ? [
          [0, 1],
          [1, 3],
          [3, 2],
        ]
      : [
          [0, 1],
          [1, 2],
          [2, 3],
        ];
    const side = robot * 0.7;
    const c = CHAMFER;
    ring.forEach((segment, i) => {
      const [a, b] = pairs[i];
      const [na, nb] = [nodes[a], nodes[b]];
      let d: string;
      if (!spread) {
        const low = Math.max(na.y, nb.y) + robot * 0.55 + 16 + (i % 2) * 7;
        d = route(na.x, base(na), low, nb.x, base(nb));
      } else if (i === 0) {
        // Left robot down its side to the bottom robot's level, and across to it.
        d = `M${na.x},${base(na)} V${nb.y - c} L${na.x + c},${nb.y} H${nb.x - side}`;
      } else if (i === 1) {
        // Bottom robot across to the right robot's side, and up to it.
        d = `M${na.x + side},${na.y} H${nb.x - c} L${nb.x},${na.y - c} V${base(nb)}`;
      } else {
        // Right robot up its side to the top robot's level, and across to it.
        d = `M${na.x},${na.y - robot * 0.55} V${nb.y + c} L${na.x - c},${nb.y} H${nb.x + side}`;
      }
      segment.path.setAttribute("d", d);
      reveal(segment.path, trace);
      segment.gradient.setAttribute("x1", String(na.x));
      segment.gradient.setAttribute("y1", String(na.y));
      segment.gradient.setAttribute("x2", String(nb.x));
      segment.gradient.setAttribute("y2", String(nb.y));
      const [from, to] = segment.gradient.querySelectorAll("stop");
      from.setAttribute("stop-color", css(COLOURS[a], 0.65));
      to.setAttribute("stop-color", css(COLOURS[b], 0.65));
    });

    // Power flows round the ring, both ways, from as soon as it's traced out until the name's lit.
    if (t > FLY_IN + WIRE * 0.6 && allCharged === null && t >= nextRing) {
      const i = Math.floor(random() * ring.length);
      const reverse = random() < 0.5;
      send(ring[i].path, pairs[i][reverse ? 1 : 0], null, "ring", reverse);
      nextRing = t + RING_EVERY * (0.5 + random());
    }

    // Each robot sends a pulse down its next wire in turn, until its letters are all on their way to charged.
    const live = t > FLY_IN + WIRE * 0.8 && allCharged === null;
    if (live) {
      for (let k = 0; k < NODES; k++) {
        const mine = wires.filter((w) => w.node === k);
        if (!mine.length || sent[k] >= mine.length * PULSES) continue;
        if (t - (FLY_IN + WIRE * 0.8) < sent[k] * SEND_EVERY + k * 0.05) continue;
        const wire = mine[next[k] % mine.length];
        next[k]++;
        sent[k]++;
        send(wire.path, k, wire, "charge");
      }
      // Meanwhile the rest of the board hums along.
      if (t >= nextIdle) {
        const tr = traces[Math.floor(random() * traces.length)];
        send(tr.path, tr.node, null, "idle");
        nextIdle = t + IDLE_EVERY * (0.5 + random());
      }
    }

    // Pulses run along their paths; each one that lands on a letter charges it a step.
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const length = p.path.getTotalLength();
      const along = (t - p.sent) * p.speed;
      if (along >= length) {
        if (p.wire) {
          p.wire.hits++;
          if (p.wire.hits >= PULSES && p.wire.charged === null) p.wire.charged = t;
        }
        p.dot.remove();
        pulses.splice(i, 1);
        continue;
      }
      const at = p.path.getPointAtLength(p.reverse ? length - along : along);
      p.dot.setAttribute("transform", `translate(${at.x} ${at.y})`);
    }
    if (allCharged === null && wires.every((w) => w.charged !== null)) allCharged = t;

    // Letters fill up from the bottom as they charge, then cool to white.
    for (const w of wires) {
      w.shown += (w.hits / PULSES - w.shown) * (1 - Math.exp(-dt * FILL_RATE));
      const colour = css(COLOURS[w.node]);
      const cool = w.charged === null ? 0.3 : 0.3 + 0.7 * clamp01((t - w.charged) / COOL);
      w.letter.style.setProperty("--fill", w.shown.toFixed(4));
      // Letters fed from above fill top down.
      w.letter.style.setProperty("--angle", nodes[w.node].feed === "above" ? "180deg" : "0deg");
      w.letter.style.setProperty("--hot", colour);
      w.letter.style.setProperty("--base", colour);
      w.letter.style.setProperty("--cool", cool.toFixed(3));
      // A letter's trace brightens as it charges.
      w.path.setAttribute("stroke", css(COLOURS[w.node], 0.25 + 0.5 * w.shown));
    }
    svg.style.opacity = allCharged === null ? "1" : String(1 - clamp01((t - allCharged) / FADE));
  }

  return intro;
}
