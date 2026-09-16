/** The three experiences the page is built around. */
export const EXPERIENCES = [
  {
    id: "dx",
    label: "DX",
    title: "Developer experience",
    tone: "#4f8cff",
    body: "Fast feedback loops, types from the database to the browser, and tooling that gets out of the way so teams ship with confidence.",
    principles: ["Typed end to end", "Feedback in seconds, not minutes", "A preview for every change"],
  },
  {
    id: "ax",
    label: "AX",
    title: "Agent experience",
    tone: "#ad6bff",
    body: "Clear contracts, readable context and sensible guardrails, so agents can do real work in a codebase and people can trust the result.",
    principles: ["Explicit tool contracts", "Context an agent can actually read", "Guardrails before autonomy"],
  },
  {
    id: "ux",
    label: "UX",
    title: "End-user experience",
    tone: "#ff6b8b",
    body: "Interfaces that feel instant, accessible and considered on every device, because that's the part people actually touch.",
    principles: ["Performance budgets, not afterthoughts", "Accessible by default", "Every device, every connection"],
  },
] as const;

export type ExperienceId = (typeof EXPERIENCES)[number]["id"];
