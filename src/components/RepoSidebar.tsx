"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  SectionKind,
  SidebarEntry,
  SidebarGroup,
  SidebarSection,
} from "@/lib/sidebar";
import { groupAnchorId } from "@/lib/sidebar";

interface Props {
  repoId: string;
  sections: SidebarSection[];
}

function detectActive(pathname: string, repoId: string): {
  section?: SectionKind;
  entityHref?: string;
} {
  const prefix = `/repos/${repoId}/`;
  if (!pathname.startsWith(prefix)) return {};
  const rest = pathname.slice(prefix.length);
  const first = rest.split("/")[0] as SectionKind;
  if (
    first === "apis" ||
    first === "workers" ||
    first === "tables" ||
    first === "topics" ||
    first === "integrations" ||
    first === "middlewares"
  ) {
    return { section: first, entityHref: pathname };
  }
  return {};
}

export function RepoSidebar({ repoId, sections }: Props) {
  const pathname = usePathname();
  const active = useMemo(
    () => detectActive(pathname, repoId),
    [pathname, repoId],
  );

  const [filter, setFilter] = useState("");

  return (
    <nav className="w-60 text-sm">
      <div className="mb-3 flex items-center gap-1">
        <Link
          href="/"
          aria-label="Back to repos"
          title="Back to repos"
          className="px-1 py-0.5 rounded text-slate-500 hover:text-sky-700 hover:bg-slate-100 no-underline hover:no-underline"
        >
          ←
        </Link>
        <Link
          href={`/repos/${repoId}`}
          className={`font-semibold text-sm no-underline hover:no-underline ${
            pathname === `/repos/${repoId}`
              ? "text-sky-700"
              : "text-slate-900 hover:text-sky-700"
          }`}
        >
          {repoId}
        </Link>
      </div>
      <input
        type="search"
        placeholder="Filter entries…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full px-2 py-1.5 mb-3 text-xs rounded border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400"
      />
      <ul className="space-y-0.5">
        {sections.map((section) => (
          <SectionBlock
            key={section.kind}
            section={section}
            activeSection={active.section}
            activeHref={active.entityHref}
            filter={filter.toLowerCase()}
          />
        ))}
      </ul>
    </nav>
  );
}

