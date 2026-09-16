/**
 * The three experiences the page is built around. `tone` matches the hero
 * emitter of the same index in `gfx/emitters.ts`.
 */
export const EXPERIENCES = [
  {
    id: "dx",
    title: "Developer experience",
    tone: "#4f8cff",
    body: "Fast feedback loops, types from the database to the browser, and tooling that gets out of the way so teams ship with confidence.",
  },
  {
    id: "ax",
    title: "Agent experience",
    tone: "#ad6bff",
    body: "Clear contracts, readable context and sensible guardrails, so agents can do real work in a codebase and people can trust the result.",
  },
  {
    id: "ux",
    title: "End-user experience",
    tone: "#ff6b8b",
    body: "Interfaces that feel instant, accessible and considered on every device, because that's the part people actually touch.",
  },
] as const;

export type ExperienceId = (typeof EXPERIENCES)[number]["id"];
