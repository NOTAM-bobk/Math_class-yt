import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { VideoCard } from "@/components/VideoGrid";
import { fmtCount, players, stream } from "@/lib/piped";

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

function MirrorError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-semibold">Couldn't load this video</p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
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
  const s = useQuery({
    queryKey: ["stream", id],
    queryFn: () => stream(id),
    staleTime: 300_000,
    retry: 1,
  });
  const [route, setRoute] = useState("");
  const [fileIndex, setFileIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  // A new video should start from the default relayed route, not the last one picked.
  useEffect(() => {
    setRoute("");
    setFileIndex(0);
  }, [id]);

  useEffect(() => setFailed(false), [id, route, fileIndex]);

  const data = s.data;
  const options = data ? players(id, data.backend) : [];
  const embeds = options.filter((p) => p.id !== "youtube");
  const direct = options.find((p) => p.id === "youtube");
  const embed = embeds.find((p) => p.id === route) ?? embeds[0];
  const file = data?.files[fileIndex] ?? data?.files[0];
  const hasFiles = Boolean(data?.files.length);
  // Default to the relayed player: it is the only route that works when every third-party host
  // is blocked. The mirror embeds are kept as a backup for networks that allow them.
  const usingProxyStream = route === "proxy" || (route === "" && hasFiles);
  const usingDirect = route === "youtube";
  const usingEmbed = !usingProxyStream && !usingDirect;
  const sourceHost = data ? new URL(data.backend.api).host : "";

  return (
    <Shell>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="aspect-video overflow-hidden rounded-sm bg-card">
            {s.isError ? (
              <MirrorError message={(s.error as Error).message} retry={() => void s.refetch()} />
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
                poster={data.thumbnail || undefined}
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
                title={data.title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : embed ? (
              <iframe
                key={embed.src}
                src={embed.src}
                title={data.title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : null}
          </div>

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
                The video is streamed through <span className="text-foreground">this site</span>,
                which fetches it from {sourceHost}. Neither YouTube nor {sourceHost} has to be
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

          {usingProxyStream && data && data.files.length > 1 && (
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
          {usingProxyStream && data && data.files.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              This mirror has no direct stream for the video — use one of the embedded routes above.
            </p>
          )}

          <h1 className="mt-4 font-display text-2xl font-bold">
            {data?.title ?? (s.isPending ? "Loading…" : "Video")}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
            {data?.uploaderAvatar && (
              <img
                src={data.uploaderAvatar}
                alt=""
                className="h-9 w-9 rounded-full bg-card object-cover"
                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
              />
            )}
            <span className="font-semibold text-foreground">{data?.uploader}</span>
            {data?.views ? <span>{fmtCount(data.views)} views</span> : null}
            {data?.likes ? <span>{fmtCount(data.likes)} likes</span> : null}
            {data?.uploadDate ? <span>{data.uploadDate}</span> : null}
          </div>
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
          <h2 className="font-display text-xl font-bold">Up next</h2>
          {data?.related.slice(0, 20).map((v) => (
            <VideoCard key={v.id} v={v} row />
          ))}
        </aside>
      </div>
    </Shell>
  );
}
