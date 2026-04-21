import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepo, listRepoIds } from "@/lib/loader";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CodeRef } from "@/components/CodeRef";
import {
  apiPath,
  repoPath,
  topicsIndexPath,
  workerPath,
} from "@/lib/paths";
import { topicConsumers, topicProducers } from "@/lib/resolver";

export async function generateStaticParams() {
  const ids = await listRepoIds();
  const out: { repo: string; topic: string }[] = [];
  for (const id of ids) {
    const r = await getRepo(id);
    if (!r) continue;
    for (const t of r.topics) out.push({ repo: id, topic: t.id });
  }
  return out;
}

export default async function TopicDetail({
  params,
}: {
  params: { repo: string; topic: string };
}) {
  const repo = await getRepo(params.repo);
  if (!repo) notFound();
  const topic = repo.topics.find((t) => t.id === params.topic);
  if (!topic) notFound();

  const repoId = repo.service.id;
  const ghRepo = repo.service.repo;
  const producers = topicProducers(repo, topic.id);
  const consumers = topicConsumers(repo, topic.id);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Repos", href: "/" },
          { label: repoId, href: repoPath(repoId) },
          { label: "Topics", href: topicsIndexPath(repoId) },
          { label: topic.id },
        ]}
      />

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{topic.id}</h1>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
            {topic.provider}
          </span>
          {topic.delivery_guarantee && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-100">
              {topic.delivery_guarantee}
            </span>
          )}
          {topic.gcp_project_pattern && (
            <span className="font-mono text-xs text-slate-500">
              {topic.gcp_project_pattern}
            </span>
          )}
        </div>
        {topic.description && <p className="text-slate-700">{topic.description}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {topic.schema_ref && <CodeRef value={topic.schema_ref} repo={ghRepo} />}
          {topic.publisher_code_ref && (
            <CodeRef value={topic.publisher_code_ref} repo={ghRepo} />
          )}
          {topic.consumer_code_ref && (
            <CodeRef value={topic.consumer_code_ref} repo={ghRepo} />
          )}
        </div>
      </div>

      {topic.message_schema && topic.message_schema.fields.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Message schema</h2>
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">Field</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Required</th>
                  <th className="text-left px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topic.message_schema.fields.map((f) => (
                  <tr key={f.name}>
                    <td className="px-3 py-2 font-mono text-xs">{f.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">
                      {f.type}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {f.required ? "YES" : f.nullable ? "nullable" : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700">
                      {f.description}
                      {f.enum && (
                        <div className="mt-1 flex flex-wrap gap-1">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {topic.attributes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Attributes</h2>
          <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {topic.attributes.map((a) => (
              <li key={a.name} className="px-4 py-2">
                <span className="font-mono text-xs">{a.name}</span>
                {a.type && (
                  <span className="font-mono text-xs text-slate-500 ml-2">
                    ({a.type})
                  </span>
                )}
                {a.description && (
                  <span className="text-slate-600 ml-2">— {a.description}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PubSubPanel
          title="Producers (this repo)"
          apis={producers.apis}
          workers={producers.workers}
          repoId={repoId}
        />
        <PubSubPanel
          title="Consumers (this repo)"
          apis={consumers.apis}
          workers={consumers.workers}
          repoId={repoId}
        />
      </section>

      {topic.known_external_consumers.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            Known external consumers
          </h2>
          <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
            {topic.known_external_consumers.map((e) => (
              <li key={e.repo} className="px-4 py-2">
                <span className="font-mono text-xs">{e.repo}</span>
                {e.note && (
                  <span className="text-slate-500 ml-2 text-xs">{e.note}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400 mt-2">
            These links will be auto-filled once other repos' manifests are
            added.
          </p>
        </section>
      )}

      {topic.retry_policy && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Retry policy</h2>
          <dl className="rounded-lg border border-slate-200 bg-white p-4 text-sm space-y-1">
            {Object.entries(topic.retry_policy).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-slate-500 w-40 text-xs">{k}</dt>
                <dd className="font-mono text-xs">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

function PubSubPanel({
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
