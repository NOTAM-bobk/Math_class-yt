import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { Status, Thumb } from "@/components/VideoGrid";
import { fmtCount, shortsFeed } from "@/lib/piped";

export const Route = createFileRoute("/shorts/")({
  head: () => ({
    meta: [
      { title: "Shorts — OpenTube" },
      { name: "description", content: "Vertical YouTube Shorts played through this site's proxy." },
      { property: "og:title", content: "Shorts — OpenTube" },
      { property: "og:description", content: "Vertical YouTube Shorts played through a proxy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShortsPage,
});

function ShortsPage() {
  const q = useQuery({ queryKey: ["shorts"], queryFn: shortsFeed, staleTime: 600_000, retry: 1 });

  return (
    <Shell>
      <h1 className="mb-2 font-display text-3xl font-bold">Shorts</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Vertical videos from channels that post Shorts. Each one plays through this site's relay, so
        youtube.com and the short's CDN never have to be reachable.
      </p>
      <Status loading={q.isPending} error={q.error} empty={q.data?.length === 0} />
      {q.isError && (
        <button
          onClick={() => void q.refetch()}
          className="mb-6 rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          Try again
        </button>
      )}
      <div className="columns-2 gap-3 sm:columns-3 md:columns-4 xl:columns-5">
        {q.data?.map((v) => (
          <Link
            key={v.id}
            to="/shorts/$id"
            params={{ id: v.id }}
            className="group mb-3 block break-inside-avoid"
          >
            <div className="relative aspect-[9/16] overflow-hidden rounded-sm bg-card">
              <Thumb v={v} />
              <span className="absolute inset-0 grid place-items-center bg-gradient-to-t from-background/70 via-transparent to-transparent opacity-80">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-background/80 text-sm">
                  ▶
                </span>
              </span>
            </div>
            <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">
              {v.title}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[v.uploaderName, v.views ? `${fmtCount(v.views)} views` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
