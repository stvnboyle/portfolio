import { education, roles, type Engagement } from "./profile";

/**
 * The career as a branch graph, newest first like `git log --graph`.
 * Three lanes: work, study, and HelloWorld Technologies Ltd running alongside work.
 */
export const LANES = [
  { id: "work", label: "work", tone: "#ededed" },
  { id: "study", label: "study", tone: "#6aa8ff" },
  { id: "helloworld", label: "helloworld", tone: "#ff8fb8" },
] as const;

export type LaneId = (typeof LANES)[number]["id"];

export type TimelineEvent = {
  id: string;
  lane: LaneId;
  /** Short verb shown as a ref label, e.g. "joined". */
  ref: string;
  date: string;
  title: string;
  org: string;
  period?: string;
  summary?: string;
  points?: string[];
  engagements?: Engagement[];
  stack?: string[];
  link?: string;
};

const role = (company: string) => {
  const found = roles.find((r) => r.company === company);
  if (!found) throw new Error(`timeline: no role for ${company}`);
  return found;
};

const hedgehog = role("hedgehog lab");
const helloworld = role("HelloWorld Technologies Ltd");
const lookers = role("Lookers");
const placement = role("Mid-sized Software Agency");

export const TIMELINE: TimelineEvent[] = [
  {
    id: "helloworld",
    lane: "helloworld",
    ref: "founded",
    date: "Oct 2025",
    title: helloworld.title,
    org: helloworld.company,
    period: helloworld.period,
    summary:
      "Sole technical founder building developer tools on the side. Latest launch is gitgood.io, which drives code-review engagement across distributed teams.",
    points: helloworld.points,
  },
  // Held alongside Tech Lead; split out so each reads as its own role.
  {
    id: "hedgehog-manager",
    lane: "work",
    ref: "new role",
    date: "2024",
    title: "Engineering Manager",
    org: hedgehog.company,
    period: "2024 — Present",
    summary:
      "Manages internal and forward-deployed engineering teams: mentorship, code review, pairing, career development and conducting technical interviews.",
  },
  {
    id: "hedgehog-lead",
    lane: "work",
    ref: "new role",
    date: "2022",
    title: "Technical Lead",
    org: hedgehog.company,
    period: "2022 — Present",
    summary:
      "Owns full-stack architecture and engineering standards across the business, for clients ranging from startups to large enterprise customers. Leads technical delivery for multiple products serving hundreds of thousands of users.",
    points: hedgehog.points,
    engagements: hedgehog.engagements,
    stack: hedgehog.stack,
  },
  {
    id: "hedgehog-senior",
    lane: "work",
    ref: "promoted",
    date: "2021",
    title: "Senior Software Engineer",
    org: hedgehog.company,
    period: "2021 — 2022",
    summary:
      "Worked across greenfield and brownfield engagements, and began influencing decisions across the frontend department: state management, async data fetching, TanStack Query, and server-side rendering. Pioneered the company's adoption of Next.js.",
  },
  {
    id: "hedgehog-engineer",
    lane: "work",
    ref: "joined",
    date: "Jan 2019",
    title: "Software Engineer",
    org: hedgehog.company,
    period: "Jan 2019 — 2021",
    summary:
      "Built features in React for multiple customers, and pioneered the team's adoption of hooks, moving from class components to function components, custom hooks and the Context API.",
  },
  {
    id: "graduated",
    lane: "study",
    ref: "graduated",
    date: "Jun 2018",
    title: education.degree,
    org: education.school,
    summary: education.detail,
    points: [`Dissertation: ${education.dissertation}`],
  },
  {
    id: "lookers",
    lane: "work",
    ref: "first role",
    date: "Jun 2018",
    title: lookers.title,
    org: lookers.company,
    period: lookers.period,
    summary:
      "Joined just before graduating. Helped build the reporting databases dealership and sales teams leaned on, kept the feeds pushing stock to brand and third-party sites running, and rebuilt a few ageing PHP apps along the way.",
    points: lookers.points,
  },
  {
    id: "placement",
    lane: "work",
    ref: "placement",
    date: "2016",
    title: placement.title,
    org: placement.company,
    period: placement.period,
    summary:
      "University placement on a pre-tenancy platform used by hundreds of UK estate agents. My first time shipping to production: building user-facing features, taking live support calls from customers, and fixing bugs directly on production servers.",
    points: placement.points,
  },
  {
    id: "started",
    lane: "study",
    ref: "started",
    date: "2014",
    title: "BA (Hons) Computer Science",
    org: education.school,
    summary: "Started a four-year computer science sandwich degree.",
  },
];

/**
 * Which rows each lane runs through. Rows are the timeline plus a HEAD row
 * at index 0; a lane is drawn from its first event up to its last (or to
 * HEAD while it's ongoing).
 */
export function laneSpans(): Record<LaneId, { top: number; bottom: number }> {
  const rowOf = (id: string) => TIMELINE.findIndex((e) => e.id === id) + 1;
  return {
    work: { top: 0, bottom: rowOf("placement") },
    study: { top: rowOf("graduated"), bottom: rowOf("started") },
    helloworld: { top: 0, bottom: rowOf("helloworld") },
  };
}
