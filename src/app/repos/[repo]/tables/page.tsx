import { notFound } from "next/navigation";
import { getRepo, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { EntityCard } from "@/components/EntityCard";
import { ListFilterBar } from "@/components/ListFilterBar";
import { repoPath, tablePath } from "@/lib/paths";
import { groupAnchorId, tableGroupName } from "@/lib/sidebar";
import { counts, matchesText, toArray } from "@/lib/filter";
import type { Table } from "@/types/manifest";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  return ids.map((repo) => ({ repo }));
}

interface PageProps {
  params: { repo: string };
  searchParams?: {
    q?: string | string[];
    database?: string | string[];
  };
}

export default async function TablesIndex({ params, searchParams }: PageProps) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();

  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined;
  const databases = toArray(searchParams?.database);
  const dbCounts = counts(repo.tables, (t) => t.database);

  const filtered = repo.tables.filter((t) => {
    if (databases.length > 0 && !databases.includes(t.database)) return false;
    return matchesText(q, [t.id, t.description ?? "", t.group ?? ""]);
  });

  const grouped: Record<string, Table[]> = {};
  filtered.forEach((t) => {
    const g = tableGroupName(t);
    (grouped[g] ??= []).push(t);
  });
  const groupEntries = Object.entries(grouped).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: repo.service.id, href: repoPath(repo.service.id) },
          { label: "Tables" },
        ]}
      />
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">Tables</h1>
        <span className="text-sm text-slate-500">
          {filtered.length} / {repo.tables.length}
        </span>
      </div>

      <ListFilterBar
        searchPlaceholder="Filter by id / description…"
        chipGroups={[
          {
            key: "database",
            label: "DB",
            options: Object.entries(dbCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([value, count]) => ({ value, label: value, count })),
          },
        ].filter((g) => g.options.length > 1)}
      />

      {groupEntries.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">
          No tables match the current filters.
        </p>
      )}

      {groupEntries.map(([groupName, items]) => (
        <section
          key={groupName}
          id={groupAnchorId(groupName)}
          className="scroll-mt-20"
        >
          <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            {groupName}{" "}
            <span className="text-slate-400">({items.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((t) => (
              <EntityCard
                key={t.id}
                href={tablePath(repo.service.id, t.id)}
                title={t.id}
                subtitle={t.database}
                description={t.description}
                badges={[`${t.columns.length} cols`]}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
