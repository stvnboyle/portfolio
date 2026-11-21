import type { Metadata } from "next";
import { LabRobots } from "@/components/LabRobots";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "lab · 3D robots",
  robots: { index: false, follow: false },
};

/** A proof of concept, unlinked from the site: the hero's robots as PBR models in three.js on WebGPU. */
export default function LabRobotsPage() {
  return (
    <main>
      <header className="post-bar">
        <div className="post-bar__inner">
          <span className="post-bar__crumb">
            <span className="nav__cmd">$ ./lab/</span>robots-3d
          </span>
          <ThemeToggle />
          <a className="post-bar__back" href="/">
            cd ..
          </a>
        </div>
      </header>
      <LabRobots />
    </main>
  );
}
