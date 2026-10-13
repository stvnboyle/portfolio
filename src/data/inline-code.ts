/**
 * Medium's feed drops inline code (`like this`) from a post's text, so it's put back from here.
 * Keyed by the post's Medium id (the hash on the end of its URL). Each entry is a run of the
 * post's text, exactly as published, with backticks around the words that are code; give it
 * enough words either side to appear once in the post. The build warns about any it can't find.
 */
export const inlineCode: Record<string, string[]> = {
  // Programming Languages Are an Abstraction Now
  "7aed955127af": [
    "well written `AGENTS.md` with",
    "a `/docs` folder for detailed",
    "documentation, `adr`'s (",
    "and some `skills` that are both",
    "open source library `spec-kit` (",
  ],
  // Crafting an Engineering Team That Wins
  "31d0ce6d12d0": ["representing the `firstName` and `lastName` of the user"],
  // How I migrated a multi-million dollar business to a Monorepo at scale with Turborepo
  "4615b78adc71": [
    "this example `apps/web` is its own workspace and `apps/api` is another",
    "Get rid of your `.lock` files",
    "artefacts to a `dist` (for the backend) or `build` folder (for the frontend",
    "shipped with a `turbo.json` and a `package.json` file at your monorepo",
    "have their own `package.json`’s housing",
    "particularly useful for `dev` where we can run one",
    "any dependent workspaces, or `build` scripts which build",
    "Running `turbo dev` or `turbo build` from root",
    "that has 50+ `GET` endpoints",
    "called a `contract` this contract leverages",
    "Turborepo ships with `packages` for this reason, I first created a `contract` directory inside it",
    "I added a simple `package.json` inside with dependencies",
    "relies on, along with `dev` and `build` scripts to transpile",
    "when building using `tsup` as we want",
    "Then I created a `src` directory where",
    "alongside a simple `index.ts` which is where",
    "in each apps `package.json` add the below",
    "The `@TsRestHandler` decorator will do",
    "And the `tsRestHandler` callback ensures",
    "match the response from `getPost` the TypeScript compiler",
    "time of writing `@ts-rest/react-query` currently",
    "we instantiate `useQuery` hooks is completely",
    "contributors at `@ts-rest` are working",
    "directly in the `useQuery` function (`queryFn`) itself",
  ],
};
