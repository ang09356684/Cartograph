import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepo, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CodeRef } from "@/components/CodeRef";
import {
  apiPath,
  middlewarePath,
  middlewaresIndexPath,
  repoPath,
} from "@/lib/paths";
import { middlewareUsers } from "@/lib/resolver";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  const out: { repo: string; middleware: string }[] = [];
  for (const id of ids) {
    const r = await getRepo(id);
    if (!r) continue;
    for (const m of r.middlewares) out.push({ repo: id, middleware: m.id });
  }
  return out;
}

const kindColor: Record<string, string> = {
  auth: "bg-rose-100 text-rose-800 border-rose-200",
  observability: "bg-sky-100 text-sky-800 border-sky-200",
  "input-validation": "bg-amber-100 text-amber-800 border-amber-200",
  "rate-limit": "bg-purple-100 text-purple-800 border-purple-200",
  "error-handling": "bg-orange-100 text-orange-800 border-orange-200",
  "panic-recovery": "bg-orange-100 text-orange-800 border-orange-200",
  "request-id": "bg-emerald-100 text-emerald-800 border-emerald-200",
  other: "bg-slate-100 text-slate-800 border-slate-200",
};

export default async function MiddlewareDetail({
  params,
}: {
  params: { repo: string; middleware: string };
}) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();
  const mw = repo.middlewares.find((m) => m.id === params.middleware);
  if (!mw) notFound();

  const repoId = repo.service.id;
  const ghRepo = repo.service.repo;
  const users = middlewareUsers(repo, mw.id);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: repoId, href: repoPath(repoId) },
          { label: "Middlewares", href: middlewaresIndexPath(repoId) },
          { label: mw.id },
        ]}
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{mw.id}</h1>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded border ${
              kindColor[mw.kind] ?? kindColor.other
            }`}
          >
            {mw.kind}
          </span>
          {mw.provided_by && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {mw.provided_by}
            </span>
          )}
        </div>
        {mw.description && <p className="text-slate-700">{mw.description}</p>}
        {mw.code_ref && (
          <div className="pt-1">
            <CodeRef value={mw.code_ref} repo={ghRepo} />
          </div>
        )}
      </div>

      {mw.config && (mw.config.env_vars.length > 0 || mw.config.note) && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
          <h2 className="text-sm font-semibold text-amber-900 mb-2 uppercase tracking-wide">
            Config
          </h2>
          {mw.config.env_vars.length > 0 && (
            <div className="mb-2">
              <div className="text-xs text-slate-600 mb-1">Environment variables</div>
              <div className="flex flex-wrap gap-1">
                {mw.config.env_vars.map((v) => (
                  <span
                    key={v}
                    className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white text-amber-800 border border-amber-100"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          {mw.config.secret_source && (
            <div className="text-xs">
              <span className="text-slate-500">secret source: </span>
              <span className="font-mono">{mw.config.secret_source}</span>
            </div>
          )}
          {mw.config.note && (
            <p className="text-xs text-slate-600 mt-1">{mw.config.note}</p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Reads context
          </h2>
          {mw.reads_context.length === 0 ? (
            <p className="text-xs text-slate-500">—</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {mw.reads_context.map((c) => (
                <li key={c.key}>
                  <span className="font-mono text-slate-900">{c.key}</span>
                  {c.type && (
                    <span className="text-slate-500 font-mono">: {c.type}</span>
                  )}
                  {c.description && (
                    <p className="text-slate-500 mt-0.5">{c.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Writes context
          </h2>
          {mw.writes_context.length === 0 ? (
            <p className="text-xs text-slate-500">—</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {mw.writes_context.map((c) => (
                <li key={c.key}>
                  <span className="font-mono text-slate-900">{c.key}</span>
                  {c.type && (
                    <span className="text-slate-500 font-mono">: {c.type}</span>
                  )}
                  {c.description && (
                    <p className="text-slate-500 mt-0.5">{c.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {mw.error_responses.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Error responses</h2>
          <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {mw.error_responses.map((r, i) => (
              <li
                key={`${r.status}-${r.error_code ?? ""}-${i}`}
                className="px-4 py-2.5 flex items-start gap-3"
              >
                <span
                  className={`text-xs font-semibold font-mono px-1.5 py-0.5 rounded ${
                    r.status < 300
                      ? "bg-emerald-100 text-emerald-800"
                      : r.status < 500
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {r.status}
                </span>
                <div className="text-xs flex-1">
                  {r.error_code && (
                    <div className="font-mono text-slate-900">
                      {r.error_code}
                    </div>
                  )}
                  {r.when && <p className="text-slate-500">{r.when}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mw.order_constraints.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Order constraints</h2>
          <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {mw.order_constraints.map((oc, i) => {
              const target = oc.must_be_after ?? oc.must_be_before;
              const rel = oc.must_be_after ? "must be after" : "must be before";
              return (
                <li key={i} className="px-4 py-2.5 text-xs">
                  <span className="text-slate-500">{rel} </span>
                  {target && (
                    <Link
                      href={middlewarePath(repoId, target)}
                      className="font-mono text-sky-700 no-underline hover:underline"
                    >
                      {target}
                    </Link>
                  )}
                  {oc.reason && (
                    <p className="text-slate-500 mt-0.5">{oc.reason}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-3">
            Used by pipelines
          </h3>
          {users.pipelines.length === 0 ? (
            <p className="text-sm text-slate-500">—</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {users.pipelines.map((id) => (
                <span
                  key={id}
                  className="font-mono text-xs rounded bg-slate-100 text-slate-700 px-1.5 py-0.5"
                  title="pipeline id (defined in service.yaml)"
                >
                  {id}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-3">
            Applied to APIs
          </h3>
          {users.apis.length === 0 ? (
            <p className="text-sm text-slate-500">—</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {users.apis.map((id) => (
                <Link
                  key={id}
                  href={apiPath(repoId, id)}
                  className="font-mono text-xs rounded bg-sky-50 text-sky-800 px-1.5 py-0.5 no-underline hover:no-underline hover:bg-sky-100"
                >
                  {id}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {mw.notes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Notes</h2>
          <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {mw.notes.map((n, i) => (
              <li key={i} className="px-4 py-2.5 text-xs text-slate-700">
                {n}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
