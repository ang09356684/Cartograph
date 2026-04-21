import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getRepo, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SectionHeading } from "@/components/EntityCard";
import {
  apisIndexPath,
  integrationsIndexPath,
  tablesIndexPath,
  topicsIndexPath,
  workersIndexPath,
} from "@/lib/paths";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  return ids.map((repo) => ({ repo }));
}

export default async function RepoOverview({
  params,
}: {
  params: { repo: string };
}) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();

  const { service, apis, workers, tables, topics, integrations } = repo;
  const repoId = service.id;

  const bucketMap = new Map<string, string[]>();
  for (const e of service.environments) {
    if (!e.gcs_bucket) continue;
    const envs = bucketMap.get(e.gcs_bucket) ?? [];
    envs.push(e.id);
    bucketMap.set(e.gcs_bucket, envs);
  }
  const buckets = Array.from(bucketMap, ([bucket, envs]) => ({ bucket, envs }));

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: service.id },
        ]}
      />

      <div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">{service.id}</h1>
          <span
            className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700"
            title="Owning team (from service.yaml#team)"
          >
            team: {service.team}
          </span>
        </div>
        <p className="text-sm text-slate-500 font-mono mt-1">{service.repo}</p>
        <p className="text-slate-700 mt-3">{service.description}</p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoPanel title="Tech">
          <div className="flex flex-wrap gap-1">
            {service.tech.map((t) => (
              <span
                key={t}
                className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700"
              >
                {t}
              </span>
            ))}
          </div>
        </InfoPanel>
        <InfoPanel title="Infra">
          <div className="flex flex-wrap gap-1">
            {service.depends_on_infra.map((t) => (
              <span
                key={t}
                className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-100"
              >
                {t}
              </span>
            ))}
          </div>
          {buckets.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">
                GCS buckets
              </div>
              <ul className="space-y-0.5 text-xs">
                {buckets.map((b) => (
                  <li key={b.bucket} className="font-mono flex items-baseline gap-2">
                    <span className="text-slate-900">{b.bucket}</span>
                    <span className="text-slate-400 text-[11px]">
                      {b.envs.join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </InfoPanel>
        <InfoPanel title="Components">
          <ul className="space-y-1.5">
            {service.components.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-medium text-slate-900">{c.id}</span>
                <span className="font-mono text-xs text-slate-500 ml-2">
                  {c.binary}
                </span>
                <p className="text-slate-600">{c.description}</p>
              </li>
            ))}
          </ul>
        </InfoPanel>
      </section>

      <section>
        <SectionHeading title="Entities" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <SectionSummary
            title="APIs"
            href={apisIndexPath(repoId)}
            count={apis.length}
            breakdown={buildBreakdown(apis, (a) => a.method)}
            emptyHint="No API defined yet"
          />
          <SectionSummary
            title="Workers"
            href={workersIndexPath(repoId)}
            count={workers.length}
            breakdown={buildBreakdown(workers, (w) => w.kind ?? "pubsub-subscriber")}
            emptyHint="No worker defined yet"
          />
          <SectionSummary
            title="Tables"
            href={tablesIndexPath(repoId)}
            count={tables.length}
            breakdown={buildBreakdown(tables, (t) => t.database)}
            emptyHint="No table defined yet"
          />
          <SectionSummary
            title="Topics"
            href={topicsIndexPath(repoId)}
            count={topics.length}
            breakdown={buildBreakdown(topics, (t) => t.provider)}
            emptyHint="No topic defined yet"
          />
          <SectionSummary
            title="Integrations"
            href={integrationsIndexPath(repoId)}
            count={integrations.length}
            breakdown={buildBreakdown(integrations, (e) => e.kind)}
            emptyHint="No integration defined yet"
          />
        </div>
      </section>

      {service.environments.length > 0 && (
        <div>
          <SectionHeading
            title="Environments"
            count={service.environments.length}
          />
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">Env</th>
                  <th className="text-left px-3 py-2">GCP project</th>
                  <th className="text-left px-3 py-2">Region</th>
                  <th className="text-left px-3 py-2">API URL</th>
                  <th className="text-left px-3 py-2">GCS bucket</th>
                  <th className="text-left px-3 py-2">CDN prefix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {service.environments.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 font-mono text-xs font-medium">
                      {e.id}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {e.gcp_project}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {e.region ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600 break-all">
                      {e.api_url_pattern ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {e.gcs_bucket ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600 break-all">
                      {e.cdn_url_prefix ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {service.env_config.length > 0 && (
        <div>
          <SectionHeading title="Env config" count={service.env_config.length} />
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">Key</th>
                  <th className="text-left px-3 py-2">Used by</th>
                  <th className="text-left px-3 py-2">Source</th>
                  <th className="text-left px-3 py-2">Default</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {service.env_config.map((e) => (
                  <tr key={e.key}>
                    <td className="px-3 py-2 font-mono text-xs">{e.key}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {e.used_by?.join(", ") ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {e.source ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700 font-mono text-xs">
                      {e.default ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function buildBreakdown<T>(
  items: T[],
  keyFn: (item: T) => string,
): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const it of items) {
    const k = keyFn(it);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from(counts, ([key, count]) => ({ key, count })).sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key),
  );
}

function SectionSummary({
  title,
  href,
  count,
  breakdown,
  emptyHint,
}: {
  title: string;
  href: string;
  count: number;
  breakdown: Array<{ key: string; count: number }>;
  emptyHint: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-slate-200 bg-white p-4 hover:border-sky-400 transition no-underline hover:no-underline flex flex-col gap-2"
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <span className="text-sm text-slate-400">{count}</span>
        </div>
        <ArrowRight className="size-3.5 text-slate-300 group-hover:text-sky-500 self-center" />
      </div>
      {count === 0 ? (
        <p className="text-xs text-slate-400">{emptyHint}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {breakdown.map((b) => (
            <span
              key={b.key}
              className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono"
              title={`${b.key}: ${b.count}`}
            >
              {b.key}
              <span className="text-slate-400 ml-1">{b.count}</span>
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
