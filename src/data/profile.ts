export const profile = {
  name: "Steven Boyle",
  fullName: "Steven Buchanan Boyle",
  handle: "stevenboyle",
  /** The site's canonical address; www and the old .vercel.app address redirect here (vercel.json). */
  site: "https://stevenboyle.dev",
  roles: ["Engineer", "Architect", "Founder"],
  location: "Newcastle upon Tyne, UK",
  email: "iboyleyv1@gmail.com",
  tagline: "I like building things and figuring out the tricky problems along the way.",
  intro:
    "I've spent the last decade building software for the web, growing from IC to leading engineering teams and owning the whole path from architecture to delivery. I enjoy working hands-on with customers, from the first technical conversation through to launch and beyond.",
  /** The about section's paragraphs; the first is also the short intro above. */
  about: [
    "I've spent over a decade building software for the web, growing from IC to leading engineering teams - owning the whole path from architecture to delivery. I enjoy working hands-on with customers, from the first technical conversation through to launch and beyond.",
  ],
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
  /** Column heading in the stack matrix. */
  short: string;
  title: string;
  period: string;
  /** "YYYY-MM", or "YYYY" where only the year is known. `null` = present. */
  start: string;
  end: string | null;
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
    short: "hedgehog lab",
    title: "Technical Lead & Engineering Manager",
    period: "Jan 2019 — Present",
    start: "2019-01",
    end: null,
    location: "Newcastle upon Tyne",
    summary:
      "Owns full-stack architecture and engineering standards across the business, for clients ranging from startups to large enterprise customers. Leads technical delivery for multiple products serving hundreds of thousands of users, managing both internal and forward-deployed engineering teams.",
    points: [
      "Leads technical delivery across multiple concurrent products and teams",
      "Manages internal and forward-deployed engineers — mentorship, code review, pairing, career development, technical interviews",
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
      "Azure",
      "Terraform",
      "PostgreSQL",
      "Claude Code",
    ],
  },
  {
    company: "HelloWorld Technologies Ltd",
    short: "HelloWorld",
    title: "Founder (part-time)",
    period: "Oct 2025 — Present",
    start: "2025-10",
    end: null,
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
    short: "Lookers",
    title: "Systems Developer",
    period: "Jun 2018 — Jan 2019",
    start: "2018-06",
    end: "2019-01",
    location: "Newcastle upon Tyne",
    summary:
      "Offered the role immediately prior to graduating. Built multi-dimensional databases for rapid reporting across dealerships and sales, supported the BI team, and maintained the systems keeping stock data flowing across brand and third-party websites.",
    points: [
      "Developed multi-dimensional databases for rapid reporting across dealerships, sales and internal products",
      "Maintained legacy systems and CRON data feeds updating stock across third-party and brand websites",
      "Used SQL to help stakeholders understand trends; built PoCs and rebuilt legacy PHP applications",
    ],
    stack: ["JavaScript", "jQuery", "MySQL", "SQL", "PHP", "Laravel", "Node"],
  },
  {
    company: "Mid-sized Software Agency",
    short: "Placement",
    title: "Software Developer (Internship)",
    period: "2016 — 2017",
    start: "2016",
    end: "2017",
    summary:
      "Third-year placement on a pre-tenancy software platform used by hundreds of estate agents across the UK. My first time shipping to production, and a hands-on introduction to the SDLC and how servers, clients and databases fit together.",
    points: [
      "Shipped user-facing features to a live platform used by hundreds of estate agents across the UK",
      "Worked across the full stack: Laravel and PHP on the server, MySQL for data, jQuery and SASS in the browser",
      "Took live support calls from customers and diagnosed and fixed bugs directly on production servers",
    ],
    stack: ["HTML", "CSS", "SASS", "Laravel", "PHP", "JavaScript", "jQuery", "MySQL"],
  },
];

export const education = {
  school: "Northumbria University",
  degree: "BA (Hons) Computer Science — First Class (1:1)",
  period: "2014 — Jun 2018",
  start: "2014",
  end: "2018-06",
  location: "Newcastle upon Tyne",
  detail:
    "I graduated! Covered topics such as web technologies, object-oriented programming in Java, relational databases and SQL, embedded systems in C and C++, artificial intelligence and machine learning, finishing with a web-focused dissertation.",
  dissertation:
    "“Symbiosis” — a web platform connecting professional experts with clients seeking domain expertise via real-time 1:1 messaging, with dashboards and analytics to gamify the experience.",
};

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
  "Deep nature breakaways and walking trails",
  "Horror movies",
  "Walkies with the pooches",
  "Gym",
  "Nerding out",
];
