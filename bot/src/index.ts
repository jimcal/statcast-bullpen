import { verifyKey } from "discord-interactions";
import type { Env } from "./types";
import { handlePlayer, handleLeaderboard } from "./commands";

const PING = 1;
const APPLICATION_COMMAND = 2;
const PONG = 1;

type InteractionOption = { name: string; value: string | number };

type Interaction = {
  type: number;
  data?: {
    name: string;
    options?: InteractionOption[];
  };
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/") {
      return new Response("statcast-bullpen-bot — POST /interactions", {
        headers: { "content-type": "text/plain" },
      });
    }

    if (req.method !== "POST" || url.pathname !== "/interactions") {
      return new Response("not found", { status: 404 });
    }

    const signature = req.headers.get("x-signature-ed25519");
    const timestamp = req.headers.get("x-signature-timestamp");
    if (!signature || !timestamp) {
      return new Response("missing signature headers", { status: 401 });
    }
    const body = await req.text();
    const valid = await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!valid) {
      return new Response("bad request signature", { status: 401 });
    }

    const interaction: Interaction = JSON.parse(body);

    if (interaction.type === PING) {
      return json({ type: PONG });
    }

    if (interaction.type === APPLICATION_COMMAND && interaction.data) {
      const { name, options = [] } = interaction.data;
      try {
        if (name === "player") {
          return json(await handlePlayer(env, options));
        }
        if (name === "leaderboard") {
          return json(await handleLeaderboard(env, options));
        }
        return json({
          type: 4,
          data: { content: `Unknown command: ${name}`, flags: 1 << 6 },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return json({
          type: 4,
          data: { content: `Error: ${msg}`, flags: 1 << 6 },
        });
      }
    }

    return new Response("unhandled interaction type", { status: 400 });
  },
};
