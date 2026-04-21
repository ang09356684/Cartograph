import Link from "next/link";
import { loadRepos } from "@/lib/loader";
import { repoPath } from "@/lib/paths";

export default async function Home() {
  const repos = await loadRepos();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Repositories</h1>
        <p className="text-slate-600 text-sm mt-1">
          Service manifests loaded from <code>data/</code> at build time.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {repos.map(({ service, apis, workers, tables, topics, integrations }) => (
          <Link
            key={service.id}
            href={repoPath(service.id)}
            className="block rounded-lg border border-slate-200 bg-white p-5 hover:border-sky-400 transition no-underline hover:no-underline"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {service.id}
              </h2>
              <span className="text-xs text-slate-500">{service.team}</span>
            </div>
            <p className="text-sm text-slate-600 mt-1">{service.description}</p>
            <div className="flex flex-wrap gap-1 mt-3">
              {service.tech.map((t) => (
                <span
                  key={t}
                  className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                >
                  {t}
                </span>
              ))}
            </div>
            <dl className="grid grid-cols-5 gap-2 mt-4 text-center">
              <Stat label="APIs" value={apis.length} />
              <Stat label="Workers" value={workers.length} />
              <Stat label="Tables" value={tables.length} />
              <Stat label="Topics" value={topics.length} />
              <Stat label="Integrations" value={integrations.length} />
            </dl>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  );
}
