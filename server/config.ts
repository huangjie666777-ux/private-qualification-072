import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ActivityPolicy } from "../shared/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(here, "..");

interface PolicyFile {
  root: string;
  depth: number;
  activities: ActivityPolicy[];
}

let cached: PolicyFile | null = null;

export function loadPolicy(): PolicyFile {
  if (cached) return cached;
  const raw = readFileSync(join(PROJECT_ROOT, "server-config/policy.json"), "utf8");
  const parsed = JSON.parse(raw) as PolicyFile;
  if (!/^\d+$/.test(parsed.root)) throw new Error("invalid trusted root in policy");
  if (parsed.depth !== 4) throw new Error("unsupported tree depth");
  for (const activity of parsed.activities) {
    if (!Number.isInteger(activity.threshold) || activity.threshold < 0 || activity.threshold > 100) {
      throw new Error(`invalid threshold for ${activity.id}`);
    }
    if (!/^\d{1,18}$/.test(activity.activityId)) throw new Error("invalid activityId");
  }
  cached = parsed;
  return parsed;
}

export function findPolicy(activityId: string): ActivityPolicy | undefined {
  return loadPolicy().activities.find((a) => a.activityId === activityId);
}
