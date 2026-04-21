import { notFound } from "next/navigation";
import { getRepo, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { EntityCard } from "@/components/EntityCard";
import { ListFilterBar } from "@/components/ListFilterBar";
import { repoPath, topicPath } from "@/lib/paths";
import { matchesText } from "@/lib/filter";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  return ids.map((repo) => ({ repo }));
}

export default async function TopicsIndex({
  params,
  searchParams,
}: {
  params: { repo: string };
  searchParams?: { q?: string | string[] };
}) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();

  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined;
  const filtered = repo.topics.filter((t) =>
    matchesText(q, [t.id, t.description ?? "", t.provider]),
  );

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: repo.service.id, href: repoPath(repo.service.id) },
          { label: "Topics" },
        ]}
      />
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">Topics</h1>
        <span className="text-sm text-slate-500">
          {filtered.length} / {repo.topics.length}
        </span>
      </div>
      <ListFilterBar searchPlaceholder="Filter topics…" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((t) => (
          <EntityCard
            key={t.id}
            href={topicPath(repo.service.id, t.id)}
            title={t.id}
            subtitle={t.provider}
            description={t.description}
            badges={t.delivery_guarantee ? [t.delivery_guarantee] : []}
          />
        ))}
      </div>
    </div>
  );
}
