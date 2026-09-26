import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticles } from "@/data/articles";
import { profile } from "@/data/profile";
import { PostContents } from "@/components/PostContents";
import { ReadingProgress } from "@/components/ReadingProgress";
import { Host } from "@/components/Host";
import { SeekLinks } from "@/components/SeekLinks";

/** Every post is prerendered; anything else is a 404. */
export const dynamicParams = false;

type Params = { params: Promise<{ slug: string }> };

/** Each post takes one of the glow colours, in order. Mirrors --glow-1..4 in globals.css. */
const TONES = ["#1aebd1", "#ff3d99", "#9450ff", "#2a7aff"];

export async function generateStaticParams() {
  return (await getArticles()).map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = (await getArticles()).find((a) => a.slug === slug);
  if (!article) return {};
  return {
    title: `${article.title} — ${profile.name}`,
    description: article.excerpt,
    // Medium has the original; this copy points search engines at it.
    alternates: { canonical: article.url },
    openGraph: { title: article.title, description: article.excerpt, type: "article", publishedTime: article.iso },
  };
}

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6.5 9.5a3 3 0 0 0 4.24 0l2.5-2.5a3 3 0 0 0-4.24-4.24l-.75.75M9.5 6.5a3 3 0 0 0-4.24 0l-2.5 2.5a3 3 0 0 0 4.24 4.24l.75-.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default async function PostPage({ params }: Params) {
  const { slug } = await params;
  const articles = await getArticles();
  const index = articles.findIndex((a) => a.slug === slug);
  if (index < 0) notFound();
  const article = articles[index];
  // Newest first, so "newer" is the one before.
  const newer = articles[index - 1];
  const older = articles[index + 1];
  const tone = TONES[index % TONES.length];
  const longDate = new Date(article.iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="post-page" style={{ "--tone": tone } as React.CSSProperties}>
      <SeekLinks />
      <header className="post-bar">
        <div className="post-bar__inner">
          {/* The prompt has the post open in vi: the caret sits at the end of its path. */}
          <p className="post-bar__crumb">
            <span className="nav__prompt" aria-hidden>
              $
            </span>
            <span className="nav__cmd" aria-hidden>
              vi{" "}
            </span>
            <a className="nav__brand" href="/" aria-label="stevenboyle.dev, home">
              <Host />
            </a>
            {/* A long slug truncates in the middle, keeping the .md in view. */}
            <span className="post-bar__path" aria-hidden>
              /writing/{article.slug}
            </span>
            <span className="post-bar__ext" aria-hidden>
              .md
            </span>
            <i className="caret" aria-hidden />
          </p>
          <a className="post-bar__back" href="/">
            cd ..
          </a>
        </div>
        <ReadingProgress tone={tone} />
      </header>

      <main className="article" id="top">
        <header className="shell article__head">
          <p className="section__eyebrow">{"// writing"}</p>
          <h1 className="article__title">{article.title}</h1>
          <p className="article__meta">
            <span title="Medium's id for this post">id {article.id.slice(0, 7)}</span>
            <span aria-hidden>·</span>
            <time dateTime={article.iso}>{longDate}</time>
            <span aria-hidden>·</span>
            <span>{article.readingMinutes} min read</span>
            <a
              className="article__source"
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Read the original on Medium"
            >
              <LinkIcon />
              clap on medium
            </a>
          </p>
          {article.tags.length > 0 && (
            <ul className="article__tags">
              {article.tags.map((tag) => (
                <li key={tag}>#{tag}</li>
              ))}
            </ul>
          )}
        </header>

        <div className="shell article__layout">
          {article.toc.length > 1 && (
            <aside className="article__aside">
              <PostContents headings={article.toc} />
            </aside>
          )}
          <article className="prose" dangerouslySetInnerHTML={{ __html: article.html }} />

          <footer className="article__end">
            <nav className="article__more" aria-label="More writing">
              {older && (
                <a href={`/writing/${older.slug}`}>
                  <span>← older</span>
                  {older.title}
                </a>
              )}
              {newer && (
                <a href={`/writing/${newer.slug}`} data-newer>
                  <span>newer →</span>
                  {newer.title}
                </a>
              )}
            </nav>
          </footer>
        </div>
      </main>
    </div>
  );
}
