#!/usr/bin/env node
/**
 * Register global slash commands with Discord.
 * Requires env: DISCORD_APP_ID, DISCORD_BOT_TOKEN
 *
 * Usage: DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... node scripts/register-commands.mjs
 */

const APP_ID = process.env.DISCORD_APP_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !TOKEN) {
  console.error("Missing DISCORD_APP_ID or DISCORD_BOT_TOKEN env");
  process.exit(1);
}

const STAT_CHOICES = [
  { name: "xwOBA", value: "xwoba" },
  { name: "xBA", value: "xba" },
  { name: "Barrel %", value: "barrel_pct" },
  { name: "Hard-Hit %", value: "hard_hit_pct" },
  { name: "Avg Exit Velo", value: "avg_exit_velo" },
  { name: "Max Exit Velo", value: "max_exit_velo" },
  { name: "K %", value: "k_pct" },
  { name: "BB %", value: "bb_pct" },
  { name: "Sprint Speed", value: "sprint_speed" },
];

const commands = [
  {
    name: "player",
    description: "Show a hitter's Statcast percentile card",
    options: [
      {
        type: 3, // STRING
        name: "name",
        description: "Player name (partial OK, e.g. 'judge')",
        required: true,
      },
    ],
  },
  {
    name: "leaderboard",
    description: "Top N hitters by a stat (min 50 PA)",
    options: [
      {
        type: 3,
        name: "stat",
        description: "Which stat to rank",
        required: true,
        choices: STAT_CHOICES,
      },
      {
        type: 4, // INTEGER
        name: "n",
        description: "How many to show (1-25, default 10)",
        required: false,
        min_value: 1,
        max_value: 25,
      },
    ],
  },
];

const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;
const res = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(commands),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Registration failed (${res.status}):`, text);
  process.exit(1);
}
console.log("Registered", commands.length, "commands:");
console.log(text);
