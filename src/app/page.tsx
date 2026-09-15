import { HeroField, RendererHud } from "@/components/HeroField";
import { SkillRadar } from "@/components/SkillRadar";
import { Terminal } from "@/components/Terminal";
import { Enhancements } from "@/components/Enhancements";
import { getArticles, type Article } from "@/data/articles";
import { profile } from "@/data/profile";

export default async function Page() {
  // Fetched once at build time — the published HTML already contains the posts.
  const articles = await getArticles();

  return (
    <>
      <Enhancements />
      <Nav />

      <main>
        <Hero />
        <Stack />
        <TerminalSection articles={articles} />
        <Writing articles={articles} />
      </main>

      <Footer />
    </>
  );
}

/* ========================================================================== */

function Nav() {
  return (
    <header className="nav">
      <div className="shell nav__inner">
        <a className="nav__brand" href="#top">
          <i className="nav__caret" aria-hidden />
          <span>{profile.name}</span>
        </a>
        <nav className="nav__links mono" aria-label="Sections">
          <a className="nav__link" href="#stack">stack</a>
          <a className="nav__link" href="#terminal">terminal</a>
          <a className="nav__link" data-drop="sm" href="#writing">writing</a>
          <a className="nav__link" data-drop="md" href={`mailto:${profile.email}`}>email</a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" id="top">
      <HeroField />

      <div className="shell hero__inner">
        <div className="hero__copy">
          <p className="hero__status mono">
            <i className="hero__pulse" aria-hidden />
            Newcastle upon Tyne
          </p>

          <h1 className="hero__name">
            Steven
            <br />
            Boyle
          </h1>

          <div className="hero__roles mono">
            {profile.roles.map((role) => (
              <span key={role}>{role}</span>
            ))}
          </div>

          <p className="hero__tagline">
            Tech lead at <strong>hedgehog lab</strong>, building platforms and
            leading the teams that ship them. Founder of{" "}
            <a className="hero__link" href={profile.links.gitgood} target="_blank" rel="noreferrer">
              gitgood.io
            </a>{" "}
            on the side.
          </p>
        </div>

        <RendererHud />
      </div>
    </section>
  );
}

function Stack() {
  return (
    <section className="section" id="stack">
      <div className="shell">
        <div className="section__head" data-reveal>
          <span className="section__index mono">01</span>
          <h2 className="section__title">Stack &amp; practice</h2>
        </div>
        <p className="section__lede" data-reveal>
          Six areas, self-rated. Pick one to see what&apos;s underneath it.
        </p>

        <SkillRadar />
      </div>
    </section>
  );
}

function TerminalSection({ articles }: { articles: Article[] }) {
  return (
    <section className="section" id="terminal">
      <div className="shell">
        <div className="section__head" data-reveal>
          <span className="section__index mono">02</span>
          <h2 className="section__title">Terminal</h2>
        </div>
        <p className="section__lede" data-reveal>
          The rest of the detail lives in here — <code className="mono">whoami</code>,{" "}
          <code className="mono">experience</code>, <code className="mono">education</code>,{" "}
          <code className="mono">blog</code>. It drives the field up top, too.
        </p>

        <div data-reveal style={{ "--reveal-delay": "80ms" } as React.CSSProperties}>
          <Terminal articles={articles} />
        </div>
      </div>
    </section>
  );
}

function Writing({ articles }: { articles: Article[] }) {
  return (
    <section className="section" id="writing">
      <div className="shell">
        <div className="section__head" data-reveal>
          <span className="section__index mono">03</span>
          <h2 className="section__title">Writing</h2>
        </div>
        <p className="section__lede" data-reveal>
          Pulled from Medium at build time.
        </p>

        <div className="posts">
          {articles.map((article, i) => (
            <a
              key={article.url}
              className="card card--glow post"
              href={article.url}
              target="_blank"
              rel="noreferrer"
              data-reveal
              style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}
            >
              <div className="post__top mono">
                <span>{article.date}</span>
                <i className="post__dot" aria-hidden />
                <span>{article.readingMinutes} min</span>
              </div>

              <h3 className="post__title">
                {article.title}
                <Arrow />
              </h3>

              <p className="post__excerpt">{article.excerpt}</p>

              <div className="tags">
                {article.tags.map((tag) => (
                  <span key={tag} className="tag mono">{tag}</span>
                ))}
              </div>
            </a>
          ))}
        </div>

        <a className="posts__more mono" href={profile.links.medium} target="_blank" rel="noreferrer">
          all posts
          <Arrow />
        </a>
      </div>
    </section>
  );
}

function Footer() {
  const links: Array<[string, string]> = [
    [profile.email, `mailto:${profile.email}`],
    ["linkedin", profile.links.linkedin],
    ["medium", profile.links.medium],
    ["gitgood", profile.links.gitgood],
  ];

  return (
    <footer className="footer" id="contact">
      <div className="shell footer__inner">
        <div className="footer__links mono">
          {links.map(([label, href]) => (
            <a key={href} href={href} target={href.startsWith("mailto") ? undefined : "_blank"} rel="noreferrer">
              {label}
            </a>
          ))}
        </div>
        <span className="mono footer__note">
          next.js · static export · webgpu
        </span>
      </div>
    </footer>
  );
}

function Arrow() {
  return (
    <svg className="post__arrow" width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3.5 10.5 10.5 3.5M10.5 3.5H4.9M10.5 3.5V9.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
