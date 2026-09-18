/** The hero scenes, in the order the switcher cycles through them. */
export const SCENES = [
  { id: "agents", name: "agent swarm", hint: "click to post a task" },
  { id: "signal", name: "signal field", hint: "click to send a burst" },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

/** Window event the ⌘K menu sends to switch scene; `detail` is a SceneId. */
export const SCENE_EVENT = "hero:scene";
