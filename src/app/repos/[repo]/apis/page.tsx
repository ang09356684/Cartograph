import { notFound } from "next/navigation";
import { getRepo, groupApisByBaseId, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { EntityCard } from "@/components/EntityCard";
import { ListFilterBar } from "@/components/ListFilterBar";
import { apiPath, repoPath } from "@/lib/paths";
import { apiGroupName, groupAnchorId } from "@/lib/sidebar";
import { counts, matchesText, toArray } from "@/lib/filter";
import type { Api } from "@/types/manifest";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  return ids.map((repo) => ({ repo }));
}

interface PageProps {
  params: { repo: string };
  searchParams?: {
    q?: string | string[];
    method?: string | string[];
    status?: string | string[];
    endpoint_type?: string | string[];
  };
}

// --- Group tree (與 sidebar 一致的巢狀結構) --------------------------------

interface ApiGroupNode {
  name: string;          // 只顯示自己這層，例如 "tag"
  fullPath: string;      // 完整路徑例如 "orgs/tag"（供 key / debug 用）
  items: Api[][];        // 直接落在此層的 APIs，每個 entry 是同一個 base id 的所有版本
  subgroups: ApiGroupNode[];
}

// apiVersionGroups[i] = 同一 base id 的所有版本，已按新→舊排序。
// 以最新版的 path 決定該 base id 落在哪個 sidebar group。
function buildApiTree(apiVersionGroups: Api[][]): ApiGroupNode[] {
  type Node = {
    name: string;
    items: Api[][];
    subgroups: Map<string, Node>;
  };
  const root: Node = { name: "", items: [], subgroups: new Map() };

  for (const versions of apiVersionGroups) {
    const latest = versions[0];
    const parts = apiGroupName(latest).split("/").filter(Boolean);
    let cursor = root;
    for (const part of parts) {
      let next = cursor.subgroups.get(part);
      if (!next) {
        next = { name: part, items: [], subgroups: new Map() };
        cursor.subgroups.set(part, next);
      }
      cursor = next;
    }
    cursor.items.push(versions);
  }

  const toTree = (node: Node, prefix = ""): ApiGroupNode[] =>
    Array.from(node.subgroups.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => {
        const full = prefix ? `${prefix}/${n.name}` : n.name;
        return {
          name: n.name,
          fullPath: full,
          items: n.items,
          subgroups: toTree(n, full),
        };
      });

  return toTree(root);
}

function countDeep(node: ApiGroupNode): number {
  return (
    node.items.length +
    node.subgroups.reduce((sum, g) => sum + countDeep(g), 0)
  );
}

// `versions` 已按版本由新到舊排序；latest = versions[0]。
// 多版本時 badges 會列出所有 version tag（最新在前），href 一律指向 base id
// （detail 頁會依 ?version= 切換、缺省挑最新）。
function renderApiCard(repoId: string, versions: Api[]) {
  const latest = versions[0];
  const deprecated =
    latest.status === "deprecated" || latest.status === "sunset";
  const badges: string[] = [latest.auth, latest.component];
  if (versions.length > 1) {
    for (const v of versions) if (v.version) badges.push(v.version);
  } else if (latest.version) {
    badges.push(latest.version);
  }
  if (latest.endpoint_type && latest.endpoint_type !== "rest")
    badges.push(latest.endpoint_type);
  if (latest.status && latest.status !== "active") badges.push(latest.status);
  return (
    <div key={latest.id} className={deprecated ? "opacity-60" : ""}>
      <EntityCard
        href={apiPath(repoId, latest.id)}
        title={latest.id}
        subtitle={`${latest.method} ${latest.path}`}
        description={latest.description}
        badges={badges}
      />
    </div>
  );
}

function GroupNode({
  node,
  repoId,
  depth = 0,
}: {
  node: ApiGroupNode;
  repoId: string;
  depth?: number;
}) {
  const total = countDeep(node);
  return (
    <CollapsibleSection
      // 只顯示自己這層名稱（例如 TAG），不顯示完整路徑（ORGS/TAG）
      // 層級關係已靠縮排 + 左側 border 表達
      title={node.name.toUpperCase()}
      count={total}
      id={groupAnchorId(node.fullPath)}
    >
      {/* 本層直接的 cards */}
      {node.items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {node.items.map((versions) => renderApiCard(repoId, versions))}
        </div>
      )}
      {/* 巢狀子 group，以左側 border + 縮排示意層級 */}
      {node.subgroups.length > 0 && (
        <div
          className={`${node.items.length > 0 ? "mt-4" : ""} space-y-4 ml-4 pl-3 border-l-2 border-slate-200`}
        >
          {node.subgroups.map((sub) => (
            <GroupNode
              key={sub.fullPath}
              node={sub}
              repoId={repoId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

// --- Page -----------------------------------------------------------------

export default async function ApisIndex({ params, searchParams }: PageProps) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();

  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined;
  const methods = toArray(searchParams?.method);
  const statuses = toArray(searchParams?.status);
  const endpointTypes = toArray(searchParams?.endpoint_type);

  const methodCounts = counts(repo.apis, (a) => a.method);
  const statusCounts = counts(repo.apis, (a) => a.status ?? "active");
  const endpointTypeCounts = counts(
    repo.apis,
    (a) => a.endpoint_type ?? "rest",
  );

  // Group by base id first；filter 條件在任一版本上滿足就整個 base id 留下
  // （避免 V1/V2 其中一個版本被濾掉導致該 API 整行消失 / 單邊顯示）。
  const grouped = groupApisByBaseId(repo.apis);
  const versionGroups = Array.from(grouped.values());
  const filteredGroups = versionGroups.filter((versions) =>
    versions.some((a) => {
      if (methods.length > 0 && !methods.includes(a.method)) return false;
      const status = a.status ?? "active";
      if (statuses.length > 0 && !statuses.includes(status)) return false;
      const etype = a.endpoint_type ?? "rest";
      if (endpointTypes.length > 0 && !endpointTypes.includes(etype)) return false;
      return matchesText(q, [a.id, a.path, a.description, a.group ?? ""]);
    }),
  );

  const tree = buildApiTree(filteredGroups);

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: repo.service.id, href: repoPath(repo.service.id) },
          { label: "APIs" },
        ]}
      />
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">APIs</h1>
        <span className="text-sm text-slate-500">
          {filteredGroups.length} / {versionGroups.length}
        </span>
      </div>

      <ListFilterBar
        searchPlaceholder="Filter by id / path / description…"
        chipGroups={[
          {
            key: "method",
            label: "Method",
            options: Object.entries(methodCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([value, count]) => ({ value, label: value, count })),
          },
          {
            key: "status",
            label: "Status",
            options: Object.entries(statusCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([value, count]) => ({ value, label: value, count })),
          },
          {
            key: "endpoint_type",
            label: "Type",
            options: Object.entries(endpointTypeCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([value, count]) => ({ value, label: value, count })),
          },
        ].filter((g) => g.options.length > 1)}
      />

      {tree.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">
          No APIs match the current filters.
        </p>
      )}

      <div className="space-y-5">
        {tree.map((node) => (
          <GroupNode
            key={node.fullPath}
            node={node}
            repoId={repo.service.id}
          />
        ))}
      </div>
    </div>
  );
}
