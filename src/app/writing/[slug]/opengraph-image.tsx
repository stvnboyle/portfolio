import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getArticles, toneOf } from "@/data/articles";

/**
 * Each post's link preview: its title on the site's dark ground, in the post's
 * glow colour, as a commit on a git-graph lane with one of the swarm's robots
 * on it. Rendered once per post at build (static export), at 2× for sharp
 * previews on high-density screens.
 */
export const dynamicParams = false;
export const alt = "A post from Steven Boyle's writing";
export const contentType = "image/png";

/** Laid out in 1200×630 units, rendered at 2×. */
const S = 2;
export const size = { width: 1200 * S, height: 630 * S };

const BG = "#0a0a0b";
const FG = "#ededed";
const DIM = "#a0a0a8";
const MUTED = "#6c6c74";

const FONTS = join(process.cwd(), "node_modules/geist/dist/fonts/geist-mono");

export async function generateStaticParams() {
  return (await getArticles()).map((a) => ({ slug: a.slug }));
}

/** Bigger for short titles, smaller for long ones, so every title fits in three lines. */
const titleSize = (title: string) => (title.length <= 40 ? 64 : title.length <= 70 ? 54 : 44);

/** One of the swarm's robots (gfx/agents-render.wgsl): a rounded head, a visor and two ears. */
function Robot({ tone, px }: { tone: string; px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 32 32">
      <path d="M6 9 L3 2 L11 7 Z M26 9 L29 2 L21 7 Z" fill={tone} />
      <rect x="4" y="6" width="24" height="20" rx="6" fill={tone} />
      <rect x="8" y="12" width="16" height="7" rx="3.5" fill={BG} />
      <rect x="11" y="14.6" width="10" height="1.8" rx="0.9" fill="#fff" />
    </svg>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const articles = await getArticles();
  const index = articles.findIndex((a) => a.slug === slug);
  const article = articles[index];
  const tone = toneOf(index);
  const date = new Date(article.iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const [regular, medium] = await Promise.all([
    readFile(join(FONTS, "GeistMono-Regular.ttf")),
    readFile(join(FONTS, "GeistMono-Medium.ttf")),
  ]);

  const u = (n: number) => n * S;
  // The lane: a vertical trace down the left, with the post as a commit on it.
  const laneX = u(96);
  const commitY = u(300);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: BG,
          color: FG,
          fontFamily: "Geist Mono",
        }}
      >
        {/* The hero's faint dot grid, and the burst: the post's colour glowing up from the bottom-right. */}
        <svg style={{ position: "absolute", inset: 0 }} width={size.width} height={size.height}>
          <defs>
            <pattern id="dots" width={u(24)} height={u(24)} patternUnits="userSpaceOnUse">
              <circle cx={u(12)} cy={u(12)} r={u(1.1)} fill="#ffffff" fillOpacity="0.08" />
            </pattern>
            <radialGradient id="burst">
              <stop offset="0" stopColor={tone} stopOpacity="0.38" />
              <stop offset="0.45" stopColor={tone} stopOpacity="0.12" />
              <stop offset="1" stopColor={tone} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
          <ellipse cx={u(1080)} cy={u(640)} rx={u(560)} ry={u(420)} fill="url(#burst)" />
        </svg>

        {/* The lane, bright where it runs through the commit and fading off both ends. */}
        <div
          style={{
            position: "absolute",
            left: laneX - u(1),
            top: 0,
            width: u(2),
            height: "100%",
            background: `linear-gradient(to bottom, transparent, ${tone}99 ${Math.round((commitY / size.height) * 100)}%, ${tone}22 88%, transparent)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: laneX - u(9),
            top: commitY - u(9),
            width: u(18),
            height: u(18),
            borderRadius: "50%",
            background: BG,
            border: `${u(3)}px solid ${tone}`,
            boxShadow: `0 0 ${u(18)}px ${tone}`,
          }}
        />
        {/* A robot working the lane, below the commit. */}
        <div style={{ position: "absolute", left: laneX - u(22), top: u(440), display: "flex" }}>
          <Robot tone={tone} px={u(44)} />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            padding: `${u(64)}px ${u(88)}px ${u(56)}px ${u(152)}px`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: u(22), color: DIM }}>
            <span style={{ color: tone }}>// writing</span>
            <span style={{ color: MUTED }}>id {article.id.slice(0, 7)}</span>
          </div>

          <div
            style={{
              display: "flex",
              flexGrow: 1,
              alignItems: "center",
              fontSize: u(titleSize(article.title)),
              fontWeight: 500,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              marginTop: u(-20),
            }}
          >
            {article.title}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: u(22) }}>
            <span style={{ display: "flex" }}>
              <span style={{ color: MUTED, marginRight: u(12) }}>$</span>
              <span>stevenboyle.dev</span>
              <span style={{ color: MUTED }}>/writing</span>
            </span>
            <span style={{ color: DIM }}>
              Steven Boyle · {date} · {article.readingMinutes} min read
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist Mono", data: regular, weight: 400, style: "normal" },
        { name: "Geist Mono", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
