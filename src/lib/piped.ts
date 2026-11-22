// Volunteer-run Piped mirrors (CORS-open). Metadata, thumbnails and video all come from a
// mirror host, so the browser never needs to reach youtube.com — which is what keeps this
// page usable on networks where YouTube is blocked.
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
];

const CUSTOM_KEY = "ot.customMirror.v1";
const ACTIVE_KEY = "ot.activeMirror.v1";
const TIMEOUT = 8000;

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
  return custom ? [...BUILTINS, custom] : [...BUILTINS];
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

async function request<T>(backend: Backend, path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(backend.api + path, {
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

// Try the mirror the user picked first, then race the rest so one dead host never breaks a page.
async function api<T>(path: string): Promise<{ data: T; backend: Backend }> {
  const primary = activeMirror();
  let primaryFailure: Error | undefined;
  try {
    return { data: await request<T>(primary, path), backend: primary };
  } catch (error) {
    primaryFailure = error as Error;
  }

  const others = mirrors().filter((b) => b.api !== primary.api);
  try {
    const hit = await Promise.any(
      others.map(async (backend) => ({ data: await request<T>(backend, path), backend })),
    );
    if (hit.backend.id !== primary.id) setActiveMirror(hit.backend.id);
    return hit;
  } catch (error) {
    const failures = [
      primaryFailure,
      ...(((error as AggregateError).errors ?? []) as Error[]),
    ].filter((e): e is Error => e instanceof Error);
    const upstream = failures.filter(
      (e): e is MirrorError => e instanceof MirrorError && e.upstream,
    );
    if (upstream.length > 0 && upstream.length === failures.length) {
      throw new MirrorError(`The mirror couldn't load this: ${upstream[0]!.message}`, true);
    }
    throw new MirrorError(
      "Every mirror is unreachable right now. Pick a different mirror from the source menu, or try again in a moment.",
    );
  }
}

const YT_IMAGE_HOST = /(^|\.)(ytimg\.com|ggpht\.com|youtube\.com|googleusercontent\.com)$/;

// Piped proxies raw YouTube image URLs as /<path>?host=<original host>. Responses already proxied
// by a mirror pass through untouched.
export function proxyImage(url: string | undefined, backend: Backend): string {
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

function thumbnailCandidates(id: string, url: string, backend: Backend): string[] {
  const list = [proxyImage(url, backend)];
  if (id) {
    for (const mirror of mirrors()) {
      if (mirror.image && mirror.id !== backend.id) {
        list.push(`${mirror.image}/vi/${id}/hqdefault.jpg?host=i.ytimg.com`);
      }
    }
  }
  return [...new Set(list.filter(Boolean))];
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
  };
}

function clean(items: Raw[], backend: Backend): Video[] {
  return (items ?? [])
    .filter((x) => x && x.type !== "channel" && x.type !== "playlist")
    .map((x) => toVideo(x, backend))
    .filter((v) => v.id);
}

export const trending = async (): Promise<Video[]> => {
  const { data, backend } = await api<Raw[]>("/trending?region=US");
  return clean(Array.isArray(data) ? data : [], backend);
};

export const search = async (q: string): Promise<Video[]> => {
  const { data, backend } = await api<{ items?: Raw[] }>(
    "/search?q=" + encodeURIComponent(q) + "&filter=videos",
  );
  return clean(data.items ?? [], backend);
};

export const stream = async (id: string): Promise<Stream> => {
  const { data: d, backend } = await api<Raw>("/streams/" + id);
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
      url: String(v.url),
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
};

// Proxy routes first: the embed and its video are served by the mirror. YouTube direct stays as a
// last resort for networks where it happens to be reachable.
export function players(id: string, backend: Backend): Player[] {
  const list: Player[] = [backend, ...mirrors().filter((b) => b.web !== backend.web)]
    .slice(0, 2)
    .map((b, i) => ({
      id: b.id,
      label: i === 0 ? "Mirror" : "Backup",
      host: new URL(b.web).host,
      src: `${b.web}/embed/${id}?autoplay=1`,
      proxied: true,
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
