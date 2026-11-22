import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { VideoCard } from "@/components/VideoGrid";
import {
  fmtCount,
  mirrors,
  players,
  preview,
  search,
  setActiveMirror,
  stream,
  streamFrom,
  type Backend,
} from "@/lib/piped";

export const Route = createFileRoute("/watch/$id")({
  head: () => ({
    meta: [
      { title: "Watch — OpenTube" },
      { name: "description", content: "Watch a video through this site's proxy on OpenTube." },
      { property: "og:title", content: "Watch — OpenTube" },
      {
        property: "og:description",
        content: "Watch a video through this site's proxy on OpenTube.",
      },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Watch,
});

const chip = (on: boolean) =>
  `rounded-sm border px-2 py-1 transition-colors ${
    on ? "border-primary text-primary" : "border-border hover:text-foreground"
  }`;

function MirrorError({
  message,
  retry,
  children,
}: {
  message: string;
  retry: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-6 text-center">
      <p className="text-sm font-semibold">Couldn't load this video</p>
      <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      {children}
      <button
        onClick={retry}
        className="rounded-sm border border-border px-3 py-1.5 text-xs hover:text-primary"
      >
        Try again
      </button>
    </div>
  );
}

function Watch() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [route, setRoute] = useState("");
  const [fileIndex, setFileIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [trying, setTrying] = useState("");
  const [sourceError, setSourceError] = useState("");

  const s = useQuery({
    queryKey: ["stream", id],
    queryFn: () => stream(id),
    staleTime: 300_000,
    retry: 1,
  });

  // A new video should start from the default relayed route, not the last one picked.
  useEffect(() => {
    setRoute("");
    setFileIndex(0);
    setSourceError("");
  }, [id]);

  useEffect(() => setFailed(false), [id, route, fileIndex]);

  // When extraction is refused, YouTube's oEmbed still gives the title, channel and thumbnail,
  // and a title search keeps "Up next" populated instead of leaving a dead page.
  const details = useQuery({
    queryKey: ["preview", id],
    queryFn: () => preview(id),
    enabled: s.isError,
    staleTime: 600_000,
    retry: 1,
  });
  const fallbackTitle = details.data?.title;
  const relatedSearch = useQuery({
    queryKey: ["related", id, fallbackTitle],
    queryFn: () => search(fallbackTitle!),
    enabled: s.isError && Boolean(fallbackTitle),
    staleTime: 600_000,
    retry: 1,
  });

  const data = s.data;
  const options = data ? players(id, data.backend) : [];
  const embeds = options.filter((p) => p.id !== "youtube");
  const direct = options.find((p) => p.id === "youtube");
  const embed = embeds.find((p) => p.id === route) ?? embeds[0];
  const file = data?.files[fileIndex] ?? data?.files[0];
  const hasFiles = Boolean(data?.files.length);
  const usingProxyStream = route === "proxy" || (route === "" && hasFiles);
  const usingDirect = route === "youtube";
  const usingEmbed = !usingProxyStream && !usingDirect;
  const sourceHost = data ? new URL(data.backend.api).host : "";

  const related = data?.related.length ? data.related : (relatedSearch.data ?? []);
  const title = data?.title ?? details.data?.title ?? (s.isPending ? "Loading…" : "Video");
  const uploader = data?.uploader ?? details.data?.author;
  const poster = data?.thumbnail || details.data?.thumbnail || undefined;
  const sources = typeof window === "undefined" ? [] : mirrors();

  const trySource = async (backend: Backend) => {
    setTrying(backend.id);
    setSourceError("");
    try {
      const next = await streamFrom(id, backend);
      setActiveMirror(backend.id);
      queryClient.setQueryData(["stream", id], next);
      setFailed(false);
    } catch (error) {
      setSourceError(`${backend.label}: ${(error as Error).message}`);
    } finally {
      setTrying("");
    }
  };

  return (
    <Shell>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="aspect-video overflow-hidden rounded-sm bg-card">
            {s.isError ? (
              <MirrorError
                message={(s.error as Error).message}
                retry={() => {
                  setSourceError("");
                  void s.refetch();
                }}
              >
                {sources.length > 0 && (
                  <div className="flex max-w-md flex-wrap justify-center gap-1.5">
                    {sources.map((backend) => (
                      <button
                        key={backend.id}
                        onClick={() => void trySource(backend)}
                        disabled={trying !== ""}
                        className="rounded-sm border border-border bg-secondary/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
                      >
                        {trying === backend.id ? "Trying…" : backend.label}
                      </button>
                    ))}
                  </div>
                )}
                {sourceError && (
                  <p className="max-w-md text-[11px] text-destructive">{sourceError}</p>
                )}
              </MirrorError>
            ) : !data ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Loading through the proxy…
              </div>
            ) : usingProxyStream && failed ? (
              <MirrorError
                message="This site's relay couldn't fetch the video file. Try the retry button, another mirror from the source menu, or an embedded route below."
                retry={() => {
                  setFailed(false);
                  void s.refetch();
                }}
              />
            ) : usingProxyStream && file ? (
              <video
                key={file.url}
                src={file.url}
                poster={poster}
                controls
                autoPlay
                playsInline
                onError={() => setFailed(true)}
                className="h-full w-full bg-black"
              />
            ) : usingDirect && direct ? (
              <iframe
                key={direct.src}
                src={direct.src}
                title={title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : embed ? (
              <iframe
                key={embed.src}
                src={embed.src}
                title={title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : null}
          </div>

          {data && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Route</span>
                <button
                  onClick={() => setRoute("proxy")}
                  disabled={!hasFiles}
                  className={chip(usingProxyStream) + " disabled:opacity-40"}
                  title="Stream the video file through this site's own relay"
                >
                  This site · direct stream
                </button>
                {embeds.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setRoute(p.id)}
                    className={chip(usingEmbed && p.id === embed?.id)}
                    title={`Embedded player served by ${p.host}; that host has to be reachable from your network`}
                  >
                    {p.label} · {p.host}
                  </button>
                ))}
                {direct && (
                  <button onClick={() => setRoute("youtube")} className={chip(usingDirect)}>
                    YouTube direct
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {usingDirect ? (
                  "This route contacts YouTube directly and will be blocked on filtered networks."
                ) : usingProxyStream ? (
                  <>
                    The video is streamed through <span className="text-foreground">this site</span>
                    , which fetches it from {sourceHost}. Neither YouTube nor {sourceHost} has to be
                    reachable from your network.
                  </>
                ) : (
                  <>
                    This player is an embedded page on{" "}
                    <span className="text-foreground">{embed?.host}</span>, so that host has to be
                    reachable from your network. If it does not load, use the direct stream above.
                  </>
                )}
              </p>

              {usingProxyStream && data.files.length > 1 && (
                <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  Quality
                  <select
                    value={fileIndex}
                    onChange={(e) => setFileIndex(Number(e.target.value))}
                    className="rounded-sm border border-border bg-card px-2 py-1 text-xs text-foreground"
                  >
                    {data.files.map((f, i) => (
                      <option key={f.itag} value={i}>
                        {f.quality}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {usingProxyStream && data.files.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  This mirror has no direct stream for the video — use one of the embedded routes
                  above.
                </p>
              )}
            </>
          )}

          <h1 className="mt-4 font-display text-2xl font-bold">{title}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
            {data?.uploaderAvatar && (
              <img
                src={data.uploaderAvatar}
                alt=""
                className="h-9 w-9 rounded-full bg-card object-cover"
                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
              />
            )}
            {uploader && <span className="font-semibold text-foreground">{uploader}</span>}
            {data?.views ? <span>{fmtCount(data.views)} views</span> : null}
            {data?.likes ? <span>{fmtCount(data.likes)} likes</span> : null}
            {data?.uploadDate ? <span>{data.uploadDate}</span> : null}
          </div>
          {s.isError && (
            <p className="mt-2 text-xs text-muted-foreground">
              The video itself is unavailable from every source right now. The title and related
              videos still load through this site.
            </p>
          )}
          {data?.description && (
            <details className="mt-4 rounded-sm border border-border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-semibold">Description</summary>
              <div className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">
                {data.description.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")}
              </div>
            </details>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Up next</h2>
            {relatedSearch.isFetching && (
              <span className="text-xs text-muted-foreground">Loading…</span>
            )}
          </div>
          {related.length === 0 && s.isError && relatedSearch.isError && (
            <p className="text-xs text-muted-foreground">
              No related videos loaded. Try another search.
            </p>
          )}
          {related.slice(0, 20).map((v) => (
            <VideoCard key={v.id} v={v} row />
          ))}
        </aside>
      </div>
    </Shell>
  );
}
