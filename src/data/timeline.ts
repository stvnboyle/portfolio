import { education, roles, type Engagement } from "./profile";

/**
 * The career as a branch graph, newest first like `git log --graph`.
 * Three lanes: work, study, and gitgood running alongside work.
 */
export const LANES = [
  { id: "work", label: "work", tone: "#ededed" },
  { id: "study", label: "study", tone: "#6aa8ff" },
  { id: "gitgood", label: "gitgood", tone: "#ff8fb8" },
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
  summary: string;
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
const helloworld = role("Helloworld Technologies Ltd");
const lookers = role("Lookers");
const placement = role("Mid-sized Software Agency");

export const TIMELINE: TimelineEvent[] = [
  {
    id: "gitgood",
    lane: "gitgood",
    ref: "founded",
    date: "Oct 2025",
    title: helloworld.title,
    org: `${helloworld.company} · gitgood.io`,
    period: helloworld.period,
    summary: helloworld.summary,
    points: helloworld.points,
    stack: helloworld.stack,
    link: helloworld.link,
  },
  {
    id: "hedgehog",
    lane: "work",
    ref: "joined",
    date: "Jan 2019",
    title: hedgehog.title,
    org: hedgehog.company,
    period: hedgehog.period,
    summary: hedgehog.summary,
    points: hedgehog.points,
    engagements: hedgehog.engagements,
    stack: hedgehog.stack,
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
    gitgood: { top: 0, bottom: rowOf("gitgood") },
  };
}
