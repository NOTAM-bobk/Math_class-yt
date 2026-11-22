import { createFileRoute } from "@tanstack/react-router";

// Same-origin relay for every third-party request the app makes. Filtered networks routinely
// allow the site you are already on while blocking the mirror API, the image proxy and the video
// host, so the server fetches them and streams the answer back from a URL on this origin.
// Targets are base64url encoded so no blockable hostname appears in the request path either.
const PASS_THROUGH = [
  "content-type",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "content-disposition",
];

const HEADER_TIMEOUT = 12_000;
const SIZE_TTL = 10 * 60_000;

// Piped's proxy answers a bounded range with the right bytes but reports the chunk length as the
// file size ("bytes 0-1/2" for a 12 MB video), which makes Safari reject playback and breaks
// seeking. Real sizes are cached per media URL, since one video session reuses one URL.
const sizes = new Map<string, { total: number; at: number }>();

async function trueSize(url: string): Promise<number | null> {
  const cached = sizes.get(url);
  if (cached && Date.now() - cached.at < SIZE_TTL) return cached.total;
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
    const total = Number(res.headers.get("content-length"));
    if (res.ok && Number.isFinite(total) && total > 0) {
      if (sizes.size > 250) sizes.clear();
      sizes.set(url, { total, at: Date.now() });
      return total;
    }
  } catch {
    /* fall back to the upstream header */
  }
  return null;
}

function parseRange(header: string | null) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  if (!Number.isFinite(start) || (end !== undefined && (!Number.isFinite(end) || end < start))) {
    return null;
  }
  return { start, end };
}

// Rewrites a content-range header the upstream got wrong, in place. Piped puts the chunk length
// where the end offset and the file size belong, so the only trustworthy values are the first
// byte offset and the real size from HEAD; the end comes from the range we asked for.
async function repairContentRange(
  headers: Headers,
  range: { start: number; end?: number } | null,
  upstreamValue: string | null,
  contentType: string,
  target: string,
) {
  if (!range || !upstreamValue) return;
  if (!/^(video|audio)\//i.test(contentType)) return;
  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(upstreamValue.trim());
  if (!match) return;
  const start = Number(match[1]);
  if (!Number.isFinite(start)) return;
  const real = await trueSize(target);
  if (!real) return;
  const end = Math.min(range.end ?? real - 1, real - 1);
  if (end < start) {
    headers.delete("content-range");
    return;
  }
  headers.set("content-range", `bytes ${start}-${end}/${real}`);
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

// Never let the relay be pointed at this machine's network or a plaintext origin.
function isPublicHttps(target: URL) {
  if (target.protocol !== "https:") return false;
  const host = target.hostname.toLowerCase();
  if (host.startsWith("[")) return false;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  if (/^(0|10|127)\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) {
    return false;
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}

function targetFrom(raw: string | null): URL | null {
  if (!raw) return null;
  const candidates = [raw];
  try {
    candidates.unshift(decodeBase64Url(raw));
  } catch {
    /* not base64url */
  }
  try {
    if (/^https?%3A/i.test(raw)) candidates.push(decodeURIComponent(raw));
  } catch {
    /* not percent encoded */
  }
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (isPublicHttps(url)) return url;
    } catch {
      /* try the next form */
    }
  }
  return null;
}

async function relay(request: Request): Promise<Response> {
  const target = targetFrom(new URL(request.url).searchParams.get("u"));
  if (!target) {
    return new Response("Unsupported relay target", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const forward = new Headers();
  for (const name of ["range", "accept", "accept-language"]) {
    const value = request.headers.get(name);
    if (value) forward.set(name, value);
  }

  // Piped ignores "bytes=N-" and sends the whole file, so a seek would restart the download.
  // Turn it into a bounded range once the real size is known; the first load (bytes=0-) is left
  // alone so playback starts without waiting on an extra request.
  const seek = parseRange(forward.get("range"));
  if (seek && seek.end === undefined && seek.start > 0 && request.method !== "HEAD") {
    const total = await trueSize(target.href);
    if (total && total > seek.start) forward.set("range", `bytes=${seek.start}-${total - 1}`);
  }

  // Only the wait for response headers is bounded; the body streams for as long as the player
  // needs it, so a two hour video never has to be buffered here.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEADER_TIMEOUT);
  let upstream: Response;
  try {
    upstream = await fetch(target.href, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: forward,
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    console.error("relay failed", target.host, error);
    return new Response("Could not reach the source host", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } finally {
    clearTimeout(timer);
  }

  const headers = new Headers();
  for (const name of PASS_THROUGH) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  await repairContentRange(
    headers,
    parseRange(forward.get("range")),
    upstream.headers.get("content-range"),
    upstream.headers.get("content-type") ?? "",
    target.href,
  );
  // Deliberately no content-length: the runtime decompresses the upstream body, so the original
  // header would not match the bytes we hand back.
  headers.set("cache-control", upstream.headers.get("cache-control") ?? "private, max-age=0");
  headers.set("x-content-type-options", "nosniff");

  return new Response(upstream.body, { status: upstream.status, headers });
}

export const Route = createFileRoute("/api/proxy")({
  server: {
    handlers: {
      GET: ({ request }) => relay(request),
      HEAD: ({ request }) => relay(request),
    },
  },
});