function SectionBlock({
  section,
  activeSection,
  activeHref,
  filter,
}: {
  section: SidebarSection;
  activeSection?: SectionKind;
  activeHref?: string;
  filter: string;
}) {
  const isActiveSection = activeSection === section.kind;
  // 初始展開：目前頁面所屬 section 預設展開；之後以 user 的 open 為準
  const [open, setOpen] = useState(isActiveSection);
  // 每次 section 開啟（點擊展開 或 路由進入該 section）時 +1；
  // 把它當成 GroupBlock 的 key suffix，強制底下第一層 group 以預設狀態（auto-open）重掛載，
  // 避免使用者上次手動摺疊的狀態卡住。
  const [openGen, setOpenGen] = useState(0);

  // 路由切到此 section 時，自動展開並重設底下 groups
  useEffect(() => {
    if (isActiveSection) {
      setOpen(true);
      setOpenGen((g) => g + 1);
    }
  }, [isActiveSection]);

  // filter 有輸入時強制展開（不然 filter 沒意義）；其他情況都聽 user
  const effectiveOpen = filter.length > 0 ? true : open;

  const handleToggle = () => {
    setOpen((v) => {
      if (!v) setOpenGen((g) => g + 1); // 開啟時重設底下 groups
      return !v;
    });
  };

  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleToggle}
          className="flex-1 flex items-center gap-1 px-1.5 py-1 rounded hover:bg-slate-100 text-left"
        >
          {effectiveOpen ? (
            <ChevronDown className="size-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="size-3.5 text-slate-400" />
          )}
          <Link
            href={section.indexHref}
            className={`flex-1 no-underline hover:no-underline font-medium ${
              isActiveSection ? "text-sky-700" : "text-slate-800"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              // 點 label 直接跳到 section index；同時重設底下 groups（即便 isActiveSection 沒變化）
              setOpen(true);
              setOpenGen((g) => g + 1);
            }}
          >
            {section.label}
          </Link>
          <span className="text-[11px] text-slate-400">{section.count}</span>
        </button>
      </div>
      {effectiveOpen && (
        <div className="ml-4 mt-0.5">
          {section.groups
            ? section.groups.map((g) => (
                <GroupBlock
                  key={`${g.name}-${openGen}`}
                  group={g}
                  sectionIndexHref={section.indexHref}
                  activeHref={activeHref}
                  filter={filter}
                  totalGroups={section.groups!.length}
                />
              ))
            : section.flat && (
                <ItemList
                  items={section.flat}
                  activeHref={activeHref}
                  filter={filter}
                />
              )}
        </div>
      )}
    </li>
  );
}

const GROUP_AUTO_OPEN_MAX = 8;

// 遞迴收集 group（含所有 subgroups）裡會顯示的 items 總數（套用 filter 後）
function countAll(group: SidebarGroup, filter: string): number {
  const own = filter
    ? group.items.filter(
        (i) =>
          i.label.toLowerCase().includes(filter) ||
          (i.subtitle?.toLowerCase().includes(filter) ?? false),
      ).length
    : group.items.length;
  const sub =
    group.subgroups?.reduce((n, g) => n + countAll(g, filter), 0) ?? 0;
  return own + sub;
}

// 遞迴判斷 active item 是否落在此 group 或其子孫
function containsActiveDeep(
  group: SidebarGroup,
  activeHref: string | undefined,
): boolean {
  if (!activeHref) return false;
  if (group.items.some((i) => i.href === activeHref)) return true;
  return !!group.subgroups?.some((g) => containsActiveDeep(g, activeHref));
}

function GroupBlock({
  group,
  sectionIndexHref,
  activeHref,
  filter,
  totalGroups,
}: {
  group: SidebarGroup;
  sectionIndexHref: string;
  activeHref?: string;
  filter: string;
  totalGroups: number;
}) {
  const filteredItems = filter
    ? group.items.filter(
        (i) =>
          i.label.toLowerCase().includes(filter) ||
          (i.subtitle?.toLowerCase().includes(filter) ?? false),
      )
    : group.items;

  const totalCount = countAll(group, filter);
  const containsActive = containsActiveDeep(group, activeHref);
  const smallSection = totalGroups <= GROUP_AUTO_OPEN_MAX;
  // 初始展開：小 section 或此 group 底下（含子孫）有 active 則預設展開
  const [open, setOpen] = useState(smallSection || containsActive);

  const effectiveOpen = filter.length > 0 ? true : open;

  if (filter && totalCount === 0) return null;

  const anchorHref = `${sectionIndexHref}#${groupAnchorId(group.fullPath)}`;

  return (
    <div>
      <div className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-100">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={effectiveOpen ? "Collapse" : "Expand"}
          className="shrink-0"
        >
          {effectiveOpen ? (
            <ChevronDown className="size-3 text-slate-300" />
          ) : (
            <ChevronRight className="size-3 text-slate-300" />
          )}
        </button>
        <Link
          href={anchorHref}
          className="flex-1 text-xs text-slate-500 font-medium no-underline hover:no-underline hover:text-slate-900 text-left"
        >
          {group.name}
        </Link>
        <span className="text-[10px] text-slate-400 ml-auto">
          {totalCount}
        </span>
      </div>
      {effectiveOpen && (
        <div className="ml-3.5">
          {/* 先列本層 items，再列子 group */}
          {filteredItems.length > 0 && (
            <ItemList items={filteredItems} activeHref={activeHref} filter="" />
          )}
          {group.subgroups?.map((sub) => (
            <GroupBlock
              key={sub.name}
              group={sub}
              sectionIndexHref={sectionIndexHref}
              activeHref={activeHref}
              filter={filter}
              totalGroups={group.subgroups!.length}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemList({
  items,
  activeHref,
  filter,
}: {
  items: SidebarEntry[];
  activeHref?: string;
  filter: string;
}) {
  const filtered = filter
    ? items.filter(
        (i) =>
          i.label.toLowerCase().includes(filter) ||
          (i.subtitle?.toLowerCase().includes(filter) ?? false),
      )
    : items;

  if (filtered.length === 0)
    return <div className="px-1.5 py-1 text-xs text-slate-300">—</div>;

  return (
    <ul className="space-y-0.5">
      {filtered.map((it) => {
        const active = it.href === activeHref;
        return (
          <li key={it.id}>
            <Link
              href={it.href}
              className={`block px-1.5 py-0.5 rounded text-xs no-underline hover:no-underline truncate ${
                active
                  ? "bg-sky-50 text-sky-800"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              } ${it.deprecated ? "line-through text-slate-400" : ""}`}
              title={it.subtitle ?? it.label}
            >
              {it.label}
              {it.meta && (
                <span className="ml-1 text-[10px] text-slate-400">
                  {it.meta}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
