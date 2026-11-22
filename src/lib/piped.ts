// Volunteer-run Piped mirrors. Every request leaves through this site's own /api/proxy relay, so
// the browser only ever talks to this origin. That matters on filtered networks, where the
// mirror API, its image proxy and the video host are usually blocked too — not just YouTube.
export type Backend = {
  id: string;
  label: string;
  api: string;
  web: string;
  image?: string;
  custom?: boolean;
};

export type Video = {
  id: string;
  title: string;
  thumbnail: string;
  thumbnails: string[];
  uploaderName?: string;
  uploaderAvatar?: string;
  duration?: number;
  views?: number;
  uploadedDate?: string;
  isShort?: boolean;
};

export type MediaFile = { url: string; quality: string; itag: number };

export type Stream = {
  id: string;
  title: string;
  description?: string;
  uploader?: string;
  uploaderAvatar?: string;
  views?: number;
  likes?: number;
  uploadDate?: string;
  thumbnail: string;
  live: boolean;
  related: Video[];
  files: MediaFile[];
  backend: Backend;
};

export type Player = { id: string; label: string; host: string; src: string; proxied: boolean };

export const BUILTINS: Backend[] = [
  {
    id: "private",
    label: "private.coffee",
    api: "https://api.piped.private.coffee",
    web: "https://piped.private.coffee",
    image: "https://proxy.piped.private.coffee",
  },
  {
    id: "ducks",
    label: "ducks.party",
    api: "https://pipedapi.ducks.party",
    web: "https://piped.ducks.party",
    image: "https://piped-proxy.ducks.party",
  },
  {
    id: "kavin",
    label: "kavin.rocks",
    api: "https://pipedapi.kavin.rocks",
    web: "https://piped.video",
  },
];

// Documented public instances that are tried only after the visible mirrors fail. Availability
// changes constantly, so racing them costs nothing when a mirror works and often rescues a video
// that one instance's IP is being bot-checked on.
const FALLBACKS: Backend[] = [
  { id: "piped-yt", label: "piped.yt", api: "https://api.piped.yt", web: "https://piped.yt" },
  {
    id: "leptons",
    label: "leptons.xyz",
    api: "https://pipedapi.leptons.xyz",
    web: "https://piped.leptons.xyz",
  },
  {
    id: "nosebs",
    label: "nosebs.ru",
    api: "https://pipedapi.nosebs.ru",
    web: "https://piped.nosebs.ru",
  },
  {
    id: "libre",
    label: "libre.kavin.rocks",
    api: "https://pipedapi-libre.kavin.rocks",
    web: "https://piped-libre.kavin.rocks",
  },
  {
    id: "privacy-com-de",
    label: "privacy.com.de",
    api: "https://piped-api.privacy.com.de",
    web: "https://piped.privacy.com.de",
  },
  {
    id: "owo",
    label: "owo.si",
    api: "https://pipedapi.owo.si",
    web: "https://piped.owo.si",
  },
  {
    id: "codespace",
    label: "codespace.cz",
    api: "https://piped-api.codespace.cz",
    web: "https://piped.codespace.cz",
  },
  {
    id: "drgns",
    label: "drgns.space",
    api: "https://pipedapi.drgns.space",
    web: "https://piped.drgns.space",
  },
  {
    id: "orangenet",
    label: "orangenet.cc",
    api: "https://pipedapi.orangenet.cc",
    web: "https://piped.orangenet.cc",
  },
];

let discovered: Backend[] = [];
let discoveredAt = 0;
let discovering: Promise<void> | null = null;

function webFromApi(host: string) {
  return (
    "https://" +
    host
      .replace(/^pipedapi-/, "piped-")
      .replace(/^pipedapi\./, "piped.")
      .replace(/^piped-api\./, "piped.")
      .replace(/^api\.piped\./, "piped.")
  );
}

