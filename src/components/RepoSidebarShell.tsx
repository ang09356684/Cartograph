"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { RepoSidebar } from "./RepoSidebar";
import type { SidebarSection } from "@/lib/sidebar";

const STORAGE_KEY = "cartograph:sidebar-collapsed";

export function RepoSidebarShell({
  repoId,
  sections,
}: {
  repoId: string;
  sections: SidebarSection[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed, hydrated]);

  // 不要再套一層普通 <div>：`position: sticky` 的 containing block 是它的直接父層，
  // 若父層高度 = sticky 元素高度本身，就沒有可 stick 的範圍。改讓 <aside>（經 flex
  // stretch 撐到 main content 高度）直接當父層，sticky 才會在頁面滾動時持續 pin 在頂端。
  if (collapsed) {
    return (
      <div className="sticky top-4">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="flex items-center justify-center size-8 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          Navigation
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          className="size-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>
      <RepoSidebar repoId={repoId} sections={sections} />
    </div>
  );
}
