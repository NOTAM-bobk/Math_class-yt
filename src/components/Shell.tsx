import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";

export function Shell({ children, initialQ = "" }: { children: ReactNode; initialQ?: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState(initialQ);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:flex-nowrap md:gap-6 md:px-10">
        <Link to="/" className="flex items-center gap-2 font-display text-2xl font-bold">
          <span className="grid h-6 w-6 place-items-center rounded-sm bg-primary text-primary-foreground text-xs">▶</span>
          OpenTube
        </Link>
        <form role="search" className="order-3 flex w-full md:order-none md:max-w-xl md:flex-1"
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav({ to: "/search", search: { q: q.trim() } }); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search videos" aria-label="Search videos"
            className="h-10 min-w-0 flex-1 rounded-l-sm border border-r-0 border-border bg-card px-4 text-sm outline-none focus:border-ring" />
          <button aria-label="Search" className="grid h-10 w-12 place-items-center rounded-r-sm border border-border bg-secondary text-muted-foreground hover:text-primary">
            <Search className="h-4 w-4" />
          </button>
        </form>
      </header>
      <main className="mx-auto w-[min(1360px,100%-2rem)] py-6 pb-16">{children}</main>
      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
        OpenTube reads public video data through community mirrors and plays video in the official embed player. Nothing is hosted here.
      </footer>
    </div>
  );
}
