import { Repo } from "@/types/manifest";
import {
  apiPath,
  apisIndexPath,
  integrationPath,
  integrationsIndexPath,
  middlewarePath,
  middlewaresIndexPath,
  tablePath,
  tablesIndexPath,
  topicPath,
  topicsIndexPath,
  workerPath,
  workersIndexPath,
} from "@/lib/paths";

export type SectionKind =
  | "apis"
  | "workers"
  | "tables"
  | "topics"
  | "integrations"
  | "middlewares";

export interface SidebarEntry {
  id: string;
  label: string;
  subtitle?: string;
  href: string;
  deprecated?: boolean;
  meta?: string;
}

export interface SidebarGroup {
  name: string;              // 只顯示自己這一層的名字（例如 "tag"，非 "orgs/tag"）
  fullPath: string;          // 由 root 起算的完整 path（例如 "orgs/tag"），作為 list-page 上對應 section 的錨點 key
  items: SidebarEntry[];     // 直接落在這一層的 entries
  subgroups?: SidebarGroup[]; // 巢狀子 group（可遞迴）
}

/**
 * 把 group fullPath 轉成 list page 上對應 section 的 HTML id。
 * 與 list page（apis/tables page）的 `id` 必須一致，sidebar 點擊時 hash 才跳得到。
 * `/` 在 URL fragment 會誤解，改用 `__` 避開。
 */
export function groupAnchorId(fullPath: string): string {
  return `group-${fullPath.replace(/\//g, "__")}`;
}

export interface SidebarSection {
  kind: SectionKind;
  label: string;
  count: number;
  indexHref: string;
  flat?: SidebarEntry[];
  groups?: SidebarGroup[];
}

// 判斷 segment 是否為 path param（`:id` / `{id}` / 純數字 id）
function isParamSegment(seg: string): boolean {
  return seg.startsWith(":") || /^\{.+\}$/.test(seg) || /^\d+$/.test(seg);
}

/**
 * API 自動推算 group（auto-group rule）：
 *   1. 若 yaml 有手寫 `group:` 直接用
 *   2. 若 path 為 `/api/vN/<A>/<param>/<B>/...` → 回 `A/B`（2 層分組，navigate cleaner）
 *   3. 若 path 為 `/api/vN/<A>/...` → 回 `A`
 *   4. 非 `/api/vN/` 開頭（e.g. `/webhook/whatsapp`）→ 回第一段 `webhook`
 *   5. 全部 fallback → `misc`
 *
 * 範例：
 *   /api/v1/orgs                                   → orgs
 *   /api/v1/orgs/:org_id                           → orgs
 *   /api/v1/orgs/:org_id/tag/tags                  → orgs/tag
 *   /api/v1/orgs/:org_id/ai/ai-features            → orgs/ai
 *   /api/v1/orgs/:org_id/features/:code            → orgs/features
 *   /api/v1/auth/accounts/sign-in                  → auth
 *   /webhook/whatsapp                              → webhook
 */
export function apiGroupName(api: { group?: string; path: string }): string {
  if (api.group) return api.group;
  const segs = api.path.split("/").filter(Boolean);

  // /api/vN/... 開頭：剝掉 api + vN 兩層
  if (segs[0] === "api" && segs[1] && /^v\d+$/.test(segs[1])) {
    const rest = segs.slice(2);
    if (rest.length === 0) return "misc";
    // /api/vN/<A>/<param>/<B>/... → A/B
    if (rest.length >= 3 && isParamSegment(rest[1])) {
      return `${rest[0]}/${rest[2]}`;
    }
    return rest[0];
  }

  return segs[0] ?? "misc";
}

export function tableGroupName(table: { group?: string; id: string }): string {
  if (table.group) return table.group;
  const pivot = table.id.indexOf("_");
  if (pivot > 0) return table.id.slice(0, pivot);
  return table.id;
}

/**
 * 依 groupFn 返回的 path-like 字串（以 "/" 分隔）建出巢狀 SidebarGroup tree。
 *   e.g. groupFn 回 "orgs" / "orgs/tag" / "orgs/ai"
 *        → [{ name: "orgs", items: [...], subgroups: [{ name: "tag", ... }, { name: "ai", ... }] }]
 */
