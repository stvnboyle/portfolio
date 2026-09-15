import { HeroField, ShapeChips, GpuBadge } from "@/components/HeroField";
import { Terminal } from "@/components/Terminal";
import { Enhancements } from "@/components/Enhancements";
import { getArticles } from "@/data/articles";
import { profile, roles, skillGroups, education, hobbies } from "@/data/profile";

export default async function Page() {
  // Fetched once at build time — the published HTML already contains the posts.
  const articles = await getArticles();

  return (
    <>
      <Enhancements />
      <Nav />

      <main>
        <Hero />
        <TerminalSection articles={articles} />
        <About />
        <Experience />
        <Skills />
        <Writing articles={articles} />
        <Contact />
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
          <Mark />
          <span>{profile.name}</span>
        </a>
        <nav className="nav__links" aria-label="Sections">
          <a className="nav__link" href="#about">About</a>
          <a className="nav__link" href="#experience">Experience</a>
          <a className="nav__link" href="#skills">Stack</a>
          <a className="nav__link" href="#writing">Writing</a>
        </nav>
        <a className="nav__cta" href="#contact">Get in touch</a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" id="top">
      <HeroField />

      <div className="shell hero__inner">
        <p className="hero__status mono">
          <i className="hero__pulse" aria-hidden />
          Available — {profile.location}
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
          I build <strong>platforms</strong>, <strong>teams</strong>, and the tools
          that ship them — from architecture through delivery, with agents doing
          the heavy lifting.
        </p>

        <div className="hero__actions">
          <a className="btn btn--primary" href="#contact">
            Get in touch
          </a>
          <a className="btn btn--ghost" href="#terminal">
            <span className="mono">$</span> open terminal
          </a>
        </div>

        <ShapeChips />

        <div className="hero__meta mono">
          <GpuBadge />
          <span>Drag your cursor through the field · click to disturb it</span>
        </div>
      </div>

      <div className="hero__scroll" aria-hidden>
        <i />
        scroll
      </div>
    </section>
  );
}

function TerminalSection({ articles }: { articles: Awaited<ReturnType<typeof getArticles>> }) {
  return (
    <section className="section" id="terminal">
      <div className="shell">
        <div className="section__head" data-reveal>
          <span className="section__index mono">01</span>
          <h2 className="section__title">Ask me anything</h2>
        </div>
        <p className="section__lede" data-reveal style={{ "--reveal-delay": "60ms" } as React.CSSProperties}>
          A real shell, not a screenshot. It reads the same data as the rest of
          this page and drives the particle field behind the hero. Start with{" "}
          <code className="mono">help</code>.
        </p>

        <div data-reveal style={{ "--reveal-delay": "120ms" } as React.CSSProperties}>
          <Terminal articles={articles} />
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="section" id="about">
      <div className="shell">
        <div className="section__head" data-reveal>
          <span className="section__index mono">02</span>
          <h2 className="section__title">About</h2>
        </div>

        <div className="about">
          <div className="about__body" data-reveal>
            <p>{profile.intro}</p>
            <p>{profile.intro2}</p>
            <p>
              Outside work I&apos;m bootstrapping{" "}
              <a className="tl-link" href={profile.links.gitgood} target="_blank" rel="noreferrer">
                gitgood.io
              </a>{" "}
              as sole technical founder, and I write about engineering culture and
              architecture on Medium.
            </p>
          </div>

          <aside className="about__aside" data-reveal style={{ "--reveal-delay": "100ms" } as React.CSSProperties}>
            <Stat k="Based in" v={profile.location} />
            <Stat k="Shipping since" v="2016" />
            <Stat k="Education" v={education.degree.replace(" — First Class (1:1)", " · 1:1")} />
            <Stat
              k="Currently"
              v={
                <>
                  Tech Lead @ hedgehog lab
                  <br />
                  Founder @ Helloworld
                </>
              }
            />
            <Stat
              k="Away from the keyboard"
              v={<span style={{ fontSize: 13, color: "var(--fg-dim)" }}>{hobbies.slice(0, 4).join(" · ")}</span>}
            />
          </aside>
        </div>
      </div>
    </section>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="stat">
      <span className="stat__k mono">{k}</span>
      <span className="stat__v">{v}</span>
    </div>
  );
}

