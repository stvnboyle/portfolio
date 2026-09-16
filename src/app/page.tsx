import { Hero } from "@/components/Hero";
import { Enhancements } from "@/components/Enhancements";
import { CommandMenu, type Command } from "@/components/CommandMenu";
import { ExperienceDiagram } from "@/components/ExperienceDiagrams";
import { Timeline } from "@/components/Timeline";
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
      <Nav commands={commands(articles)} />

      <main>
        <Hero />
        <Principles />
        <Career />
        <Writing articles={articles} />
      </main>

      <Footer rev={build.rev} />
    </>
  );
}

/* ========================================================================== */

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

function commands(articles: Article[]): Command[] {
  return [
    { id: "go-principles", group: "go to", label: "principles", hint: "#principles", href: "#principles" },
    ...EXPERIENCES.map((e) => ({
      id: `go-${e.id}`,
      group: "go to",
      label: e.title.toLowerCase(),
      hint: `#${e.id}`,
      href: `#${e.id}`,
    })),
    { id: "go-timeline", group: "go to", label: "timeline", hint: "#timeline", href: "#timeline" },
    { id: "go-writing", group: "go to", label: "writing", hint: "#writing", href: "#writing" },
    { id: "go-contact", group: "go to", label: "contact", hint: "#contact", href: "#contact" },
    { id: "copy-email", group: "contact", label: "copy email address", hint: profile.email, copy: profile.email },
    { id: "email", group: "contact", label: "send an email", hint: "mailto", href: `mailto:${profile.email}` },
    { id: "linkedin", group: "elsewhere", label: "linkedin", hint: host(profile.links.linkedin), href: profile.links.linkedin, external: true },
    { id: "medium", group: "elsewhere", label: "medium", hint: host(profile.links.medium), href: profile.links.medium, external: true },
    { id: "gitgood", group: "elsewhere", label: "gitgood", hint: host(profile.links.gitgood), href: profile.links.gitgood, external: true },
    ...articles.slice(0, 4).map((a, i) => ({
      id: `post-${i}`,
      group: "posts",
      label: a.title.toLowerCase(),
      hint: `${a.readingMinutes} min`,
      href: a.url,
      external: true,
    })),
  ];
}

function Nav({ commands }: { commands: Command[] }) {
  return (
    <header className="nav">
      <div className="nav__inner">
        <a className="nav__brand" href="#top" aria-label="boyle.dev, back to top">
          boyle.dev
          <i className="caret" aria-hidden />
        </a>
        <nav className="nav__links" aria-label="Sections">
          <a data-drop href="#principles">
            principles
          </a>
          <a href="#timeline">timeline</a>
          <a data-drop href="#writing">
            writing
          </a>
          <a href="#contact">contact</a>
        </nav>
        <CommandMenu commands={commands} />
      </div>
    </header>
  );
}

function SectionHead({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <header className="section__head" data-reveal>
      <p className="section__eyebrow">{`// ${name}`}</p>
      <h2 className="section__title">{children}</h2>
    </header>
  );
}

function Principles() {
  return (
    <section className="section" id="principles">
      <div className="shell">
        <SectionHead name="principles">
          Good software is felt at every end of it.
          <span> By the people building it, the agents working in it, and the people using it.</span>
        </SectionHead>

        <div className="panels">
          {EXPERIENCES.map((e, i) => (
            <article
              key={e.id}
              id={e.id}
              className="panel"
              data-reveal
              style={{ "--tone": e.tone } as React.CSSProperties}
            >
              <div className="panel__copy">
                <p className="panel__index">
                  {String(i + 1).padStart(2, "0")} <span>/</span> {e.label}
                </p>
                <h3 className="panel__title">{e.title}</h3>
                <p className="panel__body">{e.body}</p>
                <ul className="panel__principles">
                  {e.principles.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className="panel__stage">
                <ExperienceDiagram id={e.id} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Career() {
  return (
    <section className="section" id="timeline">
      <div className="shell">
        <SectionHead name="timeline">
          From a computer science degree to leading teams.
          <span> Newest first, like any good log.</span>
        </SectionHead>
        <Timeline />
      </div>
    </section>
  );
}

function Writing({ articles }: { articles: Article[] }) {
  return (
    <section className="section" id="writing">
      <div className="shell">
        <SectionHead name="writing">
          Notes on teams, architecture and shipping.
          <span> Published on Medium.</span>
        </SectionHead>

        <ul className="posts">
          {articles.map((article) => (
            <li key={article.url} data-reveal>
              <a className="post" href={article.url} target="_blank" rel="noreferrer">
                <span className="post__title">{article.title}</span>
                <span className="post__meta">
                  {article.date} · {article.readingMinutes} min
                </span>
                <Arrow />
              </a>
            </li>
          ))}
        </ul>
        <a className="more" href={profile.links.medium} target="_blank" rel="noreferrer">
          all posts <Arrow />
        </a>
      </div>
    </section>
  );
}

function Footer({ rev }: { rev: string }) {
  const links: Array<[string, string]> = [
    ["linkedin", profile.links.linkedin],
    ["medium", profile.links.medium],
    ["gitgood", profile.links.gitgood],
  ];

  return (
    <footer className="footer" id="contact">
      <div className="shell">
        <SectionHead name="contact">
          Building something?
          <span> Say hello.</span>
        </SectionHead>

        <a className="footer__command" href={`mailto:${profile.email}`}>
          <span>$ mail</span>
          {profile.email}
        </a>

        <div className="footer__row">
          <nav className="footer__links" aria-label="Elsewhere">
            {links.map(([label, href]) => (
              <a key={href} href={href} target="_blank" rel="noreferrer">
                {label}
              </a>
            ))}
          </nav>
          <span className="footer__meta">
            rev {rev} · next.js · vgpu · press <kbd>⌘K</kbd>
          </span>
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
