import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1 text-sm text-slate-500 flex-wrap">
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-slate-400" />}
            {c.href && !isLast ? (
              <Link href={c.href} className="hover:text-slate-900">
                {c.label}
              </Link>
            ) : (
              <span className={isLast ? "text-slate-900 font-medium" : ""}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
