import { Hero } from "@/components/Hero";
import { Enhancements } from "@/components/Enhancements";
import { getArticles, type Article } from "@/data/articles";
import { getBuildInfo } from "@/data/build";
import { profile, skillGroups } from "@/data/profile";

export default async function Page() {
  // Fetched once at build time — the published HTML already contains the posts.
  const articles = await getArticles();
  const build = getBuildInfo();

  return (
    <>
      <Enhancements />
      <Nav />

      <main>
        <Hero />
        <About />
        <Stack />
        <Writing articles={articles} />
      </main>

      <Footer rev={build.rev} />
    </>
  );
}

/* ========================================================================== */

function Nav() {
  return (
    <header className="nav">
      <div className="nav__inner">
        <a className="nav__brand" href="#top">
          {profile.name}
        </a>
        <nav className="nav__links" aria-label="Sections">
          <a href="#about">About</a>
          <a href="#stack">Stack</a>
          <a data-drop href="#writing">Writing</a>
          <a href="#contact">Contact</a>
        </nav>
      </div>
    </header>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="section" id={id}>
      <div className="shell section__grid">
        <h2 className="section__title" data-reveal>
          {title}
        </h2>
        <div className="section__body">{children}</div>
      </div>
    </section>
  );
}

function About() {
  return (
    <Section id="about" title="About">
      <p className="about__lead" data-reveal>
        {profile.intro}
      </p>
      <p className="about__sub" data-reveal>
        {profile.intro2}
      </p>
    </Section>
  );
}

function Stack() {
  return (
    <Section id="stack" title="Stack">
      <div className="groups">
        {skillGroups.map((group) => (
          <div key={group.label} className="group" data-reveal>
            <p className="group__label">{group.label}</p>
            <ul>
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Writing({ articles }: { articles: Article[] }) {
  return (
    <Section id="writing" title="Writing">
      <ul className="posts">
        {articles.map((article) => (
          <li key={article.url} data-reveal>
            <a className="post" href={article.url} target="_blank" rel="noreferrer">
              <span className="post__title">{article.title}</span>
              <span className="post__date">{article.date}</span>
            </a>
          </li>
        ))}
      </ul>
      <a className="more" href={profile.links.medium} target="_blank" rel="noreferrer">
        All posts <Arrow />
      </a>
    </Section>
  );
}

function Footer({ rev }: { rev: string }) {
  const links: Array<[string, string]> = [
    ["Email", `mailto:${profile.email}`],
    ["LinkedIn", profile.links.linkedin],
    ["Medium", profile.links.medium],
    ["gitgood", profile.links.gitgood],
  ];

  return (
    <footer className="footer" id="contact">
      <div className="shell">
        <p className="footer__cta">
          Say hello at{" "}
          <a className="link" href={`mailto:${profile.email}`}>
            {profile.email}
          </a>
        </p>
        <div className="footer__row">
          <nav className="footer__links" aria-label="Elsewhere">
            {links.map(([label, href]) => (
              <a
                key={href}
                href={href}
                target={href.startsWith("mailto") ? undefined : "_blank"}
                rel="noreferrer"
              >
                {label}
              </a>
            ))}
          </nav>
          <span className="footer__rev mono">{rev}</span>
        </div>
      </div>
    </footer>
  );
}

function Arrow() {
  return (
    <svg className="arrow" width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden>
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
