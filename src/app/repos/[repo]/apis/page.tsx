import { notFound } from "next/navigation";
import { getRepo, listRepoIds } from "@/lib/loader";
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
  items: Api[];          // 直接落在此層的 APIs
  subgroups: ApiGroupNode[];
}

function buildApiTree(apis: Api[]): ApiGroupNode[] {
  type Node = {
    name: string;
    items: Api[];
    subgroups: Map<string, Node>;
  };
  const root: Node = { name: "", items: [], subgroups: new Map() };

  for (const api of apis) {
    const parts = apiGroupName(api).split("/").filter(Boolean);
    let cursor = root;
    for (const part of parts) {
      let next = cursor.subgroups.get(part);
      if (!next) {
        next = { name: part, items: [], subgroups: new Map() };
        cursor.subgroups.set(part, next);
      }
      cursor = next;
    }
    cursor.items.push(api);
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

function renderApiCard(repoId: string, a: Api) {
  const deprecated = a.status === "deprecated" || a.status === "sunset";
  const badges: string[] = [a.auth, a.component];
  if (a.version) badges.push(a.version);
  if (a.endpoint_type && a.endpoint_type !== "rest")
    badges.push(a.endpoint_type);
  if (a.status && a.status !== "active") badges.push(a.status);
  return (
    <div key={a.id} className={deprecated ? "opacity-60" : ""}>
      <EntityCard
        href={apiPath(repoId, a.id)}
        title={a.id}
        subtitle={`${a.method} ${a.path}`}
        description={a.description}
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
          {node.items.map((a) => renderApiCard(repoId, a))}
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

  const filtered = repo.apis.filter((a) => {
    if (methods.length > 0 && !methods.includes(a.method)) return false;
    const status = a.status ?? "active";
    if (statuses.length > 0 && !statuses.includes(status)) return false;
    const etype = a.endpoint_type ?? "rest";
    if (endpointTypes.length > 0 && !endpointTypes.includes(etype)) return false;
    return matchesText(q, [a.id, a.path, a.description, a.group ?? ""]);
  });

  const tree = buildApiTree(filtered);

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
          {filtered.length} / {repo.apis.length}
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
