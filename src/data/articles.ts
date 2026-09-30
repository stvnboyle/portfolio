import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Heading = { id: string; text: string; level: 2 | 3 };

export type Article = {
  title: string;
  /** Our own page: /writing/<slug>. */
  slug: string;
  /** Medium's post id (the hash on the end of its URL), shown as the "commit". */
  id: string;
  /** The original on Medium, and the page's canonical URL. */
  url: string;
  date: string;
  iso: string;
  tags: string[];
  excerpt: string;
  readingMinutes: number;
  /** The post body, cleaned up for this site (see `prepare`). */
  html: string;
  toc: Heading[];
};

const FEED_URL = "https://medium.com/feed/@stevenboyle64";
/**
 * A saved copy of the feed (`npm run posts:snapshot`). Medium's feed only
 * carries the latest ten posts, so older ones are kept from here; it also
 * keeps the build working if Medium is unreachable.
 */
const SNAPSHOT = join(process.cwd(), "src/data/medium-feed.xml");

/**
 * Medium's RSS occasionally drops the base character out of an emoji ZWJ
 * sequence, leaving orphans like "ZWJ + ♂ + VS16" dangling on the end of a
 * title. Strip those so titles don't render with stray glyphs.
 */
function sanitiseTitle(raw: string): string {
  return raw
    .replace(/‍[♀♂⚧][︎️]?/g, "")
    .replace(/[‍️︎]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function firstMatch(block: string, re: RegExp): string {
  const m = block.match(re);
  return m ? m[1] : "";
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<figure[\s\S]*?<\/figure>/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase words joined by hyphens, emoji and punctuation dropped. */
function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

/**
 * Cleans a post's HTML from the feed for this site. The source is Steven's own
 * posts, but it's still treated as untrusted: scripts and inline handlers go.
 *  - Medium's tracking pixel is dropped.
 *  - Embedly iframes (Giphy) become plain GIFs; any other embed becomes a link.
 *  - Code blocks keep their line breaks, wrapped in <code>.
 *  - h3/h4 become h2/h3 with ids, collected for the contents list.
 *  - Images load lazily (bar the first), links open in a new tab.
 */
function prepare(raw: string): { html: string; toc: Heading[] } {
  const toc: Heading[] = [];
  const used = new Set<string>();
  let images = 0;

  const html = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(/<img[^>]*medium\.com\/_\/stat[^>]*>/g, "")
    .replace(/<iframe\b[^>]*\bsrc="([^"]+)"[^>]*>[\s\S]*?<\/iframe>/g, (_, src: string) => {
      const url = new URL(decodeEntities(src));
      const gif = [url.searchParams.get("url"), url.searchParams.get("image")].find((u) => u?.endsWith(".gif"));
      if (gif) return `<figure class="gif"><img src="${gif}" alt="" loading="lazy" decoding="async" /></figure>`;
      const target = url.searchParams.get("src") ?? url.href;
      return `<p class="embed"><a href="${target}">View the embedded media ↗</a></p>`;
    })
    .replace(/<pre>([\s\S]*?)<\/pre>/g, (_, code: string) => `<pre><code>${code.replace(/<br\s*\/?>/g, "\n")}</code></pre>`)
    .replace(/<h([34])>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => {
      const text = stripHtml(inner);
      const base = slugify(text) || "section";
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      const depth = level === "3" ? 2 : 3;
      toc.push({ id, text, level: depth });
      return `<h${depth} id="${id}">${inner}</h${depth}>`;
    })
    .replace(/<img\b/g, () => (images++ === 0 ? "<img" : '<img loading="lazy" decoding="async"'))
    .replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"');

  return { html, toc };
}

function parseFeed(xml: string): Article[] {
  const blocks = xml.split("<item>").slice(1);

  return blocks.map((block) => {
    const title = sanitiseTitle(decodeEntities(firstMatch(block, /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)));
    const url = firstMatch(block, /<link>([\s\S]*?)<\/link>/).split("?")[0];
    const pubDate = firstMatch(block, /<pubDate>([\s\S]*?)<\/pubDate>/);
    const content = firstMatch(block, /<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);

    const tags = [...block.matchAll(/<category><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g)]
      .map((m) => decodeEntities(m[1]))
      .slice(0, 4);

    const text = stripHtml(content);
    const words = text ? text.split(" ").length : 0;
    const date = new Date(pubDate);

    return {
      title,
      slug: slugify(title),
      id: url.split("-").pop() ?? "",
      url,
      iso: date.toISOString(),
      date: date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" }),
      tags,
      excerpt: text.slice(0, 220).trim() + (text.length > 220 ? "…" : ""),
      readingMinutes: Math.max(1, Math.round(words / 220)),
      ...prepare(content),
    };
  });
}

async function live(): Promise<Article[]> {
  try {
    const res = await fetch(FEED_URL, { headers: { "user-agent": "steven-boyle-portfolio/1.0" } });
    if (!res.ok) throw new Error(`feed responded ${res.status}`);
    return parseFeed(await res.text());
  } catch (err) {
    console.warn(`[medium] feed unavailable, using the snapshot: ${(err as Error).message}`);
    return [];
  }
}

/** Each post takes one of the glow colours, in order. Mirrors --glow-1..4 in globals.css. */
const TONES = ["#1aebd1", "#ff3d99", "#9450ff", "#2a7aff"];

/** The glow colour of the post at `index` in getArticles(), for its page and preview card. */
export const toneOf = (index: number) => TONES[index % TONES.length];

let cached: Promise<Article[]> | undefined;

/**
 * Runs at build time only (static export), so the published site ships the
 * articles as plain HTML — no client-side fetch, no loading state. The live
 * feed wins; the snapshot fills in anything it no longer carries.
 */
export function getArticles(): Promise<Article[]> {
  cached ??= live().then((fresh) => {
    const bySlug = new Map(parseFeed(readFileSync(SNAPSHOT, "utf8")).map((a) => [a.slug, a]));
    for (const a of fresh) bySlug.set(a.slug, a);
    return [...bySlug.values()].filter((a) => a.title && a.url).sort((a, b) => b.iso.localeCompare(a.iso));
  });
  return cached;
}
