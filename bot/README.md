# statcast-bullpen-bot

Cloudflare Worker that powers the `/player` and `/leaderboard` slash commands in Discord. Reads from `data/index.json` + `data/players/*.json` on GitHub raw (refreshed nightly by the pipeline).

## Architecture

```
Discord  ──POST /interactions──►  Cloudflare Worker  ──fetch──►  raw.githubusercontent.com
                                       (cache 1h)
```

Stateless. Worker verifies ed25519 signature, fetches JSON, returns an embed within the 3s interaction window.

## One-time setup

### 1. Create the Discord app

1. https://discord.com/developers/applications → **New Application**
2. Copy **Application ID** and **Public Key** (General Info tab).
3. Bot tab → **Reset Token**, copy the bot token.

### 2. Install + deploy the Worker

```bash
cd bot
npm install
npx wrangler login
npx wrangler deploy
```

This deploys to `https://statcast-bullpen-bot.<your-subdomain>.workers.dev`.

### 3. Set the public key as a secret

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
# paste the Public Key from step 1
```

### 4. Register the slash commands

```bash
DISCORD_APP_ID=<app id> DISCORD_BOT_TOKEN=<bot token> npm run register
```

Global commands take up to ~1 hour to propagate. For instant testing, change the script to a guild-scoped endpoint.

### 5. Point Discord at the Worker

In the Developer Portal → **Interactions Endpoint URL**:

```
https://statcast-bullpen-bot.<your-subdomain>.workers.dev/interactions
```

Discord pings the URL to verify; the Worker responds to `PING` automatically.

### 6. Install the bot in a server

OAuth2 tab → URL Generator → scopes: `applications.commands`. Open the generated link and authorize.

## Local dev

```bash
npm run dev
```

To test signature-verified calls locally, use [`discord-interactions-js` examples](https://github.com/discord/discord-example-app) or `wrangler tail` against the deployed Worker.

## Commands

### `/player name:<str>`

Fuzzy match by name (exact → starts-with → substring → last-name token). Returns an embed with all nine Statcast stats and percentile ranks. Links back to the site player page.

### `/leaderboard stat:<choice> [n:<1-25>]`

Top N hitters for the chosen stat, min 50 PA. K% is sorted ascending (lower-better); everything else descending.

## Data refresh

The Worker uses Cloudflare's edge cache (`cf.cacheTtl`) with `DATA_TTL_SECONDS` (default 3600). The pipeline runs nightly via GitHub Actions; the bot picks up new data within an hour of cache expiry.

To force a refresh after a manual pipeline run, redeploy the Worker (new deployment busts the cache) or set a shorter TTL in `wrangler.toml`.
