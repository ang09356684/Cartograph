"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type {
  SearchEntry,
  SearchEntryType,
} from "@/lib/searchIndex";

const TYPE_LABEL: Record<SearchEntryType, string> = {
  repo: "repo",
  api: "api",
  worker: "worker",
  table: "table",
  topic: "topic",
  integration: "integration",
  middleware: "middleware",
};

const TYPE_COLOR: Record<SearchEntryType, string> = {
  repo: "bg-slate-100 text-slate-700",
  api: "bg-sky-50 text-sky-800",
  worker: "bg-purple-50 text-purple-800",
  table: "bg-emerald-50 text-emerald-800",
  topic: "bg-amber-50 text-amber-800",
  integration: "bg-rose-50 text-rose-800",
  middleware: "bg-indigo-50 text-indigo-800",
};

function scoreEntry(entry: SearchEntry, q: string): number {
  if (!q) return 0;
  const needle = q.toLowerCase();
  const idL = entry.id.toLowerCase();
  const titleL = entry.title.toLowerCase();
  const subL = entry.subtitle?.toLowerCase() ?? "";
  const descL = entry.description?.toLowerCase() ?? "";

  if (idL === needle) return 1000;
  if (idL.startsWith(needle)) return 500 + (needle.length / idL.length) * 100;
  if (titleL.startsWith(needle)) return 400;
  if (idL.includes(needle)) return 300;
  if (subL.includes(needle)) return 200;
  if (descL.includes(needle)) return 100;
  return -1;
}

export function CommandPalette({ index }: { index: SearchEntry[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (modKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo(() => {
    if (!query) return index.slice(0, 30);
    const scored = index
      .map((e) => ({ e, score: scoreEntry(e, query) }))
      .filter((s) => s.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((s) => s.e);
    return scored;
  }, [index, query]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${cursor}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  function navigate(entry: SearchEntry) {
    setOpen(false);
    router.push(entry.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = results[cursor];
      if (entry) navigate(entry);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-slate-900/30 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Search className="size-4 text-slate-400" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search APIs, workers, tables, topics, integrations…"
            className="flex-1 outline-none text-sm placeholder:text-slate-400"
          />
          <span className="text-[10px] uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
            esc
          </span>
        </div>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-400 text-center">
              No matches.
            </li>
          ) : (
            results.map((r, i) => (
              <li key={`${r.repo}-${r.type}-${r.id}`} data-idx={i}>
                <button
                  type="button"
                  onClick={() => navigate(r)}
                  onMouseEnter={() => setCursor(i)}
                  className={`w-full text-left px-4 py-2 flex items-center gap-3 ${
                    i === cursor ? "bg-sky-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      TYPE_COLOR[r.type]
                    }`}
                  >
                    {TYPE_LABEL[r.type]}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-900 truncate">
                      {r.title}
                      {r.type !== "repo" && (
                        <span className="text-slate-400">
                          {" "}
                          · {r.repo}
                        </span>
                      )}
                    </span>
                    {r.subtitle && (
                      <span className="block text-xs text-slate-500 font-mono truncate">
                        {r.subtitle}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 flex justify-between">
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate{" "}
            <kbd className="font-mono ml-1">⏎</kbd> select
          </span>
          <span>{results.length} results</span>
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteTrigger() {
  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toLowerCase().includes("mac");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  function open() {
    const ev = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      ctrlKey: true,
    });
    window.dispatchEvent(ev);
  }
  return (
    <button
      type="button"
      onClick={open}
      className="hidden sm:flex items-center gap-2 text-xs text-slate-500 border border-slate-200 rounded-md px-2 py-1 hover:border-sky-400 hover:text-slate-700"
    >
      <Search className="size-3.5" />
      <span>Search…</span>
      {hydrated && (
        <span className="ml-2 font-mono text-[10px] text-slate-400">
          {isMac ? "⌘K" : "Ctrl+K"}
        </span>
      )}
    </button>
  );
}
