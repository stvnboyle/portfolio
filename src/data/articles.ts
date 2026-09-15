export type Article = {
  title: string;
  url: string;
  date: string;
  iso: string;
  tags: string[];
  excerpt: string;
  readingMinutes: number;
};

const FEED_URL = "https://medium.com/feed/@stevenboyle64";

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

function parseFeed(xml: string): Article[] {
  const blocks = xml.split("<item>").slice(1);

  return blocks.map((block) => {
    const title = sanitiseTitle(
      decodeEntities(firstMatch(block, /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/))
    );
    const link = firstMatch(block, /<link>([\s\S]*?)<\/link>/).split("?")[0];
    const pubDate = firstMatch(block, /<pubDate>([\s\S]*?)<\/pubDate>/);
    const content = firstMatch(
      block,
      /<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/
    );

    const tags = [...block.matchAll(/<category><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g)]
      .map((m) => decodeEntities(m[1]))
      .slice(0, 4);

    const text = stripHtml(content);
    const words = text ? text.split(" ").length : 0;
    const date = new Date(pubDate);

    return {
      title,
      url: link,
      iso: date.toISOString(),
      date: date.toLocaleDateString("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      tags,
      excerpt: text.slice(0, 220).trim() + (text.length > 220 ? "…" : ""),
      readingMinutes: Math.max(1, Math.round(words / 220)),
    };
  });
}

/**
 * Baked into the bundle so a build never fails (and the page is never empty)
 * if Medium's feed is unreachable at build time.
 */
const FALLBACK: Article[] = [
  {
    title: "Crafting an Engineering Team That Wins",
    url: "https://medium.com/@stevenboyle64/crafting-an-engineering-team-that-wins-%EF%B8%8F-31d0ce6d12d0",
    iso: "2025-07-21T11:32:58.000Z",
    date: "21 Jul 2025",
    tags: ["software-development", "company-culture", "organization", "culture"],
    excerpt:
      "Organisations scale and structure their engineering teams in all kinds of ways. From what I've seen firsthand — and from closely observing how different engineering cultures evolve, these decisions can shape far more than just headcount.",
    readingMinutes: 13,
  },
  {
    title: "How I migrated a multi-million dollar business to a Monorepo at scale with Turborepo",
    url: "https://medium.com/@stevenboyle64/how-i-migrated-a-multi-million-dollar-business-to-a-monorepo-at-scale-with-turborepo-4615b78adc71",
    iso: "2024-03-20T13:33:44.000Z",
    date: "20 Mar 2024",
    tags: ["turborepo", "software-engineering", "typescript", "software-architecture"],
    excerpt:
      "A walkthrough of moving a large production codebase from polyrepo to a Turborepo monorepo — the tooling, the trade-offs, and what I'd do differently next time.",
    readingMinutes: 21,
  },
];

/**
 * Runs at build time only (static export), so the published site ships the
 * articles as plain HTML — no client-side fetch, no loading state.
 */
export async function getArticles(): Promise<Article[]> {
  try {
    const res = await fetch(FEED_URL, {
      headers: { "user-agent": "steven-boyle-portfolio/1.0" },
    });
    if (!res.ok) throw new Error(`feed responded ${res.status}`);

    const parsed = parseFeed(await res.text()).filter((a) => a.title && a.url);
    if (!parsed.length) throw new Error("feed contained no items");

    return parsed.sort((a, b) => b.iso.localeCompare(a.iso));
  } catch (err) {
    console.warn(`[medium] falling back to baked articles: ${(err as Error).message}`);
    return FALLBACK;
  }
}
