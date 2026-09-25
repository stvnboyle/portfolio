import { Hero } from "@/components/Hero";
import { Enhancements } from "@/components/Enhancements";
import { GlowHeadings } from "@/components/GlowHeadings";
import { AvatarBot } from "@/components/AvatarBot";
import { CommandMenu, type Command } from "@/components/CommandMenu";
import { ExperienceDiagram } from "@/components/ExperienceDiagrams";
import { Timeline } from "@/components/Timeline";
import { TimelineLight } from "@/components/TimelineLight";
import { getArticles, type Article } from "@/data/articles";
import { getBuildInfo } from "@/data/build";
import { EXPERIENCES } from "@/data/experiences";
import { PROJECTS } from "@/data/projects";
import { education, hobbies, profile } from "@/data/profile";

export default async function Page() {
  // Fetched once at build time — the published HTML already contains the posts.
  const articles = await getArticles();
  const build = getBuildInfo();

  return (
    <>
      <Enhancements />
      <GlowHeadings />
      <Nav commands={commands(articles)} />

      <main>
        <Hero />
        <About />
        <Career />
        <Projects />
        {/* Principles is hidden for now; the section and its data are kept for later. */}
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
    { id: "go-about", group: "go to", label: "about", hint: "#about", href: "#about" },
    { id: "go-timeline", group: "go to", label: "timeline", hint: "#timeline", href: "#timeline" },
    { id: "go-projects", group: "go to", label: "projects", hint: "#projects", href: "#projects" },
    { id: "go-writing", group: "go to", label: "writing", hint: "#writing", href: "#writing" },
    { id: "go-contact", group: "go to", label: "contact", hint: "#contact", href: "#contact" },
    { id: "copy-email", group: "contact", label: "copy email address", hint: profile.email, copy: profile.email },
    { id: "email", group: "contact", label: "send an email", hint: "mailto", href: `mailto:${profile.email}` },
    { id: "linkedin", group: "elsewhere", label: "linkedin", hint: host(profile.links.linkedin), href: profile.links.linkedin, external: true },
    { id: "medium", group: "elsewhere", label: "medium", hint: host(profile.links.medium), href: profile.links.medium, external: true },
    ...articles.slice(0, 4).map((a, i) => ({
      id: `post-${i}`,
      group: "posts",
      label: a.title.toLowerCase(),
      hint: `${a.readingMinutes} min`,
      href: `/writing/${a.slug}`,
    })),
  ];
}

function Nav({ commands }: { commands: Command[] }) {
  return (
    <header className="nav">
      <div className="nav__inner">
        <a className="nav__brand" href="#top" aria-label="stevenboyle.dev, back to top">
          stevenboyle.dev
          <i className="caret" aria-hidden />
        </a>
        <nav className="nav__links" aria-label="Sections">
          <a href="#about">about</a>
          <a data-drop href="#timeline">
            timeline
          </a>
          <a data-drop href="#projects">
            projects
          </a>
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

function About() {
  return (
    <section className="section" id="about">
      <div className="shell">
        <SectionHead name="about">
          Hi, I&rsquo;m Steven.
          <span> {profile.tagline}</span>
        </SectionHead>

        <div className="about">
          <figure className="about__photo" data-reveal>
            <span className="about__avatar">
              <img src="/me.jpg" alt="Steven Boyle" width={800} height={800} loading="lazy" decoding="async" />
              <AvatarBot />
            </span>
            <figcaption>
              <span>~/me.jpg</span>
              <span>{profile.location}</span>
            </figcaption>
          </figure>

          <div className="about__copy" data-reveal>
            <p>{profile.intro}</p>

            <dl className="about__facts">
              <div>
                <dt>now</dt>
                <dd>Tech lead &amp; engineering manager at hedgehog lab · founder, HelloWorld Technologies Ltd</dd>
              </div>
              <div>
                <dt>studied</dt>
                <dd>
                  {education.degree}, {education.school}
                </dd>
              </div>
              <div>
                <dt>off hours</dt>
                <dd>
                  <ul className="about__hobbies">
                    {hobbies.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function Projects() {
  return (
    <section className="section" id="projects">
      <div className="shell">
        <SectionHead name="projects">
          Things I&rsquo;ve built on my own time.
          <span> Shipped, and still shipping.</span>
        </SectionHead>

        <div className="projects">
          {PROJECTS.map((project) => (
            <article
              key={project.id}
              className="project"
              data-reveal
              style={{ "--tone": project.tone } as React.CSSProperties}
            >
              <p className="project__meta">
                {project.meta.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </p>
              <h3 className="project__name">{project.name}</h3>
              <p className="project__summary">{project.summary}</p>
              <p className="project__stack">{project.stack.join(" / ")}</p>
              <details className="project__more">
                <summary>{`${project.points.length} highlights`}</summary>
                <ul className="project__points">
                  {project.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </details>
              {project.link ? (
                <a className="project__link" href={project.link} target="_blank" rel="noreferrer">
                  visit {new URL(project.link).hostname} <Arrow />
                </a>
              ) : (
                <p className="project__here">you&rsquo;re here</p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Principles() {
  return (
    <section className="section" id="principles">
      <div className="shell">
        <SectionHead name="principles">
          Good software is felt at every end of it.
          <span> By the engineers building it, the agents working on it, and the users using it.</span>
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
          <span> Newest first.</span>
        </SectionHead>
        <div className="timeline-wrap">
          <TimelineLight />
          <Timeline />
        </div>
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
          <span> Also on Medium.</span>
        </SectionHead>

        <ul className="posts">
          {articles.map((article) => (
            <li key={article.url} data-reveal>
              <a className="post" href={`/writing/${article.slug}`}>
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
