import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepo, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CodeRef } from "@/components/CodeRef";
import {
  apiPath,
  integrationsIndexPath,
  repoPath,
  workerPath,
} from "@/lib/paths";
import { integrationUsers } from "@/lib/resolver";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  const out: { repo: string; integration: string }[] = [];
  for (const id of ids) {
    const r = await getRepo(id);
    if (!r) continue;
    for (const e of r.integrations) out.push({ repo: id, integration: e.id });
  }
  return out;
}

export default async function IntegrationDetail({
  params,
}: {
  params: { repo: string; integration: string };
}) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();
  const integ = repo.integrations.find((e) => e.id === params.integration);
  if (!integ) notFound();

  const repoId = repo.service.id;
  const ghRepo = repo.service.repo;
  const declared = integ.used_by ?? {};
  const derived = integrationUsers(repo, integ.id);
  const apis = Array.from(
    new Set([...(declared.apis ?? []), ...derived.apis]),
  );
  const workers = Array.from(
    new Set([...(declared.workers ?? []), ...derived.workers]),
  );

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: repoId, href: repoPath(repoId) },
          { label: "Integrations", href: integrationsIndexPath(repoId) },
          { label: integ.id },
        ]}
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{integ.id}</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
            {integ.kind}
          </span>
          {integ.provider && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {integ.provider}
            </span>
          )}
          {integ.directions.map((d) => (
            <span
              key={d}
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                d === "inbound"
                  ? "bg-sky-50 text-sky-800 border-sky-100"
                  : "bg-emerald-50 text-emerald-800 border-emerald-100"
              }`}
            >
              {d}
            </span>
          ))}
        </div>
        {integ.description && <p className="text-slate-700">{integ.description}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {integ.code_ref && <CodeRef value={integ.code_ref} repo={ghRepo} />}
          {integ.local_impl && (
            <CodeRef value={integ.local_impl} repo={ghRepo} />
          )}
        </div>
      </div>

      {integ.inbound && (
        <section className="rounded-lg border border-sky-200 bg-sky-50/40 p-4">
          <h2 className="text-sm font-semibold text-sky-900 mb-2 uppercase tracking-wide">
            Inbound
          </h2>
          {integ.inbound.webhook_endpoints.length > 0 && (
            <div className="mb-2">
              <div className="text-xs text-slate-600 mb-1">
                Webhook endpoints
              </div>
              <div className="flex flex-wrap gap-1">
                {integ.inbound.webhook_endpoints.map((id) => (
                  <Link
                    key={id}
                    href={apiPath(repoId, id)}
                    className="font-mono text-xs rounded bg-white text-sky-800 px-1.5 py-0.5 border border-sky-100 no-underline hover:no-underline hover:bg-sky-100"
                  >
                    {id}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <dl className="text-xs space-y-1">
            {integ.inbound.auth && (
              <div>
                <dt className="inline text-slate-500">auth: </dt>
                <dd className="inline font-mono">{integ.inbound.auth}</dd>
              </div>
            )}
            {integ.inbound.signature_header && (
              <div>
                <dt className="inline text-slate-500">signature header: </dt>
                <dd className="inline font-mono">
                  {integ.inbound.signature_header}
                </dd>
              </div>
            )}
            {integ.inbound.verification_env && (
              <div>
                <dt className="inline text-slate-500">verification env: </dt>
                <dd className="inline font-mono">
                  {integ.inbound.verification_env}
                </dd>
              </div>
            )}
            {integ.inbound.note && (
              <p className="text-slate-600 pt-1">{integ.inbound.note}</p>
            )}
          </dl>
        </section>
      )}



      {integ.outbound && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
          <h2 className="text-sm font-semibold text-emerald-900 mb-2 uppercase tracking-wide">
            Outbound
          </h2>
          {integ.outbound.operations.length > 0 && (
            <ul className="divide-y divide-emerald-100 text-sm">
              {integ.outbound.operations.map((op) => (
                <li key={op.id} className="py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{op.id}</span>
                    {op.method && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white border border-emerald-200 text-emerald-800">
                        {op.method}
                      </span>
                    )}
                    {op.url && (
                      <span className="font-mono text-xs text-slate-600 break-all">
                        {op.url}
                      </span>
                    )}
                    {op.code_ref && <CodeRef value={op.code_ref} repo={ghRepo} />}
                  </div>
                  {op.description && (
                    <p className="text-xs text-slate-500 mt-1">
                      {op.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <dl className="text-xs mt-2 space-y-1">
            {integ.outbound.auth && (
              <div>
                <dt className="inline text-slate-500">auth: </dt>
                <dd className="inline font-mono">{integ.outbound.auth}</dd>
              </div>
            )}
            {integ.outbound.auth_env && (
              <div>
                <dt className="inline text-slate-500">auth env: </dt>
                <dd className="inline font-mono">{integ.outbound.auth_env}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2 text-sm">
          <h3 className="text-xs uppercase tracking-wide text-slate-500">
            Connection
          </h3>
          {integ.bucket_pattern && (
            <div>
              bucket:{" "}
              <span className="font-mono text-xs">{integ.bucket_pattern}</span>
            </div>
          )}
          {integ.bucket_env && (
            <div>
              env: <span className="font-mono text-xs">{integ.bucket_env}</span>
            </div>
          )}
          {integ.auth && (
            <div>
              auth: <span className="font-mono text-xs">{integ.auth}</span>
            </div>
          )}
          {integ.invocation && (
            <div>
              invocation:{" "}
              <span className="font-mono text-xs">{integ.invocation}</span>
            </div>
          )}
          {integ.protocol && (
            <div>
              protocol:{" "}
              <span className="font-mono text-xs">{integ.protocol}</span>
            </div>
          )}
          {integ.method && (
            <div>
              method: <span className="font-mono text-xs">{integ.method}</span>
            </div>
          )}
          {integ.url && (
            <div>
              url: <span className="font-mono text-xs">{integ.url}</span>
            </div>
          )}
          {integ.binary_required.length > 0 && (
            <div>
              binaries:{" "}
              <span className="font-mono text-xs">
                {integ.binary_required.join(", ")}
              </span>
            </div>
          )}
          {integ.docker && (
            <div className="text-xs text-slate-500">{integ.docker}</div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-3">
            Used by
          </h3>
          {apis.length === 0 && workers.length === 0 ? (
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
      </section>

      {integ.paths.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Paths</h2>
          <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {integ.paths.map((p) => (
              <li key={p.path} className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs">{p.path}</span>
                  {p.direction && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {p.direction}
                    </span>
                  )}
                </div>
                {p.note && (
                  <p className="text-xs text-slate-500 mt-1">{p.note}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {integ.operations.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Operations</h2>
          <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {integ.operations.map((op) => (
              <li key={op.id} className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{op.id}</span>
                  {op.code_ref && <CodeRef value={op.code_ref} repo={ghRepo} />}
                </div>
                {op.description && (
                  <p className="text-xs text-slate-500 mt-1">
                    {op.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {integ.external_writers.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">External writers</h2>
          <pre className="rounded-lg border border-slate-200 bg-white p-4 text-xs font-mono overflow-x-auto">
            {JSON.stringify(integ.external_writers, null, 2)}
          </pre>
        </section>
      )}

      {integ.security && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Security</h2>
          <pre className="rounded-lg border border-slate-200 bg-white p-4 text-xs font-mono overflow-x-auto">
            {JSON.stringify(integ.security, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
