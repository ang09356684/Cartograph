"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";

export interface FilterChipGroup {
  key: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
}

interface Props {
  chipGroups?: FilterChipGroup[];
  searchKey?: string;
  searchPlaceholder?: string;
}

export function ListFilterBar({
  chipGroups = [],
  searchKey = "q",
  searchPlaceholder = "Search…",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const initial = params.get(searchKey) ?? "";
  const [query, setQuery] = useState(initial);

  useEffect(() => {
    setQuery(initial);
  }, [initial]);

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(Array.from(params.entries()));
      if (query) next.set(searchKey, query);
      else next.delete(searchKey);
      const qs = next.toString();
      const currentQs = params.toString();
      if (qs === currentQs) return;
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    }, 180);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function toggleChip(key: string, value: string) {
    const next = new URLSearchParams(Array.from(params.entries()));
    const current = next.getAll(key);
    if (current.includes(value)) {
      const remaining = current.filter((v) => v !== value);
      next.delete(key);
      remaining.forEach((v) => next.append(key, v));
    } else {
      next.append(key, value);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function clearAll() {
    router.replace(pathname, { scroll: false });
    setQuery("");
  }

  const activeCount = Array.from(params.keys()).length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 px-3 py-1.5 text-sm rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400"
        />
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <X className="size-3" /> Clear
          </button>
        )}
      </div>
      {chipGroups.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {chipGroups.map((cg) => {
            const active = new Set(params.getAll(cg.key));
            return (
              <div key={cg.key} className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 w-16 flex-shrink-0">
                  {cg.label}
                </span>
                <div className="flex flex-wrap gap-1">
                  {cg.options.map((opt) => {
                    const isActive = active.has(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleChip(cg.key, opt.value)}
                        className={`text-xs px-2 py-0.5 rounded border ${
                          isActive
                            ? "bg-sky-600 text-white border-sky-600"
                            : "bg-white text-slate-700 border-slate-200 hover:border-sky-400"
                        }`}
                      >
                        {opt.label}
                        {opt.count !== undefined && (
                          <span
                            className={`ml-1 ${
                              isActive ? "text-sky-100" : "text-slate-400"
                            }`}
                          >
                            {opt.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