function Experience() {
  return (
    <section className="section" id="experience">
      <div className="shell">
        <div className="section__head" data-reveal>
          <span className="section__index mono">03</span>
          <h2 className="section__title">Experience</h2>
        </div>
        <p className="section__lede" data-reveal>
          Client engagements are described at a high level only.
        </p>

        <div className="roles">
          {roles.map((role, i) => (
            <article
              key={role.company}
              className="role"
              data-reveal
              style={{ "--reveal-delay": `${i * 70}ms` } as React.CSSProperties}
            >
              <div className="role__top">
                <h3 className="role__company">
                  {role.link ? (
                    <a href={role.link} target="_blank" rel="noreferrer">
                      {role.company}
                    </a>
                  ) : (
                    role.company
                  )}
                </h3>
                <span className="role__period mono">{role.period}</span>
              </div>
              <p className="role__title mono">{role.title}</p>
              <p className="role__summary">{role.summary}</p>

              <ul className="role__points">
                {role.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>

              {role.engagements && (
                <div className="engagements">
                  <p className="engagements__label mono">Selected engagements</p>
                  {role.engagements.map((engagement) => (
                    <div key={engagement.name} className="engagement">
                      <div className="engagement__top">
                        <span className="engagement__name">{engagement.name}</span>
                        <span className="engagement__kind mono">{engagement.kind}</span>
                      </div>
                      <p className="engagement__summary">{engagement.summary}</p>
                      <div className="tags">
                        {engagement.stack.map((s) => (
                          <span key={s} className="tag mono">{s}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {role.stack && !role.engagements && (
                <div className="tags">
                  {role.stack.map((s) => (
                    <span key={s} className="tag mono">{s}</span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Skills() {
  return (
    <section className="section" id="skills">
      <div className="shell">
        <div className="section__head" data-reveal>
          <span className="section__index mono">04</span>
          <h2 className="section__title">Stack &amp; practice</h2>
        </div>
        <p className="section__lede" data-reveal>
          What I reach for, and how I work.
        </p>

        <div className="skills">
          {skillGroups.map((group, i) => (
            <div
              key={group.label}
              className="card card--glow"
              data-reveal
              style={{ "--reveal-delay": `${i * 70}ms` } as React.CSSProperties}
            >
              <p className="skill__label">{group.label}</p>
              <div className="skill__items">
                {group.items.map((item) => (
                  <span key={item} className="skill__item mono">{item}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Writing({ articles }: { articles: Awaited<ReturnType<typeof getArticles>> }) {
  return (
    <section className="section" id="writing">
      <div className="shell">
        <div className="section__head" data-reveal>
          <span className="section__index mono">05</span>
          <h2 className="section__title">Writing</h2>
        </div>
        <p className="section__lede" data-reveal>
          Pulled from Medium at build time, so this list stays current without
          costing anyone a runtime request.
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
                <span>{article.readingMinutes} min read</span>
                <i className="post__dot" aria-hidden />
                <span>Medium</span>
              </div>

              <h3 className="post__title">
                {article.title}
                <svg className="post__arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M3.5 10.5 10.5 3.5M10.5 3.5H4.9M10.5 3.5V9.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
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
          All posts on Medium
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3.5 10.5 10.5 3.5M10.5 3.5H4.9M10.5 3.5V9.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section className="section contact" id="contact">
      <div className="shell">
        <div data-reveal>
          <h2 className="contact__title">
            Let&apos;s build
            <br />
            something good.
          </h2>
          <p className="contact__lede">
            Open to interesting problems — platform work, engineering leadership,
            or anything where agents and good architecture meet.
          </p>
          <div className="contact__actions">
            <a className="btn btn--primary" href={`mailto:${profile.email}`}>
              {profile.email}
            </a>
            <a className="btn btn--ghost" href={profile.links.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
            <a className="btn btn--ghost" href="/steven-boyle-cv.pdf" download>
              Download CV
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer__inner">
        <span className="mono">
          © {new Date().getFullYear()} {profile.fullName}
        </span>
        <div className="footer__links mono">
          <a href={`mailto:${profile.email}`}>Email</a>
          <a href={profile.links.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
          <a href={profile.links.medium} target="_blank" rel="noreferrer">Medium</a>
          <a href={profile.links.gitgood} target="_blank" rel="noreferrer">gitgood</a>
        </div>
        <span className="mono" style={{ color: "var(--fg-faint)" }}>
          Next.js · static export · WebGPU
        </span>
      </div>
    </footer>
  );
}

function Mark() {
  return (
    <svg className="nav__mark" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.6 15 14.4H1L8 1.6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
