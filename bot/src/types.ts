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

export type Env = {
  DISCORD_PUBLIC_KEY: string;
  DATA_BASE_URL: string;
  DATA_TTL_SECONDS: string;
};

export type StatKey =
  | "avg_exit_velo"
  | "max_exit_velo"
  | "barrel_pct"
  | "hard_hit_pct"
  | "xwoba"
  | "xba"
  | "k_pct"
  | "bb_pct"
  | "sprint_speed";

export const STAT_META: Record<
  StatKey,
  { label: string; digits: number; unit?: string; lowerBetter?: boolean }
> = {
  avg_exit_velo: { label: "Avg Exit Velo", digits: 1, unit: "mph" },
  max_exit_velo: { label: "Max Exit Velo", digits: 1, unit: "mph" },
  barrel_pct: { label: "Barrel %", digits: 1, unit: "%" },
  hard_hit_pct: { label: "Hard-Hit %", digits: 1, unit: "%" },
  xwoba: { label: "xwOBA", digits: 3 },
  xba: { label: "xBA", digits: 3 },
  k_pct: { label: "K %", digits: 1, unit: "%", lowerBetter: true },
  bb_pct: { label: "BB %", digits: 1, unit: "%" },
  sprint_speed: { label: "Sprint Speed", digits: 1, unit: "ft/s" },
};