// Discovers further mirrors from Piped's public instance list through this site's server. Best
// effort: on a network without the list, the built-in and fallback mirrors are still used.
export async function discoverMirrors(): Promise<void> {
  if (typeof window === "undefined") return;
  if (Date.now() - discoveredAt < 10 * 60_000) return;
  if (discovering) return discovering;
  discovering = (async () => {
    try {
      const res = await fetch("/api/mirrors", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const body = (await res.json()) as { mirrors?: { api?: string }[] };
      const found: Backend[] = [];
      for (const item of body.mirrors ?? []) {
        if (typeof item.api !== "string") continue;
        try {
          const url = new URL(item.api);
          if (url.protocol !== "https:") continue;
          found.push({
            id: "auto:" + url.host,
            label: url.host,
            api: url.origin + url.pathname.replace(/\/+$/, ""),
            web: webFromApi(url.host),
          });
        } catch {
          /* skip malformed entry */
        }
      }
      if (found.length) {
        discovered = found;
        window.dispatchEvent(new Event("ot-mirrors"));
      }
    } catch {
      /* discovery is optional */
    } finally {
      discoveredAt = Date.now();
      discovering = null;
    }
  })();
  return discovering;
}

const CUSTOM_KEY = "ot.customMirror.v1";
const ACTIVE_KEY = "ot.activeMirror.v1";
const TIMEOUT = 10_000;

// Puts a remote URL behind this site's relay. The short base64url form keeps blockable hostnames
// out of the path, so a network that filters URLs is not tipped off by "googlevideo" or "piped".
export function relayUrl(url: string) {
  let encoded = "";
  try {
    encoded = btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    /* fall back to percent encoding below */
  }
  return "/api/proxy?u=" + (encoded || encodeURIComponent(url));
}

const store = {
  get(key: string) {
    try {
      return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* private mode */
    }
  },
};

// Turn whatever host the user pastes into an API base plus the matching frontend host, so the
// embed player is served by the same mirror as the metadata.
function parseMirror(raw: string): Backend | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const api = url.origin + url.pathname.replace(/\/+$/, "");
    const host = url.host.replace(/^api\./, "").replace(/^pipedapi\./, "piped.");
    return {
      id: "custom",
      label: new URL(api).host,
      api,
      web: url.protocol + "//" + host,
      custom: true,
    };
  } catch {
    return null;
  }
}

export function mirrors(): Backend[] {
  const raw = store.get(CUSTOM_KEY);
  const custom = raw ? parseMirror(raw) : null;
  return [...BUILTINS, ...discovered, ...(custom ? [custom] : [])];
}

export function activeMirror(): Backend {
  const list = mirrors();
  const id = store.get(ACTIVE_KEY);
  return list.find((b) => b.id === id) ?? list[0]!;
}

export function setActiveMirror(id: string) {
  store.set(ACTIVE_KEY, id);
}

// Saves a user-supplied mirror, but only after it answers a real request.
export async function addCustomMirror(raw: string): Promise<string | null> {
  const backend = parseMirror(raw);
  if (!backend) return "Enter a full URL, for example https://api.piped.private.coffee";
  try {
    await request<unknown>(backend, "/trending?region=US");
  } catch {
    return "That mirror did not answer. Check the API URL and try again.";
  }
  store.set(CUSTOM_KEY, backend.api);
  store.set(ACTIVE_KEY, backend.id);
  return null;
}

export function clearCustomMirror() {
  store.remove(CUSTOM_KEY);
  store.remove(ACTIVE_KEY);
}

export function videoId(url?: string) {
  const m = /(?:v=|\/shorts\/|\/embed\/|\/live\/|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url ?? "");
  return m?.[1] ?? "";
}

export function urlVideoId(input: string) {
  return /youtu\.?be/i.test(input) ? videoId(input) : "";
}

export function isShortUrl(input: string) {
  return /youtu\.?be\/shorts\//i.test(input);
}

// A mirror answering with an extraction error (age-gated, region-locked, bot check) is a very
// different problem from a mirror that cannot be reached, and the UI should say which.
export class MirrorError extends Error {
  readonly upstream: boolean;

  constructor(message: string, upstream = false) {
    super(message);
    this.name = "MirrorError";
    this.upstream = upstream;
  }
}

function upstreamMessage(raw: string) {
  const line = raw.split("\n")[0]?.trim() ?? "";
  return line.replace(/^[\w.$]+(?:Exception|Error):\s*/, "").slice(0, 200);
}

