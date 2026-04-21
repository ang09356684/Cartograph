import { notFound } from "next/navigation";
import { getRepo, listRepoIds, loadRepos } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CodeRef } from "@/components/CodeRef";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { MiddlewarePipeline } from "@/components/MiddlewarePipeline";
import { StepsTimeline } from "@/components/StepsTimeline";
import { UsesPanel } from "@/components/UsesPanel";
import { apisIndexPath, repoPath } from "@/lib/paths";
import { resolveApiRef } from "@/lib/crossRepo";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  const out: { repo: string; api: string }[] = [];
  for (const id of ids) {
    const r = await getRepo(id);
    if (!r) continue;
    for (const a of r.apis) out.push({ repo: id, api: a.id });
  }
  return out;
}

const methodColor: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-800 border-emerald-200",
  POST: "bg-sky-100 text-sky-800 border-sky-200",
  PUT: "bg-amber-100 text-amber-800 border-amber-200",
  PATCH: "bg-amber-100 text-amber-800 border-amber-200",
  DELETE: "bg-rose-100 text-rose-800 border-rose-200",
};

export default async function ApiDetail({
  params,
}: {
  params: { repo: string; api: string };
}) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();
  const api = repo.apis.find((a) => a.id === params.api);
  if (!api) notFound();

  const repoId = repo.service.id;
  const ghRepo = repo.service.repo;

  // Load all repos so that target_api_ref on steps can resolve to real cross-repo API links
  // 當目標尚未被 aggregator index 時，resolveApiRef 會回報 exists=false，渲染成 disabled badge
  const allRepos = await loadRepos();
  const resolveTargetApi = (ref: string) => resolveApiRef(allRepos, ref);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: repoId, href: repoPath(repoId) },
          { label: "APIs", href: apisIndexPath(repoId) },
          { label: api.id },
        ]}
      />

      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded border ${
              methodColor[api.method] ?? "bg-slate-100 text-slate-800"
            }`}
          >
            {api.method}
          </span>
          <code className="font-mono text-slate-900">{api.path}</code>
          <span className="text-xs text-slate-500">auth: {api.auth}</span>
        </div>
        <h1 className="text-2xl font-semibold">{api.id}</h1>
        <p className="text-slate-700">{api.description}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <CodeRef value={api.code_ref} repo={ghRepo} />
          {api.openapi_ref && (
            <CodeRef value={api.openapi_ref} repo={ghRepo} />
          )}
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Middleware pipeline</h2>
        <MiddlewarePipeline
          pipelineId={api.middleware_pipeline}
          items={api.middlewares}
          repo={ghRepo}
          repoId={repoId}
          resolvableIds={new Set(repo.middlewares.map((m) => m.id))}
        />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Request</h2>
          {api.request?.content_type && (
            <p className="text-xs text-slate-500 mb-2">
              content-type:{" "}
              <span className="font-mono">{api.request.content_type}</span>
            </p>
          )}
          {api.request?.schema_ref && (
            <p className="mb-3">
              <CodeRef value={api.request.schema_ref} repo={ghRepo} />
            </p>
          )}
          {api.request?.path_params && api.request.path_params.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-slate-600 mb-1">
                Path params
              </div>
              <ul className="text-xs space-y-0.5">
                {api.request.path_params.map((p) => (
                  <li key={p.name} className="font-mono">
                    {p.name}: {p.type}
                    {p.required ? " (required)" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {api.request?.headers_optional &&
            api.request.headers_optional.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-slate-600 mb-1">
                  Optional headers
                </div>
                <ul className="text-xs space-y-0.5">
                  {api.request.headers_optional.map((h) => (
                    <li key={h.name} className="font-mono">
                      {h.name}
                      {h.max_length !== undefined && (
                        <span className="text-slate-500">
                          {" "}
                          (max {h.max_length})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          {api.request?.fields && api.request.fields.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1">
                Body fields
              </div>
              <ul className="text-xs space-y-1.5">
                {api.request.fields.map((f) => (
                  <li key={f.name}>
                    <span className="font-mono text-slate-900">{f.name}</span>
                    <span className="text-slate-500">: {f.type}</span>
                    {f.required && (
                      <span className="text-rose-600 ml-1">*</span>
                    )}
                    {f.validation && (
                      <span className="text-slate-500">
                        {" "}
                        — {f.validation}
                      </span>
                    )}
                    {f.enum && (
                      <div className="flex flex-wrap gap-1 ml-2 mt-0.5">
                        {f.enum.map((v) => (
                          <span
                            key={v}
                            className="font-mono text-[11px] px-1 py-0.5 rounded bg-slate-100"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!api.request?.fields?.length &&
            !api.request?.path_params?.length &&
            !api.request?.headers_optional?.length &&
            !api.request?.schema_ref &&
            !api.request?.content_type && (
              <p className="text-sm text-slate-500">No request body.</p>
            )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Responses
          </h2>
          <ul className="space-y-2 text-sm">
            {api.response.map((r, idx) => (
              <li key={`${r.status}-${idx}`} className="flex items-start gap-2">
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
                <div className="text-xs">
                  {r.error_code && (
                    <span className="font-mono">{r.error_code}</span>
                  )}
                  {r.schema_ref && <CodeRef value={r.schema_ref} repo={ghRepo} />}
                  {r.body && (
                    <span className="text-slate-500">body: {r.body}</span>
                  )}
                  {r.note && (
                    <p className="text-slate-500 mt-0.5">{r.note}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Steps</h2>
        <StepsTimeline
          steps={api.steps}
          repoId={repoId}
          repo={ghRepo}
          resolveTargetApi={resolveTargetApi}
        />
      </section>

      {api.sequence_mermaid && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Sequence diagram</h2>
          <MermaidDiagram source={api.sequence_mermaid} />
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Uses</h2>
        <UsesPanel repoId={repoId} uses={api.uses} />
      </section>
    </div>
  );
}