function makeGroups(
  entries: SidebarEntry[],
  groupFn: (idx: number) => string,
): SidebarGroup[] {
  type Node = {
    name: string;
    items: SidebarEntry[];
    subgroups: Map<string, Node>;
  };
  const root: Node = { name: "", items: [], subgroups: new Map() };

  entries.forEach((entry, i) => {
    const parts = groupFn(i).split("/").filter(Boolean);
    let cursor = root;
    for (const part of parts) {
      let next = cursor.subgroups.get(part);
      if (!next) {
        next = { name: part, items: [], subgroups: new Map() };
        cursor.subgroups.set(part, next);
      }
      cursor = next;
    }
    cursor.items.push(entry);
  });

  const toArray = (node: Node, prefix = ""): SidebarGroup[] =>
    Array.from(node.subgroups.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => {
        const full = prefix ? `${prefix}/${n.name}` : n.name;
        return {
          name: n.name,
          fullPath: full,
          items: n.items,
          subgroups: n.subgroups.size > 0 ? toArray(n, full) : undefined,
        };
      });

  return toArray(root);
}

export function buildSidebar(repo: Repo): SidebarSection[] {
  const repoId = repo.service.id;

  const apiEntries: SidebarEntry[] = repo.apis.map((a) => ({
    id: a.id,
    label: a.id,
    subtitle: `${a.method} ${a.path}`,
    href: apiPath(repoId, a.id),
    deprecated: a.status === "deprecated" || a.status === "sunset",
    meta: a.version,
  }));
  const apiGroups = makeGroups(apiEntries, (i) =>
    apiGroupName(repo.apis[i]),
  );

  const workerEntries: SidebarEntry[] = repo.workers.map((w) => ({
    id: w.id,
    label: w.id,
    subtitle: w.subscribes_topic,
    href: workerPath(repoId, w.id),
  }));

  const tableEntries: SidebarEntry[] = repo.tables.map((t) => ({
    id: t.id,
    label: t.id,
    subtitle: t.database,
    href: tablePath(repoId, t.id),
  }));
  const tableGroups = makeGroups(tableEntries, (i) =>
    tableGroupName(repo.tables[i]),
  );

  const topicEntries: SidebarEntry[] = repo.topics.map((t) => ({
    id: t.id,
    label: t.id,
    subtitle: t.provider,
    href: topicPath(repoId, t.id),
  }));

  const integrationEntries: SidebarEntry[] = repo.integrations.map((e) => ({
    id: e.id,
    label: e.id,
    subtitle: e.kind,
    href: integrationPath(repoId, e.id),
    meta: e.directions.join("/"),
  }));

  const middlewareEntries: SidebarEntry[] = repo.middlewares.map((m) => ({
    id: m.id,
    label: m.id,
    subtitle: m.kind,
    href: middlewarePath(repoId, m.id),
  }));
  const middlewareGroups = makeGroups(middlewareEntries, (i) =>
    repo.middlewares[i].kind,
  );

  return [
    {
      kind: "apis",
      label: "APIs",
      count: apiEntries.length,
      indexHref: apisIndexPath(repoId),
      groups: apiGroups,
    },
    {
      kind: "middlewares",
      label: "Middlewares",
      count: middlewareEntries.length,
      indexHref: middlewaresIndexPath(repoId),
      groups: middlewareGroups,
    },
    {
      kind: "workers",
      label: "Workers",
      count: workerEntries.length,
      indexHref: workersIndexPath(repoId),
      flat: workerEntries,
    },
    {
      kind: "tables",
      label: "Tables",
      count: tableEntries.length,
      indexHref: tablesIndexPath(repoId),
      groups: tableGroups,
    },
    {
      kind: "topics",
      label: "Topics",
      count: topicEntries.length,
      indexHref: topicsIndexPath(repoId),
      flat: topicEntries,
    },
    {
      kind: "integrations",
      label: "Integrations",
      count: integrationEntries.length,
      indexHref: integrationsIndexPath(repoId),
      flat: integrationEntries,
    },
  ];
}
