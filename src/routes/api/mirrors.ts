import { createFileRoute } from "@tanstack/react-router";

// Piped publishes its instance list for clients to parse. Serving it from our own origin means the
// browser never has to reach the list host, and new instances show up without a redeploy.
const LIST_URL = "https://piped-instances.kavin.rocks/";
const TTL = 10 * 60_000;

let cache: { at: number; mirrors: { api: string; label: string }[] } | null = null;

async function instances() {
  if (cache && Date.now() - cache.at < TTL) return cache.mirrors;
  try {
    const res = await fetch(LIST_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { api_url?: string; uptime_24h?: number }[];
    if (!Array.isArray(body)) throw new Error("Unexpected instance list");
    const mirrors = body.flatMap((entry) => {
      if (typeof entry.api_url !== "string") return [];
      if ((entry.uptime_24h ?? 100) < 50) return [];
      try {
        const url = new URL(entry.api_url);
        if (url.protocol !== "https:") return [];
        return [{ api: url.origin + url.pathname.replace(/\/+$/, ""), label: url.host }];
      } catch {
        return [];
      }
    });
    cache = { at: Date.now(), mirrors };
    return mirrors;
  } catch (error) {
    // Cache the miss too, so a slow or blocked list host is not retried on every page load.
    console.error("mirror discovery failed", error);
    const mirrors = cache?.mirrors ?? [];
    cache = { at: Date.now(), mirrors };
    return mirrors;
  }
}

export const Route = createFileRoute("/api/mirrors")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ mirrors: await instances() }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "private, max-age=600",
          },
        }),
    },
  },
});
