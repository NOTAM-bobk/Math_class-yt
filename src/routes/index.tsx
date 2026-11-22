import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Shell } from "@/components/Shell";
import { Chips } from "@/components/Chips";
import { Status, VideoGrid } from "@/components/VideoGrid";
import { trending } from "@/lib/piped";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpenTube — Watch trending videos" },
      { name: "description", content: "Search and watch videos through community mirrors." },
      { property: "og:title", content: "OpenTube — Watch trending videos" },
      { property: "og:description", content: "Search and watch videos through community mirrors." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

// Trending only returns a handful of videos per country, so "load more" walks through more
// regions and appends whatever is new. No extra API beyond the one already in use.
const REGIONS = ["US", "GB", "CA", "AU", "DE", "IN", "BR", "JP", "FR", "KR", "MX", "ES"];

function Home() {
  const q = useInfiniteQuery({
    queryKey: ["trending"],
    queryFn: ({ pageParam }) => trending(REGIONS[pageParam] ?? "US"),
    initialPageParam: 0,
    getNextPageParam: (_last, pages) => (pages.length < REGIONS.length ? pages.length : undefined),
    staleTime: 300_000,
  });

  const videos = useMemo(() => {
    const seen = new Set<string>();
    return (q.data?.pages.flat() ?? []).filter((v) =>
      seen.has(v.id) ? false : (seen.add(v.id), true),
    );
  }, [q.data]);

  return (
    <Shell>
      <Chips />
      <h1 className="mb-5 font-display text-3xl font-bold">Trending</h1>
      <Status loading={q.isPending} error={q.error} empty={!q.isPending && videos.length === 0} />
      {videos.length > 0 && <VideoGrid videos={videos} />}
      {q.hasNextPage && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => void q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            className="rounded-sm border border-border bg-card px-5 py-2 text-sm font-medium transition-colors hover:text-primary disabled:opacity-50"
          >
            {q.isFetchingNextPage ? "Loading more…" : "Load more videos"}
          </button>
        </div>
      )}
    </Shell>
  );
}
