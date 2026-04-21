import Link from "next/link";
import {
  apiPath,
  integrationPath,
  tablePath,
  topicPath,
  workerPath,
} from "@/lib/paths";

type Kind = "table" | "topic" | "integration" | "worker" | "api";

function hrefFor(repoId: string, kind: Kind, id: string) {
  switch (kind) {
    case "table":
      return tablePath(repoId, id);
    case "topic":
      return topicPath(repoId, id);
    case "integration":
      return integrationPath(repoId, id);
    case "worker":
      return workerPath(repoId, id);
    case "api":
      return apiPath(repoId, id);
  }
}

function RefList({
  repoId,
  kind,
  ids,
}: {
  repoId: string;
  kind: Kind;
  ids: string[];
}) {
  if (ids.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <Link
          key={id}
          href={hrefFor(repoId, kind, id)}
          className="font-mono text-xs rounded bg-sky-50 text-sky-800 px-1.5 py-0.5 no-underline hover:no-underline hover:bg-sky-100"
        >
          {id}
        </Link>
      ))}
    </div>
  );
}

export interface UsesPanelProps {
  repoId: string;
  uses: {
    tables?: string[];
    topics_produced?: string[];
    topics_consumed?: string[];
    integrations?: string[];
    workers_triggered?: string[];
  };
}

export function UsesPanel({ repoId, uses }: UsesPanelProps) {
  const allRows: { label: string; kind: Kind; ids: string[] }[] = [
    { label: "Tables", kind: "table", ids: uses.tables ?? [] },
    { label: "Topics produced", kind: "topic", ids: uses.topics_produced ?? [] },
    { label: "Topics consumed", kind: "topic", ids: uses.topics_consumed ?? [] },
    { label: "Integrations", kind: "integration", ids: uses.integrations ?? [] },
    { label: "Workers triggered", kind: "worker", ids: uses.workers_triggered ?? [] },
  ];
  const rows = allRows.filter((r) => r.ids.length > 0);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500">No cross-entity references.</p>
    );
  }

  return (
    <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[160px_1fr] gap-3 px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-slate-500 pt-0.5">
            {r.label}
          </dt>
          <dd>
            <RefList repoId={repoId} kind={r.kind} ids={r.ids} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
