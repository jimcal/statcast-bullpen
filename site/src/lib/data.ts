import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DATA_DIR = join(ROOT, "data");

export type Player = {
  id: number;
  name: string;
  team: string | null;
  pa: number;
  avg_exit_velo: number | null;
  max_exit_velo: number | null;
  barrel_pct: number | null;
  hard_hit_pct: number | null;
  xwoba: number | null;
  xba: number | null;
  k_pct: number | null;
  bb_pct: number | null;
  sprint_speed: number | null;
};

export type Percentiles = Partial<Record<keyof Player, number | null>>;

export type PlayerDetail = Player & { percentiles: Percentiles };

export type Meta = {
  updated_at: string;
  season: number;
  player_count: number;
};

export function loadIndex(): Player[] {
  const raw = readFileSync(join(DATA_DIR, "index.json"), "utf-8");
  return JSON.parse(raw);
}

export function loadMeta(): Meta {
  const raw = readFileSync(join(DATA_DIR, "meta.json"), "utf-8");
  return JSON.parse(raw);
}

export function loadPlayer(id: number | string): PlayerDetail {
  const raw = readFileSync(join(DATA_DIR, "players", `${id}.json`), "utf-8");
  return JSON.parse(raw);
}

export function allPlayerIds(): number[] {
  return readdirSync(join(DATA_DIR, "players"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => parseInt(f.replace(".json", ""), 10));
}
