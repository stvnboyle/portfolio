import { execSync } from "node:child_process";

/** Stamped at build time — the site is a static export, so this is the deploy. */
export function getBuildInfo() {
  let sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  if (!sha) {
    try {
      sha = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      sha = "";
    }
  }

  const now = new Date();
  return {
    rev: sha ? sha.slice(0, 7) : "local",
    date: now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    now,
  };
}
