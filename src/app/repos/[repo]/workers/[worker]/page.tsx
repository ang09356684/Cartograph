import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepo, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CodeRef } from "@/components/CodeRef";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { StepsTimeline } from "@/components/StepsTimeline";
import { UsesPanel } from "@/components/UsesPanel";
import {
  repoPath,
  topicPath,
  workersIndexPath,
} from "@/lib/paths";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  const out: { repo: string; worker: string }[] = [];
  for (const id of ids) {
    const r = await getRepo(id);
    if (!r) continue;
    for (const w of r.workers) out.push({ repo: id, worker: w.id });
  }
  return out;
}

export default async function WorkerDetail({
  params,
}: {
  params: { repo: string; worker: string };
}) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();
  const worker = repo.workers.find((w) => w.id === params.worker);
  if (!worker) notFound();

  const repoId = repo.service.id;
  const ghRepo = repo.service.repo;
  const hasSubscribesTopic =
    worker.subscribes_topic &&
    repo.topics.some((t) => t.id === worker.subscribes_topic);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: repoId, href: repoPath(repoId) },
          { label: "Workers", href: workersIndexPath(repoId) },
          { label: worker.id },
        ]}
      />

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{worker.id}</h1>
        <p className="text-slate-700">{worker.description}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {worker.code_ref && <CodeRef value={worker.code_ref} repo={ghRepo} />}
          {worker.binary && (
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100">
              {worker.binary}
            </span>
          )}
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            Subscription
          </h3>
          <dl className="text-sm space-y-1">
            <div className="flex gap-2">
              <dt className="text-slate-500 w-28">topic</dt>
              <dd>
                {hasSubscribesTopic && worker.subscribes_topic ? (
                  <Link
                    href={topicPath(repoId, worker.subscribes_topic)}
                    className="font-mono text-xs rounded bg-sky-50 text-sky-800 px-1.5 py-0.5 no-underline hover:no-underline hover:bg-sky-100"
                  >
                    {worker.subscribes_topic}
                  </Link>
                ) : (
                  <span className="font-mono text-xs">
                    {worker.subscribes_topic ?? "—"}
                  </span>
                )}
              </dd>
            </div>
            {worker.subscription_pattern && (
              <div className="flex gap-2">
                <dt className="text-slate-500 w-28">pattern</dt>
                <dd className="font-mono text-xs">
                  {worker.subscription_pattern}
                </dd>
              </div>
            )}
            {worker.subscription_env && (
              <div className="flex gap-2">
                <dt className="text-slate-500 w-28">env</dt>
                <dd className="font-mono text-xs">{worker.subscription_env}</dd>
              </div>
            )}
            {worker.receive_settings &&
              Object.entries(worker.receive_settings).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-slate-500 w-28">{k}</dt>
                  <dd className="font-mono text-xs">{String(v)}</dd>
                </div>
              ))}
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            Idempotency & ack
          </h3>
          <dl className="text-sm space-y-2">
            {worker.idempotency && (
              <>
                {worker.idempotency.strategy && (
                  <div>
                    <dt className="text-slate-500 text-xs">strategy</dt>
                    <dd className="font-mono text-xs">
                      {worker.idempotency.strategy}
                    </dd>
                  </div>
                )}
                {worker.idempotency.rule && (
                  <div>
                    <dt className="text-slate-500 text-xs">rule</dt>
                    <dd className="text-xs text-slate-700">
                      {worker.idempotency.rule}
                    </dd>
                  </div>
                )}
              </>
            )}
            {worker.ack_semantics && (
              <>
                {worker.ack_semantics.ack_on.length > 0 && (
                  <div>
                    <dt className="text-slate-500 text-xs">ack on</dt>
                    <dd className="flex flex-wrap gap-1 mt-1">
                      {worker.ack_semantics.ack_on.map((a) => (
                        <span
                          key={a}
                          className="font-mono text-[11px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-800"
                        >
                          {a}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {worker.ack_semantics.nack_on.length > 0 && (
                  <div>
                    <dt className="text-slate-500 text-xs">nack on</dt>
                    <dd className="flex flex-wrap gap-1 mt-1">
                      {worker.ack_semantics.nack_on.map((a) => (
                        <span
                          key={a}
                          className="font-mono text-[11px] px-1 py-0.5 rounded bg-rose-50 text-rose-800"
                        >
                          {a}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </>
            )}
          </dl>
        </div>
      </section>

      {worker.processors.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Processors</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {worker.processors.map((p) => {
              const notImpl = p.status === "not_implemented";
              return (
                <li
                  key={p.id}
                  className={`rounded border p-3 ${
                    notImpl
                      ? "border-slate-200 bg-slate-50 text-slate-500"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p.id}</span>
                    {notImpl && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                        not implemented
                      </span>
                    )}
                  </div>
                  {p.conversion_type && (
                    <div className="text-xs font-mono mt-1">
                      {p.conversion_type}
                    </div>
                  )}
                  {p.code_ref && (
                    <div className="mt-1">
                      <CodeRef value={p.code_ref} repo={ghRepo} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Steps</h2>
        <StepsTimeline steps={worker.steps} repoId={repoId} repo={ghRepo} />
      </section>

      {worker.failure_handling && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Failure handling</h2>
          <pre className="rounded-lg border border-slate-200 bg-white p-4 text-xs font-mono overflow-x-auto">
            {JSON.stringify(worker.failure_handling, null, 2)}
          </pre>
        </section>
      )}

      {worker.sequence_mermaid && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Sequence diagram</h2>
          <MermaidDiagram source={worker.sequence_mermaid} />
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Uses</h2>
        <UsesPanel repoId={repoId} uses={worker.uses} />
      </section>
    </div>
  );
}
