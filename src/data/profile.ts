export const profile = {
  name: "Steven Boyle",
  fullName: "Steven Buchanan Boyle",
  handle: "stevenboyle",
  roles: ["Tech Lead", "Engineering Manager", "Founder"],
  location: "Newcastle upon Tyne, UK",
  email: "iboyleyv1@gmail.com",
  tagline: "I build platforms, teams, and the tools that ship them.",
  intro:
    "Engineering leader who's grown from IC to leading engineering teams, customer engagements, and influencing technical direction across projects and organisations. I deliver complex platforms across different industries while founding a developer tool — comfortable owning the full path from architecture, to delivery, to team leadership, with a focus on agentic engineering.",
  intro2:
    "I use AI to build and ship at pace and quality, and I care deeply about developer, end user, and agent experiences.",
  links: {
    linkedin: "https://linkedin.com/in/steven-buchanan-boyle-114384139",
    medium: "https://medium.com/@stevenboyle64",
    gitgood: "https://gitgood.io",
  },
} as const;

export type Engagement = {
  name: string;
  kind: string;
  summary: string;
  stack: string[];
};

export type Role = {
  company: string;
  title: string;
  period: string;
  location?: string;
  summary: string;
  points: string[];
  stack?: string[];
  engagements?: Engagement[];
  link?: string;
};

export const roles: Role[] = [
  {
    company: "hedgehog lab",
    title: "Tech Lead & Engineering Manager",
    period: "Jan 2019 — Present",
    location: "Newcastle upon Tyne",
    summary:
      "Owns full-stack architecture and engineering standards across the business. Leads technical delivery for multiple products serving hundreds of thousands of users, managing both internal and forward-deployed engineering teams, and setting engineering standards that scale.",
    points: [
      "Leads technical delivery across multiple concurrent products and teams",
      "Manages internal and forward-deployed engineers — mentorship, code review, pairing, career development",
      "Operates customer- and executive-facing, translating business requirements into technical outcomes",
      "Sets architecture and engineering standards designed to scale across the organisation",
    ],
    engagements: [
      {
        name: "EdTech platform",
        kind: "Client engagement",
        summary:
          "Led an end-to-end re-platform and built generative AI features for teachers, alongside a high-traffic public marketing site with instant publishing for the content team.",
        stack: ["TypeScript", "React", "Next.js", "Python", "Django", "AWS", "Terraform", "PayloadCMS"],
      },
      {
        name: "Payments consultancy",
        kind: "Client engagement",
        summary:
          "Led the build and architecture of an internal web platform surfacing payment-optimisation opportunities, with a type-safe solution end-to-end across client and server.",
        stack: ["TypeScript", "React", "Next.js", "Monorepo", "CI/CD"],
      },
      {
        name: "Online food delivery",
        kind: "Client engagement",
        summary:
          "Built a supplier-facing web platform with the in-house frontend team, shipping React features at pace while staying aligned to their design system and brand standards.",
        stack: ["TypeScript", "React", "Design systems"],
      },
    ],
    stack: [
      "TypeScript",
      "React",
      "Next.js",
      "Python",
      "Node",
      "AWS",
      "Terraform",
      "PostgreSQL",
      "Claude Code",
    ],
  },
  {
    company: "Helloworld Technologies Ltd",
    title: "Founder (part-time)",
    period: "Oct 2025 — Present",
    summary:
      "Bootstrapped the business solo and defined the company vision as sole technical founder. Built and architected gitgood.io outside working hours — a platform driving code-review engagement across distributed teams.",
    points: [
      "Built a real-time PR sync engine on GitHub's API",
      "Built a context-aware AI feedback evaluation system to incentivise high-signal code review",
      "Designed a gamified UX system — streaks, progression, feedback loops — to drive consistent participation",
      "Owned all technical and architectural decisions, including build-vs-buy across auth, database, and infra",
    ],
    stack: [
      "TypeScript",
      "React",
      "Next.js",
      "Node.js",
      "PostgreSQL",
      "Drizzle ORM",
      "Vercel",
      "Supabase",
      "Clerk",
      "Tailwind",
      "Claude Code",
    ],
    link: "https://gitgood.io",
  },
  {
    company: "Lookers",
    title: "Systems Developer",
    period: "Jun 2018 — Jan 2019",
    location: "Newcastle upon Tyne",
    summary:
      "Offered the role immediately prior to graduating. Supported the BI team and maintained the systems keeping stock data flowing across brand and third-party websites.",
    points: [
      "Developed multi-dimensional databases for rapid reporting across dealerships, sales and internal products",
      "Maintained legacy systems and CRON data feeds updating stock across third-party and brand websites",
      "Used SQL to help stakeholders understand trends; built PoCs and rebuilt legacy PHP applications",
    ],
    stack: ["JavaScript", "jQuery", "MySQL", "SQL", "PHP", "Laravel", "Node"],
  },
  {
    company: "Mid-sized Software Agency",
    title: "Software Developer (Internship)",
    period: "2016 — 2017",
    summary:
      "Third-year placement supporting a pre-tenancy software platform used by hundreds of estate agents across the UK. First hands-on introduction to the SDLC and how servers, clients and databases fit together.",
    points: [
      "Built user-facing features while being actively mentored",
      "Handled live support calls and bug fixes on physical production servers",
    ],
    stack: ["HTML", "CSS", "SASS", "Laravel", "PHP", "JavaScript", "jQuery", "MySQL"],
  },
];

