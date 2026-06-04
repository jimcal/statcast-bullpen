import type { Player } from "./types";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function findPlayer(players: Player[], query: string): Player | null {
  const q = normalize(query);
  if (!q) return null;

  // Exact match
  const exact = players.find((p) => normalize(p.name) === q);
  if (exact) return exact;

  // Startswith
  const starts = players.filter((p) => normalize(p.name).startsWith(q));
  if (starts.length > 0) {
    starts.sort((a, b) => b.pa - a.pa);
    return starts[0]!;
  }

  // Substring
  const subs = players.filter((p) => normalize(p.name).includes(q));
  if (subs.length > 0) {
    subs.sort((a, b) => b.pa - a.pa);
    return subs[0]!;
  }

  // Last name match
  const lastTokens = players.filter((p) => {
    const parts = normalize(p.name).split(/\s+/);
    return parts.some((t) => t === q);
  });
  if (lastTokens.length > 0) {
    lastTokens.sort((a, b) => b.pa - a.pa);
    return lastTokens[0]!;
  }

  return null;
}
