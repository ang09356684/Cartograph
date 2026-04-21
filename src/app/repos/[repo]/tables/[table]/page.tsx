import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepo, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CodeRef } from "@/components/CodeRef";
import { SchemaTable } from "@/components/SchemaTable";
import {
  apiPath,
  repoPath,
  tablesIndexPath,
  workerPath,
} from "@/lib/paths";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  const out: { repo: string; table: string }[] = [];
  for (const id of ids) {
    const r = await getRepo(id);
    if (!r) continue;
    for (const t of r.tables) out.push({ repo: id, table: t.id });
  }
  return out;
}

export default async function TableDetail({
  params,
}: {
  params: { repo: string; table: string };
}) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();
  const table = repo.tables.find((t) => t.id === params.table);
  if (!table) notFound();

  const repoId = repo.service.id;
  const ghRepo = repo.service.repo;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: repoId, href: repoPath(repoId) },
          { label: "Tables", href: tablesIndexPath(repoId) },
          { label: table.id },
        ]}
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-semibold">{table.id}</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
            {table.database}
          </span>
        </div>
        {table.description && (
          <p className="text-slate-700">{table.description}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {table.migration_ref && (
            <CodeRef value={table.migration_ref} repo={ghRepo} />
          )}
          {table.model_code_ref && (
            <CodeRef value={table.model_code_ref} repo={ghRepo} />
          )}
          {table.repo_code_ref && (
            <CodeRef value={table.repo_code_ref} repo={ghRepo} />
          )}
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Columns <span className="text-sm text-slate-500 font-normal">({table.columns.length})</span>
        </h2>
        <SchemaTable columns={table.columns} />
      </section>

      {table.indexes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Indexes</h2>
          <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
            {table.indexes.map((i) => (
              <li key={i.name} className="px-4 py-2 text-sm">
                <span className="font-mono text-xs">{i.name}</span>
                <span className="text-slate-500 text-xs mx-2">—</span>
                <span className="text-slate-700">
                  ({i.columns.join(", ")})
                </span>
                {i.unique && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide px-1 rounded bg-amber-50 text-amber-700 border border-amber-100">
                    unique
                  </span>
                )}
                {i.type && (
                  <span className="ml-2 text-xs text-slate-500">
                    {i.type}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReadWritePanel
          title="Read by"
          apis={table.read_by?.apis ?? []}
          workers={table.read_by?.workers ?? []}
          repoId={repoId}
        />
        <ReadWritePanel
          title="Written by"
          apis={table.write_by?.apis ?? []}
          workers={table.write_by?.workers ?? []}
          repoId={repoId}
        />
      </section>
    </div>
  );
}

function ReadWritePanel({
  title,
  apis,
  workers,
  repoId,
}: {
  title: string;
  apis: string[];
  workers: string[];
  repoId: string;
}) {
  const empty = apis.length === 0 && workers.length === 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-3">
        {title}
      </h3>
      {empty ? (
        <p className="text-sm text-slate-500">—</p>
      ) : (
        <div className="space-y-2 text-sm">
          {apis.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">APIs</div>
              <div className="flex flex-wrap gap-1">
                {apis.map((id) => (
                  <Link
                    key={id}
                    href={apiPath(repoId, id)}
                    className="font-mono text-xs rounded bg-sky-50 text-sky-800 px-1.5 py-0.5 no-underline hover:no-underline hover:bg-sky-100"
                  >
                    {id}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {workers.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Workers</div>
              <div className="flex flex-wrap gap-1">
                {workers.map((id) => (
                  <Link
                    key={id}
                    href={workerPath(repoId, id)}
                    className="font-mono text-xs rounded bg-sky-50 text-sky-800 px-1.5 py-0.5 no-underline hover:no-underline hover:bg-sky-100"
                  >
                    {id}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
