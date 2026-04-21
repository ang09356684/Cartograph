import { notFound } from "next/navigation";
import { getRepo, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { EntityCard } from "@/components/EntityCard";
import { ListFilterBar } from "@/components/ListFilterBar";
import { middlewarePath, repoPath } from "@/lib/paths";
import { counts, matchesText, toArray } from "@/lib/filter";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  return ids.map((repo) => ({ repo }));
}

interface PageProps {
  params: { repo: string };
  searchParams?: {
    q?: string | string[];
    kind?: string | string[];
  };
}

export default async function MiddlewaresIndex({
  params,
  searchParams,
}: PageProps) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();

  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined;
  const kinds = toArray(searchParams?.kind);
  const kindCounts = counts(repo.middlewares, (m) => m.kind);

  const filtered = repo.middlewares.filter((m) => {
    if (kinds.length > 0 && !kinds.includes(m.kind)) return false;
    return matchesText(q, [m.id, m.description ?? "", m.kind]);
  });

  const grouped: Record<string, typeof filtered> = {};
  filtered.forEach((m) => {
    (grouped[m.kind] ??= []).push(m);
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
          { label: "Middlewares" },
        ]}
      />
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">Middlewares</h1>
        <span className="text-sm text-slate-500">
          {filtered.length} / {repo.middlewares.length}
        </span>
      </div>

      <ListFilterBar
        searchPlaceholder="Filter by id / description…"
        chipGroups={[
          {
            key: "kind",
            label: "Kind",
            options: Object.entries(kindCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([value, count]) => ({ value, label: value, count })),
          },
        ].filter((g) => g.options.length > 1)}
      />

      {groupEntries.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">
          No middlewares match the current filters.
        </p>
      )}

      {groupEntries.map(([kindName, items]) => (
        <section key={kindName}>
          <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            {kindName} <span className="text-slate-400">({items.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((m) => (
              <EntityCard
                key={m.id}
                href={middlewarePath(repo.service.id, m.id)}
                title={m.id}
                subtitle={m.kind}
                description={m.description}
                badges={m.provided_by ? [m.provided_by] : []}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
