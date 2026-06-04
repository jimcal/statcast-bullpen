"""
Statcast Bullpen — data pipeline
Pulls season-to-date batting data and writes flat JSON for the site.

Sources:
  - statcast_batter_exitvelo_barrels  → EV, barrel%, hard hit%
  - statcast_batter_expected_stats    → xwOBA, xBA, PA
  - batting_stats_bref                → K%, BB% (calculated from SO/BB/PA)
  - statcast_sprint_speed             → sprint speed
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import pybaseball

SEASON = 2025
MIN_PA = 50
DATA_DIR = Path(__file__).parent.parent / "data"


def bail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def percentile_rank(series: pd.Series, value: float) -> int:
    """Return 0–100 percentile of value within series."""
    valid = series.dropna()
    if len(valid) == 0:
        return 50
    below = (valid < value).sum()
    return int(round(below / len(valid) * 100))


# ── Data pulls ──────────────────────────────────────────────────────────────

def pull_exit_velo(season: int) -> pd.DataFrame:
    """Returns: player_id, name, team, attempts, avg_exit_velo, max_exit_velo,
                barrel_pct (brl_pa), hard_hit_pct (ev95percent), barrels count."""
    print(f"Pulling exit velo / barrel data for {season}...")
    try:
        df = pybaseball.statcast_batter_exitvelo_barrels(season, minBBE=1)
    except Exception as e:
        bail(f"statcast_batter_exitvelo_barrels failed: {e}")
    if df is None or df.empty:
        bail("statcast_batter_exitvelo_barrels returned empty data")

    # Column 'last_name, first_name' is a single col with "Last, First" values
    name_col = "last_name, first_name"
    if name_col not in df.columns:
        bail(f"Expected column '{name_col}' not found. Got: {list(df.columns)}")

    df["name"] = df[name_col].apply(
        lambda s: " ".join(reversed([p.strip() for p in str(s).split(",", 1)]))
    )

    out = df.rename(columns={
        "player_id": "id",
        "attempts": "pa",          # batted ball events (good PA proxy)
        "avg_hit_speed": "avg_exit_velo",
        "max_hit_speed": "max_exit_velo",
        "brl_pa": "barrel_pct",    # barrels / PA * 100
        "ev95percent": "hard_hit_pct",  # pct balls 95+ mph
    })

    keep = ["id", "name", "pa", "avg_exit_velo", "max_exit_velo", "barrel_pct", "hard_hit_pct"]
    out = out[keep].copy()
    out["id"] = out["id"].astype(int)
    print(f"  {len(out)} rows from exit velo pull")
    return out


def pull_expected_stats(season: int) -> pd.DataFrame:
    """Returns: player_id, xwoba (est_woba), xba (est_ba), pa."""
    print(f"Pulling expected stats (xwOBA/xBA) for {season}...")
    try:
        df = pybaseball.statcast_batter_expected_stats(season, minPA=1)
    except Exception as e:
        bail(f"statcast_batter_expected_stats failed: {e}")
    if df is None or df.empty:
        bail("statcast_batter_expected_stats returned empty data")

    out = df.rename(columns={
        "player_id": "id",
        "est_woba": "xwoba",
        "est_ba": "xba",
        "pa": "pa_xstats",
    })
    keep = ["id", "xwoba", "xba", "pa_xstats"]
    out = out[keep].copy()
    out["id"] = out["id"].astype(int)
    print(f"  {len(out)} rows from expected stats pull")
    return out


def pull_bref(season: int) -> pd.DataFrame:
    """Returns: mlbID, k_pct, bb_pct (computed from SO/BB/PA)."""
    print(f"Pulling Baseball Reference batting stats for {season}...")
    try:
        df = pybaseball.batting_stats_bref(season)
    except Exception as e:
        print(f"  WARNING: batting_stats_bref failed ({e}), K%/BB% will be null")
        return pd.DataFrame()
    if df is None or df.empty:
        print("  WARNING: batting_stats_bref returned empty data, K%/BB% will be null")
        return pd.DataFrame()

    if "mlbID" not in df.columns or "SO" not in df.columns or "BB" not in df.columns:
        print(f"  WARNING: unexpected BREF columns {list(df.columns)}, K%/BB% will be null")
        return pd.DataFrame()

    df = df.copy()
    df["PA"] = pd.to_numeric(df["PA"], errors="coerce")
    df["SO"] = pd.to_numeric(df["SO"], errors="coerce")
    df["BB"] = pd.to_numeric(df["BB"], errors="coerce")
    df = df[df["PA"] > 0].copy()
    df["k_pct"] = (df["SO"] / df["PA"] * 100).round(1)
    df["bb_pct"] = (df["BB"] / df["PA"] * 100).round(1)
    df["mlbID"] = pd.to_numeric(df["mlbID"], errors="coerce")
    df = df.dropna(subset=["mlbID"])
    df["mlbID"] = df["mlbID"].astype(int)

    out = df[["mlbID", "k_pct", "bb_pct"]].rename(columns={"mlbID": "id"})
    # Multiple stints per player — aggregate by weighted sum
    out = out.groupby("id")[["k_pct", "bb_pct"]].mean().reset_index()
    print(f"  {len(out)} players from BREF pull")
    return out


def pull_sprint_speed(season: int) -> pd.DataFrame:
    """Returns: player_id, sprint_speed (ft/s), team (abbrev if available)."""
    print(f"Pulling sprint speed for {season}...")
    try:
        df = pybaseball.statcast_sprint_speed(season, min_opp=1)
    except Exception as e:
        print(f"  WARNING: sprint speed pull failed ({e}), will use null")
        return pd.DataFrame()
    if df is None or df.empty:
        print("  WARNING: sprint speed returned empty, will use null")
        return pd.DataFrame()

    id_col = next((c for c in df.columns if c in ("player_id", "mlbam_id", "id")), None)
    spd_col = next((c for c in df.columns if "sprint_speed" in c.lower()), None)
    if not id_col or not spd_col:
        print(f"  WARNING: can't find id/speed cols in {list(df.columns)}, skipping")
        return pd.DataFrame()

    keep = [id_col, spd_col]
    rename = {id_col: "id", spd_col: "sprint_speed"}
    if "team" in df.columns:
        keep.append("team")

    out = df[keep].rename(columns=rename).copy()
    out["id"] = pd.to_numeric(out["id"], errors="coerce").dropna().astype(int)
    print(f"  {len(out)} players from sprint speed pull")
    return out


# ── Merge ───────────────────────────────────────────────────────────────────

def build_players(
    ev: pd.DataFrame,
    xs: pd.DataFrame,
    bref: pd.DataFrame,
    spd: pd.DataFrame,
    season: int,
) -> pd.DataFrame:
    # Start from exit velo (has name + team proxy)
    # But exit velo doesn't have team — pull team from expected stats' source
    # Actually expected stats has no team either. Use sprint speed or bref Name.
    # For now attach team from expected stats via a second lookup if available.
    # Filter by PA first
    ev = ev[ev["pa"] >= MIN_PA].copy()
    print(f"  {len(ev)} players after PA>={MIN_PA} filter")

    # Merge xwoba / xba
    merged = ev.merge(xs[["id", "xwoba", "xba"]], on="id", how="left")

    # Merge K%/BB%
    if not bref.empty:
        merged = merged.merge(bref, on="id", how="left")
    else:
        merged["k_pct"] = None
        merged["bb_pct"] = None

    # Merge sprint speed (also carries team abbrev)
    if not spd.empty:
        merged = merged.merge(spd, on="id", how="left")
    else:
        merged["sprint_speed"] = None
        merged["team"] = None

    # If sprint speed didn't supply team, default to null
    if "team" not in merged.columns:
        merged["team"] = None

    return merged


# ── Serialization ────────────────────────────────────────────────────────────

def _r(val, d: int):
    """Round val to d decimals; None if missing."""
    try:
        if pd.isna(val):
            return None
        return round(float(val), d)
    except (TypeError, ValueError):
        return None


def serialize_player(row: pd.Series) -> dict:
    return {
        "id": int(row["id"]),
        "name": str(row["name"]),
        "team": str(row["team"]) if pd.notna(row.get("team")) else None,
        "pa": int(row["pa"]),
        "avg_exit_velo": _r(row.get("avg_exit_velo"), 1),
        "max_exit_velo": _r(row.get("max_exit_velo"), 1),
        "barrel_pct": _r(row.get("barrel_pct"), 1),
        "hard_hit_pct": _r(row.get("hard_hit_pct"), 1),
        "xwoba": _r(row.get("xwoba"), 3),
        "xba": _r(row.get("xba"), 3),
        "k_pct": _r(row.get("k_pct"), 1),
        "bb_pct": _r(row.get("bb_pct"), 1),
        "sprint_speed": _r(row.get("sprint_speed"), 1),
    }


# Stats where higher = better (standard direction for percentile display)
STATS_HIGHER_BETTER = [
    "avg_exit_velo", "max_exit_velo", "barrel_pct", "hard_hit_pct",
    "xwoba", "xba", "bb_pct", "sprint_speed",
]
# Stats where lower = better → invert rank
STATS_LOWER_BETTER = ["k_pct"]


def compute_percentiles(df: pd.DataFrame, row: pd.Series) -> dict:
    result = {}
    for stat in STATS_HIGHER_BETTER:
        val = row.get(stat)
        if val is None or (hasattr(val, '__float__') and pd.isna(val)):
            result[stat] = None
        else:
            result[stat] = percentile_rank(df[stat], float(val))
    for stat in STATS_LOWER_BETTER:
        val = row.get(stat)
        if val is None or (hasattr(val, '__float__') and pd.isna(val)):
            result[stat] = None
        else:
            result[stat] = 100 - percentile_rank(df[stat], float(val))
    return result


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Pull Statcast + BREF batting data")
    parser.add_argument("--season", type=int, default=SEASON)
    args = parser.parse_args()
    season = args.season

    print(f"=== Statcast Bullpen pipeline — season {season} ===")
    pybaseball.cache.enable()

    ev = pull_exit_velo(season)
    xs = pull_expected_stats(season)
    bref = pull_bref(season)
    spd = pull_sprint_speed(season)

    players_df = build_players(ev, xs, bref, spd, season)

    if players_df.empty:
        bail("No players survived merge/filter")

    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "players").mkdir(exist_ok=True)

    # Write index.json
    records = [serialize_player(row) for _, row in players_df.iterrows()]
    (DATA_DIR / "index.json").write_text(json.dumps(records, indent=2))

    # Write per-player shards
    for _, row in players_df.iterrows():
        player = serialize_player(row)
        player["percentiles"] = compute_percentiles(players_df, row)
        (DATA_DIR / "players" / f"{player['id']}.json").write_text(
            json.dumps(player, indent=2)
        )

    # Write meta.json
    meta = {
        "updated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "season": season,
        "player_count": len(records),
    }
    (DATA_DIR / "meta.json").write_text(json.dumps(meta, indent=2))

    print(f"Wrote {len(records)} players to data/")


if __name__ == "__main__":
    main()
