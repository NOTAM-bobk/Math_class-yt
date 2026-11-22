import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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

function Home() {
  const q = useQuery({ queryKey: ["trending"], queryFn: trending, staleTime: 300_000 });
  return (
    <Shell>
      <Chips />
      <h1 className="mb-5 font-display text-3xl font-bold">Trending</h1>
      <Status loading={q.isPending} error={q.error} empty={q.data?.length === 0} />
      {q.data && <VideoGrid videos={q.data} />}
    </Shell>
  );
}
