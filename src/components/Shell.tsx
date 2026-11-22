import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { MirrorPicker } from "./MirrorPicker";
import { urlVideoId } from "@/lib/piped";

export function Shell({ children, initialQ = "" }: { children: ReactNode; initialQ?: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState(initialQ);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    const id = urlVideoId(text);
    if (id) {
      nav({ to: "/watch/$id", params: { id } });
      return;
    }
    nav({ to: "/search", search: { q: text } });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:flex-nowrap md:gap-5 md:px-10">
        <Link to="/" className="flex items-center gap-2 font-display text-2xl font-bold">
          <span className="grid h-6 w-6 place-items-center rounded-sm bg-primary text-primary-foreground text-xs">
            ▶
          </span>
          OpenTube
          <span className="rounded-sm border border-primary/40 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-primary">
            proxied
          </span>
        </Link>
        <form
          role="search"
          onSubmit={submit}
          className="order-3 flex w-full md:order-none md:max-w-xl md:flex-1"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Search videos or paste a YouTube link"
            aria-label="Search videos"
            className="h-10 min-w-0 flex-1 rounded-l-sm border border-r-0 border-border bg-card px-4 text-sm outline-none focus:border-ring"
          />
          <button
            aria-label="Search"
            className="grid h-10 w-12 place-items-center rounded-r-sm border border-border bg-secondary text-muted-foreground hover:text-primary"
          >
            <Search className="h-4 w-4" />
          </button>
        </form>
        <div className="order-2 ml-auto md:order-none md:ml-0">
          <MirrorPicker />
        </div>
      </header>
      <main className="mx-auto w-[min(1360px,100%-2rem)] py-6 pb-16">{children}</main>
      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
        OpenTube searches and plays YouTube through volunteer-run mirror proxies. Searches,
        thumbnails and video all travel through this site's own relay, so neither YouTube nor the
        mirror host has to be reachable from your network. Nothing is hosted here.
      </footer>
    </div>
  );
}
