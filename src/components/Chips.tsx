import { Link } from "@tanstack/react-router";
import { TAGS } from "@/lib/piped";

export function Chips({ active }: { active?: string }) {
  const cls = (on: boolean) => `whitespace-nowrap rounded-sm border px-3 py-1.5 text-sm font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`;
  return (
    <div className="mb-7 flex gap-2 overflow-x-auto pb-1">
      {TAGS.map((t) => t.q
        ? <Link key={t.label} to="/search" search={{ q: t.q }} className={cls(active === t.q)}>{t.label}</Link>
        : <Link key={t.label} to="/" className={cls(!active)}>{t.label}</Link>)}
    </div>
  );
}