async function request<T>(backend: Backend, path: string, timeout = TIMEOUT): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const remote = backend.api + path;
    // Queries run in the browser, where the mirror host may be blocked but this origin is not.
    const target = typeof window === "undefined" ? remote : relayUrl(remote);
    const res = await fetch(target, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    let data: (T & { error?: string }) | null = null;
    try {
      data = text ? (JSON.parse(text) as T & { error?: string }) : null;
    } catch {
      data = null;
    }
    const upstream = typeof data?.error === "string" ? upstreamMessage(data.error) : "";
    if (!res.ok || upstream) {
      throw new MirrorError(upstream || `HTTP ${res.status}`, Boolean(upstream));
    }
    if (!data || typeof data !== "object") throw new MirrorError("Empty mirror response");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Try the mirror the user picked first, then race every other source so one bad host IP never
// turns into a dead page. Discovery and fallbacks are only paid for on the failure path.
async function api<T>(path: string): Promise<{ data: T; backend: Backend }> {
  const primary = activeMirror();
  let primaryFailure: Error | undefined;
  try {
    return { data: await request<T>(primary, path), backend: primary };
  } catch (error) {
    primaryFailure = error as Error;
  }

  // Discovery runs alongside the race: the documented fallbacks are tried immediately, and any
  // newly discovered instance is available for the next failure without delaying this one.
  void discoverMirrors();
  const others = [...mirrors(), ...FALLBACKS].filter(
    (backend, index, all) =>
      backend.api !== primary.api && all.findIndex((b) => b.api === backend.api) === index,
  );
  try {
    const hit = await Promise.any(
      others.map(async (backend) => ({
        data: await request<T>(backend, path, 10_000),
        backend,
      })),
    );
    if (hit.backend.api !== primary.api) setActiveMirror(hit.backend.id);
    return hit;
  } catch (error) {
    const failures = [
      primaryFailure,
      ...(((error as AggregateError).errors ?? []) as Error[]),
    ].filter((e): e is Error => e instanceof Error);
    const upstream = failures.filter(
      (e): e is MirrorError => e instanceof MirrorError && e.upstream,
    );
    // A refusal from any source that answered is more useful than "unreachable", even when the
    // other fallback hosts happen to be down.
    if (upstream.length > 0) {
      throw new MirrorError(
        `YouTube refused this video on the sources that answered (${upstream[0]!.message}). That is usually temporary — try again in a moment or pick another source.`,
        true,
      );
    }
    throw new MirrorError(
      "Every source is unreachable right now. Check your connection, then try again or pick another source.",
    );
  }
}

const YT_IMAGE_HOST = /(^|\.)(ytimg\.com|ggpht\.com|youtube\.com|googleusercontent\.com)$/;

// Piped proxies raw YouTube image URLs as /<path>?host=<original host>. Responses already proxied
// by a mirror pass through untouched.
function mirrorImage(url: string, backend: Backend): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!YT_IMAGE_HOST.test(parsed.hostname) || !backend.image) return url;
    const path = parsed.pathname.replace(/^\//, "");
    const query = parsed.search ? "&" + parsed.search.slice(1) : "";
    return `${backend.image}/${path}?host=${parsed.hostname}${query}`;
  } catch {
    return url;
  }
}

// Images go through the relay as well: the mirror's image host is its own domain and is blocked
// on the same networks that block the API.
export function proxyImage(url: string | undefined, backend: Backend): string {
  if (!url) return "";
  return relayUrl(mirrorImage(url, backend));
}