export const education = {
  school: "Northumbria University",
  degree: "BA (Hons) Computer Science — First Class (1:1)",
  period: "2014 — Jun 2018",
  location: "Newcastle upon Tyne",
  detail:
    "Covered web technologies, object-oriented programming with Java, relational databases in SQL, embedded systems with C/C++, artificial intelligence and machine learning.",
  dissertation:
    "“Symbiosis” — a web platform connecting professional experts with clients seeking domain expertise via real-time 1:1 messaging, with dashboards and analytics to gamify the experience.",
};

/**
 * Axes for the radar. `level` is a self-rating out of 100 — the one genuinely
 * subjective thing on this page. Tune these six numbers and the chart, the
 * bars and the ordering all follow.
 */
export type SkillAxis = {
  key: string;
  label: string;
  short: string;
  level: number;
  note: string;
  items: string[];
};

export const skillAxes: SkillAxis[] = [
  {
    key: "frontend",
    label: "Frontend",
    short: "FE",
    level: 95,
    note: "Where I've spent the most hours, and still the part I enjoy most.",
    items: ["TypeScript", "React", "Next.js", "Design systems", "Tailwind", "ChakraUI", "Storybook"],
  },
  {
    key: "architecture",
    label: "Architecture",
    short: "ARCH",
    level: 92,
    note: "End-to-end system design — the decisions that are expensive to undo.",
    items: [
      "End-to-end system design",
      "Monorepos",
      "Rendering patterns",
      "Type-safe client-to-server",
      "State management",
      "Database & API design",
    ],
  },
  {
    key: "leadership",
    label: "Leadership",
    short: "LEAD",
    level: 90,
    note: "IC and manager both. Delivery, risk, and the people doing the work.",
    items: [
      "Tech lead",
      "Engineering management",
      "Mentorship & pairing",
      "Code review",
      "Career development",
      "Customer & exec facing",
    ],
  },
  {
    key: "agentic",
    label: "Agentic",
    short: "AGENT",
    level: 88,
    note: "Orchestrating agents to ship real work at pace, without losing quality.",
    items: ["Claude Code", "Multi-agent workflows", "Agent experience (AX)", "AI-assisted delivery"],
  },
  {
    key: "backend",
    label: "Backend",
    short: "BE",
    level: 82,
    note: "Services and data — typed all the way through wherever I can manage it.",
    items: ["Node.js", "Python", "Django", "PostgreSQL / SQL", "Drizzle ORM", "REST & RPC design"],
  },
  {
    key: "infra",
    label: "Infra",
    short: "INFRA",
    level: 78,
    note: "Enough to own it from day zero rather than hand it over.",
    items: ["AWS", "Terraform", "Vercel", "CI/CD", "Supabase", "Edge caching"],
  },
];

export const skillGroups = [
  {
    label: "Core stack",
    items: ["TypeScript", "React", "Next.js", "Node.js", "Python", "PostgreSQL / SQL", "AWS", "Terraform", "Vercel"],
  },
  {
    label: "Architecture & practice",
    items: [
      "End-to-end system design",
      "State management",
      "Infrastructure",
      "Design systems",
      "Monorepos",
      "Database & API design",
      "Rendering patterns",
      "Type-safe solutions",
      "CI/CD",
    ],
  },
  {
    label: "Agentic engineering",
    items: ["Claude Code", "Multi-agent workflows", "Agent experience (AX)", "AI-assisted delivery at pace"],
  },
  {
    label: "Leadership",
    items: [
      "IC and manager",
      "Managing risk",
      "Mentorship & peer support",
      "Code review & pairing",
      "Career development",
      "Customer & executive facing",
      "Multi-stakeholder delivery",
    ],
  },
];

export const hobbies = [
  "Big gym goer",
  "Deep nature breakaways and walking trails",
  "Dystopian thrillers on Netflix",
  "Time with my pooches",
  "Writing a tech blog",
  "Tinkering with new technologies",
];
