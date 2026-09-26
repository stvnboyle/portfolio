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
      "Bootstrapped the business solo and defined the company vision as sole technical founder, building and architecting a platform outside working hours that drives code-review engagement across distributed teams.",
    points: helloworld.points,
    stack: helloworld.stack,
  },
  {
    id: "hedgehog-lead",
    lane: "work",
    ref: "new role",
    date: "2022",
    title: hedgehog.title,
    org: hedgehog.company,
    period: "2022 — Present",
    summary: hedgehog.summary,
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
      "Worked across greenfield and brownfield engagements, and began influencing decisions across the frontend department: state management, data fetching and server-state caching with React Query. Pioneered the company's adoption of Next.js.",
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
    summary: lookers.summary,
    points: lookers.points,
    stack: lookers.stack,
  },
  {
    id: "placement",
    lane: "work",
    ref: "placement",
    date: "2016",
    title: placement.title,
    org: placement.company,
    period: placement.period,
    summary: placement.summary,
    points: placement.points,
    stack: placement.stack,
  },
  {
    id: "started",
    lane: "study",
    ref: "started",
    date: "2014",
    title: "BA (Hons) Computer Science",
    org: education.school,
    summary: "Started a computer science degree in Newcastle upon Tyne.",
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