function thumbnailCandidates(id: string, url: string, backend: Backend): string[] {
  const list = [mirrorImage(url, backend)];
  if (id) {
    for (const mirror of mirrors()) {
      if (mirror.image && mirror.id !== backend.id) {
        list.push(`${mirror.image}/vi/${id}/hqdefault.jpg?host=i.ytimg.com`);
      }
    }
  }
  const unique = [...new Set(list.filter(Boolean))];
  return unique.length ? unique.map((candidate) => relayUrl(candidate)) : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

function toVideo(x: Raw, backend: Backend): Video {
  const id = videoId(x?.url);
  return {
    id,
    title: typeof x?.title === "string" ? x.title : "",
    thumbnail: proxyImage(x?.thumbnail, backend),
    thumbnails: thumbnailCandidates(id, x?.thumbnail ?? "", backend),
    uploaderName: x?.uploaderName,
    uploaderAvatar: proxyImage(x?.uploaderAvatar, backend),
    duration: x?.duration,
    views: x?.views,
    uploadedDate: x?.uploadedDate,
    isShort: Boolean(x?.isShort),
  };
}

function clean(items: Raw[], backend: Backend): Video[] {
  return (items ?? [])
    .filter((x) => x && x.type !== "channel" && x.type !== "playlist")
    .map((x) => toVideo(x, backend))
    .filter((v) => v.id);
}

export const trending = async (region = "US"): Promise<Video[]> => {
  const { data, backend } = await api<Raw[]>(`/trending?region=${region}`);
  return clean(Array.isArray(data) ? data : [], backend);
};

export const search = async (q: string): Promise<Video[]> => {
  const { data, backend } = await api<{ items?: Raw[] }>(
    "/search?q=" + encodeURIComponent(q) + "&filter=videos",
  );
  return clean(data.items ?? [], backend);
};

function toStream(d: Raw, backend: Backend, id: string): Stream {
  const files: MediaFile[] = (Array.isArray(d?.videoStreams) ? d.videoStreams : [])
    .filter(
      (v: Raw) =>
        typeof v?.url === "string" &&
        typeof v?.mimeType === "string" &&
        v.mimeType.startsWith("video/mp4") &&
        !v.videoOnly &&
        Number(v.itag) > 0,
    )
    .map((v: Raw) => ({
      // Relayed so the player never opens googlevideo.com (or the mirror's proxy host) itself.
      url: relayUrl(String(v.url)),
      quality: String(v.quality ?? "auto"),
      itag: Number(v.itag),
    }))
    .filter(
      (f: MediaFile, i: number, all: MediaFile[]) => all.findIndex((x) => x.itag === f.itag) === i,
    )
    .sort((a: MediaFile, b: MediaFile) => a.itag - b.itag);

  return {
    id,
    title: typeof d?.title === "string" ? d.title : "Video",
    description: typeof d?.description === "string" ? d.description : undefined,
    uploader: d?.uploader,
    uploaderAvatar: proxyImage(d?.uploaderAvatar, backend),
    views: d?.views,
    likes: d?.likes,
    uploadDate: d?.uploadDate,
    thumbnail: proxyImage(d?.thumbnailUrl, backend),
    live: Boolean(d?.livestream),
    related: clean(d?.relatedStreams ?? [], backend),
    files,
    backend,
  };
}

export const stream = async (id: string): Promise<Stream> => {
  const { data, backend } = await api<Raw>("/streams/" + id);
  return toStream(data, backend, id);
};

// Try one chosen source, for when automatic failover has already given up on a video.
export const streamFrom = async (id: string, backend: Backend): Promise<Stream> =>
  toStream(await request<Raw>(backend, "/streams/" + id), backend, id);

// YouTube's oEmbed endpoint is separate from watch access, so it still answers while mirrors are
// bot-checked. Keeping the title, channel and thumbnail lets the page stay useful.
export type Preview = { title: string; author: string; thumbnail: string };

export async function preview(id: string): Promise<Preview> {
  const remote =
    "https://www.youtube.com/oembed?url=" +
    encodeURIComponent(`https://www.youtube.com/watch?v=${id}`) +
    "&format=json";
  const res = await fetch(typeof window === "undefined" ? remote : relayUrl(remote), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new MirrorError("No details available for this video");
  const data = (await res.json()) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };
  if (!data.title) throw new MirrorError("No details available for this video");
  return {
    title: data.title,
    author: data.author_name ?? "",
    thumbnail: data.thumbnail_url ? relayUrl(data.thumbnail_url) : "",
  };
}

// Shorts are not in Piped's search API, but the (undocumented) channel tabs endpoint accepts the
// same content filter its own frontend uses. Gather a few recent shorts from popular channels.
const SHORTS_CHANNELS: { id: string; label: string }[] = [
  { id: "UCX6OQ3DkcsbYNE6H8uQQuVA", label: "MrBeast" },
  { id: "UCRijo3ddMTht_IHyNSNXpNQ", label: "Dude Perfect" },
  { id: "UCY1kMZp36IQSyNx_9h4mpCg", label: "Mark Rober" },
  { id: "UCBJycsmduvYEL83R_U4JriQ", label: "Marques Brownlee" },
  { id: "UC7_YxT-KID8kRbqZo7MyscQ", label: "Markiplier" },
  { id: "UCq-Fj5jknLsUf-MWSy4_brA", label: "T-Series" },
];

function shortsTabPath(channelId: string) {
  const data = {
    originalUrl: `youtube.com/channel/${channelId}/shorts`,
    url: `youtube.com/channel/${channelId}/shorts`,
    id: channelId,
    contentFilters: ["shorts"],
    sortFilter: "",
    baseUrl: "youtube.com",
  };
  return "/channels/tabs?data=" + encodeURIComponent(JSON.stringify(data));
}

export async function shortsFeed(): Promise<Video[]> {
  const first = await api<{ content?: Raw[] }>(shortsTabPath(SHORTS_CHANNELS[0]!.id));
  const backend = first.backend;
  const lanes: Video[][] = [clean(first.data.content ?? [], backend).slice(0, 8)];

  // One working source is enough: the remaining channels reuse it instead of failing over again.
  const rest = await Promise.allSettled(
    SHORTS_CHANNELS.slice(1).map(async (channel) => {
      try {
        const data = await request<{ content?: Raw[] }>(backend, shortsTabPath(channel.id), 10_000);
        return clean(data.content ?? [], backend).slice(0, 8);
      } catch {
        const retry = await api<{ content?: Raw[] }>(shortsTabPath(channel.id));
        return clean(retry.data.content ?? [], retry.backend).slice(0, 8);
      }
    }),
  );
  for (const lane of rest)
    if (lane.status === "fulfilled" && lane.value.length) lanes.push(lane.value);

  // Interleave the channels so the grid is not six videos from one uploader in a row.
  const out: Video[] = [];
  for (let i = 0; i < 8; i++) for (const lane of lanes) if (lane[i]) out.push(lane[i]!);
  const seen = new Set<string>();
  return out.filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
}

// Proxy routes first: the embed and its video are served by the mirror. YouTube direct stays as a
// last resort for networks where it happens to be reachable.
export function players(id: string, backend: Backend): Player[] {
  const list: Player[] = [backend, ...mirrors().filter((b) => b.web !== backend.web)]
    .slice(0, 2)
    .map((b, i) => ({
      id: b.id,
      label: i === 0 ? "Mirror embed" : "Backup embed",
      host: new URL(b.web).host,
      src: `${b.web}/embed/${id}?autoplay=1`,
      // The embed is a third-party page, so it cannot be relayed and needs that host reachable.
      proxied: false,
    }));

  list.push({
    id: "youtube",
    label: "YouTube",
    host: "youtube-nocookie.com",
    src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
    proxied: false,
  });
  return list;
}

export const TAGS = [
  { label: "Trending" },
  { label: "Study lo-fi", q: "lofi hip hop radio" },
  { label: "Music", q: "official music video" },
  { label: "Gaming", q: "gameplay no commentary" },
  { label: "Tech", q: "tech review" },
  { label: "Science", q: "science explained" },
  { label: "Sports", q: "sports highlights" },
  { label: "Comedy", q: "comedy sketch" },
  { label: "News", q: "news today" },
];

export function fmtDuration(s?: number) {
  if (!s || s <= 0) return "";
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    x = String(Math.round(s % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
}

export function fmtCount(v?: number) {
  if (typeof v !== "number" || v < 0) return "";
  const t = (n: number) => (n < 10 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n).toString());
  return v >= 1e9
    ? t(v / 1e9) + "B"
    : v >= 1e6
      ? t(v / 1e6) + "M"
      : v >= 1e3
        ? t(v / 1e3) + "K"
        : String(v);
}
