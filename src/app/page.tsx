import { Hero } from "@/components/Hero";
import { Enhancements } from "@/components/Enhancements";
import { ExperienceVisual } from "@/components/ExperienceVisuals";
import { getArticles, type Article } from "@/data/articles";
import { getBuildInfo } from "@/data/build";
import { EXPERIENCES } from "@/data/experiences";
import { profile } from "@/data/profile";

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
        <Experiences />
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
          <a href="#experience">Experience</a>
          <a href="#writing">Writing</a>
          <a href="#contact">Contact</a>
        </nav>
      </div>
    </header>
  );
}

function Experiences() {
  return (
    <section className="section" id="experience">
      <div className="shell">
        <h2 className="care__title" data-reveal>
          Good software is felt at every end of it.
          <span> By the people building it, the agents working in it, and the people using it.</span>
        </h2>

        <div className="cards">
          {EXPERIENCES.map((e, i) => (
            <article
              key={e.id}
              id={e.id}
              className="card"
              data-reveal
              style={{ "--tone": e.tone, "--delay": `${i * 90}ms` } as React.CSSProperties}
            >
              <ExperienceVisual id={e.id} />
              <div className="card__copy">
                <h3 className="card__title">
                  <i aria-hidden />
                  {e.title}
                </h3>
                <p>{e.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Writing({ articles }: { articles: Article[] }) {
  return (
    <section className="section" id="writing">
      <div className="shell section__grid">
        <h2 className="section__title" data-reveal>
          Writing
        </h2>
        <div>
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
        </div>
      </div>
    </section>
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
