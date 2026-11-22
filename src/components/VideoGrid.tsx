import { Link } from "@tanstack/react-router";
import { fmtCount, fmtDuration, type Video } from "@/lib/piped";

export function VideoCard({ v, row }: { v: Video; row?: boolean }) {
  return (
    <Link to="/watch/$id" params={{ id: v.id }} className={row ? "grid grid-cols-[160px_1fr] gap-3 group" : "group block"}>
      <div className="relative aspect-video overflow-hidden rounded-sm bg-card">
        <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        {fmtDuration(v.duration) && <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-background/90 px-1.5 text-xs font-semibold">{fmtDuration(v.duration)}</span>}
      </div>
      <div className={row ? "" : "mt-2"}>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">{v.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{v.uploaderName}</p>
        <p className="text-xs text-muted-foreground">{[v.views ? fmtCount(v.views) + " views" : "", v.uploadedDate].filter(Boolean).join(" · ")}</p>
      </div>
    </Link>
  );
}

export function VideoGrid({ videos }: { videos: Video[] }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-4 gap-y-7">{videos.map((v) => <VideoCard key={v.id} v={v} />)}</div>;
}

export function Status({ loading, error, empty }: { loading: boolean; error: unknown; empty: boolean }) {
  if (loading) return <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">{Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-video animate-pulse rounded-sm bg-card" />)}</div>;
  if (error) return <p className="text-muted-foreground">{(error as Error).message}</p>;
  if (empty) return <p className="text-muted-foreground">No videos found.</p>;
  return null;
}
