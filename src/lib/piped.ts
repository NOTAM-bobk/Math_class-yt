// Piped-compatible mirrors (volunteer-run, CORS-open). Raced; last winner remembered.
export const INSTANCES = ["https://api.piped.private.coffee", "https://pipedapi.ducks.party"];
const KEY = "ot.instance.v1";
const TIMEOUT = 8000;

export type Video = {
  id: string; title: string; thumbnail: string; uploaderName?: string;
  uploaderAvatar?: string; duration?: number; views?: number; uploadedDate?: string;
};
export type Stream = {
  title: string; description?: string; uploader?: string; uploaderAvatar?: string;
  views?: number; likes?: number; uploadDate?: string; related: Video[];
};

export function videoId(url?: string) {
  const m = /(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url ?? "");
  return m?.[1] ?? "";
}

const pref = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const remember = (b: string) => { try { localStorage.setItem(KEY, b); } catch { /* */ } };

async function request(base: string, path: string) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(base + path, { signal: c.signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    if (!d || d.error) throw new Error(d?.error ?? "empty");
    remember(base);
    return d;
  } finally { clearTimeout(t); }
}

async function api(path: string) {
  const p = pref();
  if (p) { try { return await request(p, path); } catch { /* fall through */ } }
  return Promise.any(INSTANCES.filter((b) => b !== p).map((b) => request(b, path)))
    .catch(() => { throw new Error("Every video source failed. Try again in a moment."); });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toVideo = (x: any): Video => ({
  id: videoId(x.url), title: x.title, thumbnail: x.thumbnail,
  uploaderName: x.uploaderName, uploaderAvatar: x.uploaderAvatar,
  duration: x.duration, views: x.views, uploadedDate: x.uploadedDate,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clean = (arr: any[]) => arr.filter((x) => x?.type !== "channel" && x?.type !== "playlist").map(toVideo).filter((v) => v.id);

export const trending = async () => clean(await api("/trending?region=US"));
export const search = async (q: string) =>
  clean((await api("/search?q=" + encodeURIComponent(q) + "&filter=videos")).items ?? []);
export const stream = async (id: string): Promise<Stream> => {
  try {
    const d = await api("/streams/" + id);
    return { ...d, related: clean(d.relatedStreams ?? []) };
  } catch {
    const r = await fetch("https://noembed.com/embed?url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id));
    const d = await r.json();
    return { title: d.title ?? "Video", uploader: d.author_name, related: [] };
  }
};

export const PLAYERS = [
  { id: "nocookie", label: "YouTube", src: (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1` },
  { id: "plain", label: "YouTube direct", src: (id: string) => `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` },
  { id: "invidious", label: "Invidious", src: (id: string) => `https://yewtu.be/embed/${id}?autoplay=1` },
];

export const TAGS = [
  { label: "Trending" }, { label: "Study lo-fi", q: "lofi hip hop radio" },
  { label: "Music", q: "official music video" }, { label: "Gaming", q: "gameplay no commentary" },
  { label: "Tech", q: "tech review" }, { label: "Science", q: "science explained" },
  { label: "Sports", q: "sports highlights" }, { label: "Comedy", q: "comedy sketch" },
  { label: "News", q: "news today" },
];

export function fmtDuration(s?: number) {
  if (!s || s <= 0) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(Math.round(s % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
}
export function fmtCount(v?: number) {
  if (typeof v !== "number" || v < 0) return "";
  const t = (n: number) => (n < 10 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n).toString());
  return v >= 1e9 ? t(v / 1e9) + "B" : v >= 1e6 ? t(v / 1e6) + "M" : v >= 1e3 ? t(v / 1e3) + "K" : String(v);
}
