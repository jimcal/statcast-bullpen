import type { Env, PlayerDetail, StatKey } from "./types";
import { STAT_META } from "./types";
import { loadIndex, loadPlayer } from "./data";
import { findPlayer } from "./match";

type Embed = {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
};

type InteractionResponse = {
  type: number;
  data?: {
    content?: string;
    embeds?: Embed[];
    flags?: number;
  };
};

const CHANNEL_MESSAGE = 4;
const EPHEMERAL = 1 << 6;

function fmt(v: number | null, digits: number): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(digits);
}

function pctColor(pct: number | null): number {
  if (pct === null) return 0x666666;
  if (pct >= 75) return 0xdc2626;
  if (pct >= 60) return 0xef6845;
  if (pct >= 40) return 0x94a3b8;
  if (pct >= 25) return 0x5a8cd6;
  return 0x2563eb;
}

function ephemeral(content: string): InteractionResponse {
  return { type: CHANNEL_MESSAGE, data: { content, flags: EPHEMERAL } };
}

export async function handlePlayer(
  env: Env,
  options: { name: string; value: string | number }[],
): Promise<InteractionResponse> {
  const nameOpt = options.find((o) => o.name === "name");
  if (!nameOpt) return ephemeral("Missing `name`.");

  const players = await loadIndex(env);
  const match = findPlayer(players, String(nameOpt.value));
  if (!match) {
    return ephemeral(`No player found for "${nameOpt.value}".`);
  }
  const detail: PlayerDetail = await loadPlayer(env, match.id);

  const stats: StatKey[] = [
    "avg_exit_velo",
    "max_exit_velo",
    "barrel_pct",
    "hard_hit_pct",
    "xwoba",
    "xba",
    "k_pct",
    "bb_pct",
    "sprint_speed",
  ];

  const fields = stats.map((k) => {
    const meta = STAT_META[k];
    const val = detail[k] as number | null;
    const pct = detail.percentiles?.[k] ?? null;
    const valStr = `${fmt(val, meta.digits)}${meta.unit ? ` ${meta.unit}` : ""}`;
    const pctStr = pct === null ? "—" : `${pct}`;
    return {
      name: meta.label,
      value: `**${valStr}**  ·  pct: ${pctStr}`,
      inline: true,
    };
  });

  // Color by xwOBA percentile if available, else avg_exit_velo, else neutral
  const accentPct =
    detail.percentiles?.xwoba ??
    detail.percentiles?.avg_exit_velo ??
    null;

  const embed: Embed = {
    title: detail.name,
    description: `${detail.team ?? "—"} · ${detail.pa} PA · 2025`,
    color: pctColor(accentPct),
    url: `https://statcast-bullpen.pages.dev/player/${detail.id}/`,
    fields,
    footer: { text: "statcast-bullpen · pct = percentile rank vs qualified bats" },
  };

  return { type: CHANNEL_MESSAGE, data: { embeds: [embed] } };
}

const LEADERBOARD_CHOICES: StatKey[] = [
  "xwoba",
  "xba",
  "barrel_pct",
  "hard_hit_pct",
  "avg_exit_velo",
  "max_exit_velo",
  "k_pct",
  "bb_pct",
  "sprint_speed",
];

export async function handleLeaderboard(
  env: Env,
  options: { name: string; value: string | number }[],
): Promise<InteractionResponse> {
  const statOpt = options.find((o) => o.name === "stat");
  const nOpt = options.find((o) => o.name === "n");
  if (!statOpt) return ephemeral("Missing `stat`.");

  const stat = String(statOpt.value) as StatKey;
  if (!LEADERBOARD_CHOICES.includes(stat)) {
    return ephemeral(`Unknown stat \`${stat}\`.`);
  }
  const n = Math.min(Math.max(parseInt(String(nOpt?.value ?? 10), 10) || 10, 1), 25);

  const players = await loadIndex(env);
  const meta = STAT_META[stat];
  const valid = players.filter((p) => p[stat] !== null);

  valid.sort((a, b) => {
    const va = a[stat] as number;
    const vb = b[stat] as number;
    return meta.lowerBetter ? va - vb : vb - va;
  });

  const top = valid.slice(0, n);
  const lines = top.map((p, i) => {
    const v = p[stat] as number;
    const valStr = `${v.toFixed(meta.digits)}${meta.unit ?? ""}`;
    const rank = String(i + 1).padStart(2);
    return `\`${rank}\` **${valStr}** — ${p.name} (${p.team ?? "—"})`;
  });

  const embed: Embed = {
    title: `Leaderboard — ${meta.label}`,
    description: lines.join("\n") || "_no data_",
    color: 0xf97316,
    footer: {
      text: `2025 · min 50 PA${meta.lowerBetter ? " · lower is better" : ""}`,
    },
  };

  return { type: CHANNEL_MESSAGE, data: { embeds: [embed] } };
}

export { LEADERBOARD_CHOICES };
