import { notFound } from "next/navigation";
import { getRepo, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { EntityCard } from "@/components/EntityCard";
import { ListFilterBar } from "@/components/ListFilterBar";
import { repoPath, workerPath } from "@/lib/paths";
import { matchesText } from "@/lib/filter";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  return ids.map((repo) => ({ repo }));
}

export default async function WorkersIndex({
  params,
  searchParams,
}: {
  params: { repo: string };
  searchParams?: { q?: string | string[] };
}) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();

  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined;
  const filtered = repo.workers.filter((w) =>
    matchesText(q, [w.id, w.description, w.subscribes_topic ?? ""]),
  );

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: repo.service.id, href: repoPath(repo.service.id) },
          { label: "Workers" },
        ]}
      />
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">Workers</h1>
        <span className="text-sm text-slate-500">
          {filtered.length} / {repo.workers.length}
        </span>
      </div>
      <ListFilterBar searchPlaceholder="Filter workers…" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((w) => (
          <EntityCard
            key={w.id}
            href={workerPath(repo.service.id, w.id)}
            title={w.id}
            subtitle={w.subscribes_topic}
            description={w.description}
            badges={[w.component]}
          />
        ))}
      </div>
    </div>
  );
}
