import { Hero } from "@/components/Hero";
import { Enhancements } from "@/components/Enhancements";
import { getArticles, type Article } from "@/data/articles";
import { getBuildInfo } from "@/data/build";
import { education, profile, roles, skillGroups, type Role } from "@/data/profile";

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
        <Summary />
        <Experience now={build.now} />
        <Stack />
        <Writing articles={articles} />
      </main>

      <Footer build={build} />
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
        <nav className="nav__links mono" aria-label="Sections">
          <a href="#work">work</a>
          <a href="#stack">stack</a>
          <a data-drop href="#writing">writing</a>
          <a href="#contact">contact</a>
        </nav>
      </div>
    </header>
  );
}

function Section({
  id,
  index,
  title,
  note,
  children,
}: {
  id: string;
  index: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section" id={id}>
      <div className="shell section__grid">
        <header className="section__label" data-reveal>
          <span className="mono section__index">{index}</span>
          <h2 className="section__title">{title}</h2>
          {note && <p className="mono section__note">{note}</p>}
        </header>
        <div className="section__body">{children}</div>
      </div>
    </section>
  );
}

/* --- 01 summary ----------------------------------------------------------- */

function Summary() {
  const spec: Array<[string, string]> = [
    ["Role", "Tech Lead & Engineering Manager"],
    ["Based", profile.location],
    ["Focus", "Agentic engineering, platforms, teams"],
    ["Building", "gitgood.io"],
    ["Trained", "BA (Hons) Computer Science, First"],
  ];

  return (
    <Section id="summary" index="01" title="Summary">
      <p className="summary__lead" data-reveal>
        {profile.intro}
      </p>
      <p className="summary__sub" data-reveal>
        {profile.intro2}
      </p>
      <dl className="spec" data-reveal>
        {spec.map(([k, v]) => (
          <div key={k} className="spec__row">
            <dt className="mono">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/* --- 02 experience -------------------------------------------------------- */

/** "YYYY-MM" → decimal year. Year-only dates sit mid-year. */
function toYear(value: string | null, now: Date): number {
  if (!value) return now.getFullYear() + now.getMonth() / 12;
  const [y, m] = value.split("-").map(Number);
  return m ? y + (m - 1) / 12 : y + 0.5;
}

function duration(role: Pick<Role, "start" | "end">, now: Date): string | null {
  // Only meaningful when both ends are known to the month.
  if (!role.start.includes("-") || (role.end && !role.end.includes("-"))) return null;
  const months = Math.round((toYear(role.end, now) - toYear(role.start, now)) * 12);
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} yr`, m && `${m} mo`].filter(Boolean).join(" ");
}

function Experience({ now }: { now: Date }) {
  const lanes = [
    ...roles.map((r) => ({ label: r.short, start: r.start, end: r.end, kind: r.end ? "past" : "live" })),
    { label: "Northumbria", start: education.start, end: education.end, kind: "study" },
  ];
  const from = 2014;
  const to = toYear(null, now);
  const pct = (year: number) => ((year - from) / (to - from)) * 100;
  const ticks = Array.from({ length: Math.floor(to) - from + 1 }, (_, i) => from + i);

  return (
    <Section id="work" index="02" title="Work" note={`${from} → now`}>
      <div className="gantt" data-reveal role="img" aria-label="Timeline of roles and education">
        <div className="gantt__axis mono">
          {ticks.map((year) => (
            <span key={year} style={{ left: `${pct(year)}%` }} data-major={year % 2 === 0 || undefined}>
              {String(year).slice(2)}
            </span>
          ))}
        </div>
        {lanes.map((lane) => {
          const a = pct(toYear(lane.start, now));
          const b = pct(toYear(lane.end, now));
          return (
            <div key={lane.label} className="gantt__lane">
              <span className="gantt__name mono">{lane.label}</span>
              <span className="gantt__track">
                {ticks.map((year) => (
                  <i key={year} className="gantt__grid" style={{ left: `${pct(year)}%` }} />
                ))}
                <i
                  className="gantt__bar"
                  data-kind={lane.kind}
                  style={{ left: `${a}%`, width: `${Math.max(b - a, 0.8)}%` }}
                />
              </span>
            </div>
          );
        })}
      </div>

      <ol className="roles">
        {roles.map((role) => (
          <li key={role.company} className="role" data-reveal>
            <div className="role__when mono">
              <span>{role.period}</span>
              {duration(role, now) && <span className="role__dur">{duration(role, now)}</span>}
            </div>
            <div className="role__body">
              <h3 className="role__title">
                {role.link ? (
                  <a className="link" href={role.link} target="_blank" rel="noreferrer">
                    {role.company}
                  </a>
                ) : (
                  role.company
                )}
                <span className="role__position">{role.title}</span>
              </h3>
              <p className="role__summary">{role.summary}</p>
              <ul className="role__points">
                {role.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>

              {role.engagements && (
                <div className="engagements">
                  {role.engagements.map((e) => (
                    <div key={e.name} className="engagement">
                      <p className="engagement__name">{e.name}</p>
                      <p className="engagement__summary">{e.summary}</p>
                      <p className="mono engagement__stack">{e.stack.join(" / ")}</p>
                    </div>
                  ))}
                </div>
              )}

              {role.stack && <p className="mono role__stack">{role.stack.join(" / ")}</p>}
            </div>
          </li>
        ))}

        <li className="role" data-reveal>
          <div className="role__when mono">
            <span>{education.period}</span>
          </div>
          <div className="role__body">
            <h3 className="role__title">
              {education.school}
              <span className="role__position">{education.degree}</span>
            </h3>
            <p className="role__summary">{education.detail}</p>
            <p className="role__summary role__aside">Dissertation: {education.dissertation}</p>
          </div>
        </li>
      </ol>
    </Section>
  );
}

/* --- 03 stack ------------------------------------------------------------- */

const ALIASES: Record<string, string> = { Node: "Node.js", Monorepo: "Monorepos" };

function stackMatrix() {
  const rows = new Map<string, { used: boolean[]; order: number }>();
  let order = 0;
  roles.forEach((role, col) => {
    const items = [...(role.stack ?? []), ...(role.engagements?.flatMap((e) => e.stack) ?? [])];
    for (const raw of items) {
      const name = ALIASES[raw] ?? raw;
      const row = rows.get(name) ?? { used: roles.map(() => false), order: order++ };
      row.used[col] = true;
      rows.set(name, row);
    }
  });
  // Roles run newest first, so the earliest column a component appears in is
  // how current it is. Lead with what's in use now, then by breadth.
  return [...rows.entries()]
    .map(([name, row]) => ({
      name,
      ...row,
      count: row.used.filter(Boolean).length,
      latest: row.used.indexOf(true),
    }))
    .sort((a, b) => a.latest - b.latest || b.count - a.count || a.order - b.order);
}

const MATRIX_ROWS = 16;

function Stack() {
  const all = stackMatrix();
  const rows = all.slice(0, MATRIX_ROWS);
  const rest = all.slice(MATRIX_ROWS);
  const practice = skillGroups.filter((g) => g.label !== "Core stack");

  return (
    <Section id="stack" index="03" title="Stack" note="derived from the roles above">
      <div className="matrix__scroll" data-reveal>
        <table className="matrix">
          <thead>
            <tr>
              <th className="mono" scope="col">
                component
              </th>
              {roles.map((r) => (
                <th key={r.short} className="mono matrix__col" scope="col">
                  <span>{r.short}</span>
                </th>
              ))}
              <th className="mono matrix__n" scope="col">
                n
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                {row.used.map((used, i) => (
                  <td key={roles[i].short} className="matrix__cell" data-used={used || undefined}>
                    <i aria-hidden />
                    <span className="sr-only">{used ? "used" : "not used"}</span>
                  </td>
                ))}
                <td className="mono matrix__n">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rest.length > 0 && (
        <p className="mono matrix__rest">
          + {rest.map((r) => r.name).join(" / ")}
        </p>
      )}

      <div className="practice">
        {practice.map((group) => (
          <div key={group.label} className="practice__group" data-reveal>
            <p className="mono practice__label">{group.label}</p>
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

/* --- 04 writing ----------------------------------------------------------- */

function Writing({ articles }: { articles: Article[] }) {
  return (
    <Section id="writing" index="04" title="Writing" note="medium · pulled at build">
      <ul className="posts">
        {articles.map((article) => (
          <li key={article.url} data-reveal>
            <a className="post" href={article.url} target="_blank" rel="noreferrer">
              <span className="mono post__date">{article.date}</span>
              <span className="post__title">{article.title}</span>
              <span className="mono post__meta">
                {article.readingMinutes} min
                <Arrow />
              </span>
            </a>
          </li>
        ))}
      </ul>
      <a className="more mono" href={profile.links.medium} target="_blank" rel="noreferrer">
        all posts <Arrow />
      </a>
    </Section>
  );
}

/* --- title block ---------------------------------------------------------- */

function Footer({ build }: { build: ReturnType<typeof getBuildInfo> }) {
  const links: Array<[string, string]> = [
    [profile.email, `mailto:${profile.email}`],
    ["linkedin", profile.links.linkedin],
    ["medium", profile.links.medium],
    ["gitgood", profile.links.gitgood],
  ];

  return (
    <footer className="footer" id="contact">
      <div className="shell">
        <h2 className="footer__cta">
          Building something?{" "}
          <a className="link" href={`mailto:${profile.email}`}>
            Get in touch.
          </a>
        </h2>

        <div className="titleblock mono">
          <div className="tb tb--wide">
            <span>contact</span>
            <p className="tb__links">
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
            </p>
          </div>
          <div className="tb">
            <span>drawn by</span>
            <p>{profile.name}</p>
          </div>
          <div className="tb">
            <span>rev</span>
            <p>{build.rev}</p>
          </div>
          <div className="tb">
            <span>date</span>
            <p>{build.date}</p>
          </div>
          <div className="tb">
            <span>sheet</span>
            <p>01 / 01</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function Arrow() {
  return (
    <svg className="arrow" width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
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
