import { notFound } from "next/navigation";
import { getRepo, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { EntityCard } from "@/components/EntityCard";
import { ListFilterBar } from "@/components/ListFilterBar";
import { integrationPath, repoPath } from "@/lib/paths";
import { counts, matchesText, toArray } from "@/lib/filter";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  return ids.map((repo) => ({ repo }));
}

export default async function IntegrationsIndex({
  params,
  searchParams,
}: {
  params: { repo: string };
  searchParams?: {
    q?: string | string[];
    direction?: string | string[];
    kind?: string | string[];
  };
}) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();

  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined;
  const directions = toArray(searchParams?.direction);
  const kinds = toArray(searchParams?.kind);

  const directionCounts: Record<string, number> = {};
  repo.integrations.forEach((e) => {
    e.directions.forEach((d) => {
      directionCounts[d] = (directionCounts[d] ?? 0) + 1;
    });
  });
  const kindCounts = counts(repo.integrations, (e) => e.kind);

  const filtered = repo.integrations.filter((e) => {
    if (
      directions.length > 0 &&
      !e.directions.some((d) => directions.includes(d))
    )
      return false;
    if (kinds.length > 0 && !kinds.includes(e.kind)) return false;
    return matchesText(q, [e.id, e.description ?? "", e.provider ?? "", e.kind]);
  });

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: repo.service.id, href: repoPath(repo.service.id) },
          { label: "Integrations" },
        ]}
      />
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <span className="text-sm text-slate-500">
          {filtered.length} / {repo.integrations.length}
        </span>
      </div>
      <ListFilterBar
        searchPlaceholder="Filter integrations…"
        chipGroups={[
          {
            key: "direction",
            label: "Dir",
            options: Object.entries(directionCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([value, count]) => ({ value, label: value, count })),
          },
          {
            key: "kind",
            label: "Kind",
            options: Object.entries(kindCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([value, count]) => ({ value, label: value, count })),
          },
        ].filter((g) => g.options.length > 1)}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((e) => (
          <EntityCard
            key={e.id}
            href={integrationPath(repo.service.id, e.id)}
            title={e.id}
            subtitle={e.kind}
            description={e.description}
            badges={[...e.directions, ...(e.provider ? [e.provider] : [])]}
          />
        ))}
      </div>
    </div>
  );
}
