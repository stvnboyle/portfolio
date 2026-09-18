import { roles } from "./profile";

export type Project = {
  id: string;
  name: string;
  /** Short context line, e.g. company and role. */
  meta: string[];
  summary: string;
  points: string[];
  stack: string[];
  tone: string;
  /** Omitted for this site, which you're already on. */
  link?: string;
};

const helloworld = roles.find((r) => r.company === "HelloWorld Technologies")!;

export const PROJECTS: Project[] = [
  {
    id: "gitgood",
    name: "gitgood.io",
    meta: ["HelloWorld Technologies", helloworld.title, helloworld.period],
    summary:
      "A platform driving code-review engagement across distributed teams. Built and architected solo, outside working hours, as sole technical founder.",
    points: helloworld.points,
    stack: helloworld.stack ?? [],
    tone: "#ff3d99",
    link: "https://gitgood.io",
  },
  {
    id: "boyle-dev",
    name: "boyle.dev",
    meta: ["This site"],
    summary:
      "A static Next.js site with a WebGPU agent swarm in the hero: flocking, task crews and handoffs all computed on the GPU with vgpu, with the counts read back live.",
    points: [
      "Agent swarm simulated in WGSL compute shaders, rendered as instanced SDF robots",
      "GPU → CPU feedback for live telemetry: agents, crews working, tasks done",
      "⌘K command palette, git-graph timeline, static export with no server at runtime",
    ],
    stack: ["TypeScript", "Next.js", "React", "WebGPU", "WGSL", "vgpu"],
    tone: "#1aebd1",
  },
];
