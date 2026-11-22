import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { Thumb } from "@/components/VideoGrid";
import { fmtCount, shortsFeed, stream } from "@/lib/piped";

export const Route = createFileRoute("/shorts/$id")({
  head: () => ({
    meta: [
      { title: "Short — OpenTube" },
      { name: "description", content: "A YouTube Short played through this site's proxy." },
      { property: "og:title", content: "Short — OpenTube" },
      { property: "og:description", content: "A YouTube Short played through this site's proxy." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Short,
});

function Short() {
  const { id } = Route.useParams();
  const [attempt, setAttempt] = useState(0);
  const s = useQuery({
    queryKey: ["stream", id, attempt],
    queryFn: () => stream(id),
    staleTime: 300_000,
    retry: 1,
  });
  const feed = useQuery({
    queryKey: ["shorts"],
    queryFn: shortsFeed,
    staleTime: 600_000,
    retry: 1,
  });

  const data = s.data;
  const file = data?.files[0];
  const list = feed.data ?? [];
  const index = list.findIndex((v) => v.id === id);
  const prev = index > 0 ? list[index - 1] : undefined;
  const next = index >= 0 ? list[index + 1] : undefined;

  return (
    <Shell>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 lg:flex-row">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="relative aspect-[9/16] overflow-hidden rounded-sm bg-card">
            {s.isError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm font-semibold">Couldn't load this short</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {(s.error as Error).message}
                </p>
                <Link
                  to="/watch/$id"
                  params={{ id }}
                  className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary"
                >
                  Try it in the full player
                </Link>
                <button
                  onClick={() => setAttempt((n) => n + 1)}
                  className="rounded-sm border border-border px-3 py-1.5 text-xs hover:text-primary"
                >
                  Try again
                </button>
              </div>
            ) : !data ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Loading through the proxy…
              </div>
            ) : file ? (
              <video
                key={file.url}
                src={file.url}
                poster={data.thumbnail || undefined}
                controls
                autoPlay
                loop
                playsInline
                className="h-full w-full bg-black object-contain"
              />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-xs text-muted-foreground">
                This short has no direct stream.{" "}
                <Link to="/watch/$id" params={{ id }} className="underline">
                  Open it in the full player
                </Link>
                .
              </div>
            )}
          </div>

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="line-clamp-2 text-base font-semibold">{data?.title ?? "Short"}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {[data?.uploader, data?.views ? `${fmtCount(data.views)} views` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {prev && (
              <Link
                to="/shorts/$id"
                params={{ id: prev.id }}
                className="rounded-sm border border-border px-3 py-1.5 text-muted-foreground hover:text-primary"
              >
                Previous short
              </Link>
            )}
            {next && (
              <Link
                to="/shorts/$id"
                params={{ id: next.id }}
                className="rounded-sm border border-primary px-3 py-1.5 text-primary"
              >
                Next short
              </Link>
            )}
            <Link
              to="/watch/$id"
              params={{ id }}
              className="rounded-sm border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground"
            >
              Full player
            </Link>
          </div>
        </div>

        <aside className="min-w-0 flex-1">
          <h2 className="mb-3 font-display text-xl font-bold">More shorts</h2>
          {feed.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              {list
                .filter((v) => v.id !== id)
                .slice(0, 18)
                .map((v) => (
                  <Link key={v.id} to="/shorts/$id" params={{ id: v.id }} className="group">
                    <div className="relative aspect-[9/16] overflow-hidden rounded-sm bg-card">
                      <Thumb v={v} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-snug group-hover:text-primary">
                      {v.title}
                    </p>
                  </Link>
                ))}
            </div>
          )}
        </aside>
      </div>
    </Shell>
  );
}
