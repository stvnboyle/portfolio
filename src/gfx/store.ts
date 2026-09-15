"use client";

import { useEffect, useState } from "react";
import type { FieldEngine, EngineStatus } from "./engine";

/**
 * The particle field is created by the hero canvas but driven from several
 * places (terminal, shape chips, keyboard shortcuts). A tiny module-level
 * store avoids threading context through server components.
 */

let engine: FieldEngine | null = null;
const subscribers = new Set<(engine: FieldEngine | null) => void>();

export function setEngine(next: FieldEngine | null) {
  engine = next;
  for (const fn of subscribers) fn(engine);
}

export function getEngine(): FieldEngine | null {
  return engine;
}

export function subscribeEngine(fn: (engine: FieldEngine | null) => void): () => void {
  subscribers.add(fn);
  fn(engine);
  return () => subscribers.delete(fn);
}

export function useFieldEngine(): {
  engine: FieldEngine | null;
  status: EngineStatus | null;
} {
  const [current, setCurrent] = useState<FieldEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus | null>(null);

  useEffect(() => subscribeEngine(setCurrent), []);
  useEffect(() => {
    if (!current) {
      setStatus(null);
      return;
    }
    return current.subscribe(setStatus);
  }, [current]);

  return { engine: current, status };
}
