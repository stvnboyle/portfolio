# stevenboyle.dev — Steven Boyle's portfolio

Next.js (App Router) static export at https://stevenboyle.dev (bought through Vercel), deployed to
Vercel project `steven-boyle-portfolio`. `www.stevenboyle.dev` and the old
`steven-boyle-portfolio.vercel.app` 308-redirect to it (host rules in `vercel.json`); `profile.site`
is the canonical URL used for metadata. Private repo `stevensGIT/portfolio`, trunk is `main`.
Package manager is **npm** (package-lock.json).

## Design direction

Steven iterates visually and is specific about taste — read this before touching the UI.

- **Wants:** dark UI with *bursts* of vivid colour; a software-engineering feel (Geist Mono
  everywhere, `// section` eyebrows, `./path` nav, `$ mail` CLI nods, git-graph timeline, ⌘K
  palette, blinking caret); crisp, high-definition rendering; slow, calm motion; real telemetry in
  the hero (runtime, nodes, fps) that's clearly readable; one consistent type scale / radii / spacing.
- **Has rejected:** gamified UI (skill radar), an interactive terminal, lens flares / hex ghosts /
  HUD crosshair labels, full-screen colour washes and heavy light rays, ripple height-waves on the
  grid, blurry depth-of-field "light bulb" dots, fast animation, and a pitch-black empty backdrop.
- Start restrained, show screenshots, and tone *up* on request.

## Layout

- `src/app/page.tsx` — sections: hero → principles (DX/AX/UX panels) → timeline → writing → footer.
  Also builds the ⌘K command list.
- `src/app/globals.css` — all styles. Tokens at the top (`--text-*`, `--radius-*`, colours); reuse them.
- `src/components/` — `Hero` (canvas + HUD), `CommandMenu` (⌘K, native `<dialog>`),
  `ExperienceDiagrams` (CSS-animated panel diagrams), `Timeline` (git-graph lanes), `Enhancements`
  (scroll reveal, sticky nav).
- `src/data/` — `profile.ts` (roles, education, links — source of truth for content),
  `timeline.ts` (career events + lane spans), `experiences.ts` (DX/AX/UX copy), `articles.ts`
  (Medium RSS at build, with a baked fallback), `build.ts` (git rev in the footer).
- Don't invent career facts. Missing content (e.g. the Senior Software Engineer 2019–2022
  description) should be asked for.

## Hero graphics (`src/gfx/`, vgpu)

Built on [vgpu](https://vgpu.sh) (WebGPU only). Browsers without WebGPU get a static CSS dot grid
(`.hero[data-field="unsupported"]`).

- `engine.ts` — `startSignalField()`: init, surface, perspective camera, frame loop, input, HUD status.
- `packets.ts` — CPU "packets" that travel grid lines (turn / fork), palette, and `mood()` for the sky tint.
- `signal-field.wgsl` — compute: glow decays, bleeds, and picks up colour from packets (ping-pong storage).
- `signal-render.wgsl` — instanced dots + tight bloom; pixel-clamped, fwidth-antialiased discs.
- `signal-sky.wgsl` — fullscreen effect: slate sky, horizon glow and aurora tinted by live packets.
- `field.ts` — grid sizes, camera, sim constants, screen→grid picking.

vgpu gotchas we hit:
- Structs are packed from reflection — **don't add manual `_pad` fields** (they become required values).
- Uniform array lengths must be **literals** (`array<vec4f, 48>`), not `const`s.
- Reading storage in the vertex stage needs `init({ requiredLimits: { maxStorageBuffersInVertexStage: 1 } })`.
- Effect `uv` is top-left origin.
- `next build` does **not** validate WGSL. Run `npm run check:shaders` (`vgpu check --require-validation`).
- Docs are offline in the package: `npx vgpu docs cat getting-started.md`, `npx vgpu docs find <term>`.

## Checks & shipping

```sh
npm run typecheck
npm run check:shaders
npm run build            # static export to out/
```

Verify visually before calling UI work done: serve `out/` (`python3 -m http.server 4173 -d out`) and
screenshot desktop (1440×900) and mobile (390×844) with headless Chromium
(`--enable-unsafe-webgpu --use-angle=metal`; playwright-core is available under
`~/git-good/node_modules/.pnpm`). Headless Chrome caps at 30fps — that isn't a perf regression.

Deploys: the Vercel project is git-connected to `stevensGIT/portfolio`. Pushing to `main` deploys
production; other branches get preview URLs. After pushing, confirm the footer at https://stevenboyle.dev shows the new
`rev`. `vercel deploy --prod --yes` remains a manual fallback.
