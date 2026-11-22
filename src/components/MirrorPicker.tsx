import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Globe, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  activeMirror,
  addCustomMirror,
  clearCustomMirror,
  mirrors,
  setActiveMirror,
} from "@/lib/piped";

// Lets the user move to a different proxy host when one is blocked, down, or slow.
export function MirrorPicker() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, bump] = useState(0);

  useEffect(() => setMounted(true), []);

  const list = mirrors();
  const active = activeMirror();

  const choose = (id: string) => {
    setActiveMirror(id);
    bump((n) => n + 1);
    void queryClient.invalidateQueries();
    setError("");
    setOpen(false);
  };

  const add = async () => {
    setBusy(true);
    setError("");
    const message = await addCustomMirror(draft);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setDraft("");
    bump((n) => n + 1);
    void queryClient.invalidateQueries();
    setOpen(false);
  };

  const removeCustom = () => {
    clearCustomMirror();
    bump((n) => n + 1);
    void queryClient.invalidateQueries();
  };

  const hasCustom = list.some((m) => m.custom);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Choose video source"
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="max-w-[11rem] truncate">{mounted ? active.label : "Mirror"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Video source
        </div>
        <ul className="p-1">
          {list.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => choose(m.id)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <Check
                  className={
                    m.id === active.id
                      ? "h-4 w-4 shrink-0 text-primary"
                      : "h-4 w-4 shrink-0 opacity-0"
                  }
                />
                <span className="min-w-0 flex-1 truncate">{m.label}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {new URL(m.api).host}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border p-3">
          <label htmlFor="custom-mirror" className="text-[11px] font-medium text-muted-foreground">
            Add a Piped API mirror
          </label>
          <div className="mt-1.5 flex gap-1.5">
            <input
              id="custom-mirror"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim() && !busy) void add();
              }}
              placeholder="https://api.example.org"
              spellCheck={false}
              className="h-9 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 text-xs outline-none focus:border-ring"
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={busy || !draft.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-border bg-secondary text-muted-foreground transition-colors hover:text-primary disabled:opacity-40"
              aria-label="Add mirror"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Search results, thumbnails and video all load from this host instead of YouTube.
          </p>
          {hasCustom && (
            <button
              type="button"
              onClick={removeCustom}
              className="mt-2 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Remove custom mirror
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
