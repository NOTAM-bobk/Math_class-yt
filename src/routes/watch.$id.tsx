import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { VideoCard } from "@/components/VideoGrid";
import { fmtCount, PLAYERS, stream } from "@/lib/piped";

export const Route = createFileRoute("/watch/$id")({
  head: () => ({ meta: [
    { title: "Watch — OpenTube" }, { name: "description", content: "Watch a video on OpenTube." },
    { property: "og:title", content: "Watch — OpenTube" }, { property: "og:description", content: "Watch a video on OpenTube." },
    { property: "og:type", content: "video.other" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Watch,
});

function Watch() {
  const { id } = Route.useParams();
  const [player, setPlayer] = useState(0);
  const s = useQuery({ queryKey: ["stream", id], queryFn: () => stream(id), staleTime: 300_000 });
  const p = PLAYERS[player] ?? PLAYERS[0]!;
  return (
    <Shell>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="aspect-video overflow-hidden rounded-sm bg-card">
            <iframe key={p.id + id} src={p.src(id)} title={s.data?.title ?? "Video"} className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Player won't load? Try:
            {PLAYERS.map((x, i) => (
              <button key={x.id} onClick={() => setPlayer(i)} className={`rounded-sm border px-2 py-1 ${i === player ? "border-primary text-primary" : "border-border hover:text-foreground"}`}>{x.label}</button>
            ))}
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">{s.data?.title ?? (s.isPending ? "Loading…" : "Video")}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
            {s.data?.uploaderAvatar && <img src={s.data.uploaderAvatar} alt="" className="h-9 w-9 rounded-full" />}
            <span className="font-semibold text-foreground">{s.data?.uploader}</span>
            {s.data?.views ? <span>{fmtCount(s.data.views)} views</span> : null}
            {s.data?.likes ? <span>{fmtCount(s.data.likes)} likes</span> : null}
          </div>
          {s.data?.description && (
            <details className="mt-4 rounded-sm border border-border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-semibold">Description</summary>
              <div className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">{s.data.description.replace(/<br\s*\/?>/g, "
").replace(/<[^>]+>/g, "")}</div>
            </details>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold">Up next</h2>
          {s.data?.related.slice(0, 20).map((v) => <VideoCard key={v.id} v={v} row />)}
        </aside>
      </div>
    </Shell>
  );
}
