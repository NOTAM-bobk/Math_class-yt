import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { Chips } from "@/components/Chips";
import { Status, VideoGrid } from "@/components/VideoGrid";
import { search } from "@/lib/piped";

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s["q"] === "string" ? s["q"] : "" }),
  head: () => ({ meta: [
    { title: "Search — OpenTube" }, { name: "description", content: "Search results on OpenTube." },
    { property: "og:title", content: "Search — OpenTube" }, { property: "og:description", content: "Search results on OpenTube." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const r = useQuery({ queryKey: ["search", q], queryFn: () => search(q), enabled: !!q, staleTime: 300_000 });
  return (
    <Shell key={q} initialQ={q}>
      <Chips active={q} />
      <h1 className="mb-5 font-display text-3xl font-bold">Results for “{q}”</h1>
      <Status loading={r.isPending && !!q} error={r.error} empty={r.data?.length === 0} />
      {r.data && <VideoGrid videos={r.data} />}
    </Shell>
  );
}
