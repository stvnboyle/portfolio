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

const helloworld = roles.find((r) => r.company === "HelloWorld Technologies Ltd")!;

export const PROJECTS: Project[] = [
  {
    id: "gitgood",
    name: "gitgood.io",
    meta: [helloworld.company, helloworld.title, helloworld.period],
    summary: "Code-review engagement for distributed teams, built solo as sole technical founder.",
    points: helloworld.points,
    stack: helloworld.stack ?? [],
    tone: "#ff3d99",
    link: "https://gitgood.io",
  },
  {
    id: "stevenboyle-dev",
    name: "stevenboyle.dev",
    meta: ["This site"],
    summary: "A static Next.js site whose hero is a WebGPU agent swarm, simulated on the GPU with vgpu.",
    points: [
      "Agent swarm simulated in WGSL compute shaders, rendered as instanced SDF robots",
      "GPU → CPU feedback for live telemetry: agents, crews working, tasks done",
      "⌘K command palette, git-graph timeline, static export with no server at runtime",
    ],
    stack: ["TypeScript", "Next.js", "React", "WebGPU", "WGSL", "vgpu"],
    tone: "#1aebd1",
  },
];
