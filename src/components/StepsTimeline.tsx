import Link from "next/link";
import { CodeRef } from "./CodeRef";
import type { ApiRefResolution } from "@/lib/crossRepo";
import {
  integrationPath,
  tablePath,
  topicPath,
} from "@/lib/paths";

export interface StepItem {
  order: number;
  action: string;
  target?: string;
  code_ref?: string;
  rule?: string;
  schema?: string;
  note?: string;
  status?: string | number;
  to?: string;
  path?: string;
  optional?: boolean;
  target_api_ref?: string;
}

function renderCrossRepoLink(ref: string, resolution: ApiRefResolution | null) {
  // 格式有問題（沒有 `:`）→ 原字串展示
  if (!resolution) {
    return (
      <span className="font-mono text-xs text-slate-500" title={`invalid target_api_ref: ${ref}`}>
        → {ref}
      </span>
    );
  }
  const label = `${resolution.targetRepoId}:${resolution.targetApiId}`;
  if (resolution.exists) {
    return (
      <Link
        href={resolution.href}
        className="font-mono text-xs rounded bg-indigo-50 text-indigo-800 px-1.5 py-0.5 no-underline hover:no-underline hover:bg-indigo-100"
        title={`Cross-repo call → ${resolution.href}`}
      >
        → {label}
      </Link>
    );
  }
  // 目標 repo 或 API 尚未被 aggregator index —— disabled badge，等 B 加入後自動活化
  return (
    <span
      className="font-mono text-xs rounded bg-slate-100 text-slate-400 px-1.5 py-0.5 border border-dashed border-slate-300 cursor-not-allowed"
      title={`Target not yet documented: ${label}（待 ${resolution.targetRepoId} repo 的 manifest 加入 aggregator）`}
    >
      → {label} <span className="text-[9px] uppercase">pending</span>
    </span>
  );
}

function renderTarget(target: string, repoId: string) {
  const [kind, id] = target.split(":");
  if (!id) return <span className="font-mono text-xs">{target}</span>;
  let href: string | null = null;
  if (kind === "table") href = tablePath(repoId, id);
  else if (kind === "topic") href = topicPath(repoId, id);
  else if (kind === "integration") href = integrationPath(repoId, id);
  if (!href) return <span className="font-mono text-xs">{target}</span>;
  return (
    <Link
      href={href}
      className="font-mono text-xs rounded bg-sky-50 text-sky-800 px-1.5 py-0.5 no-underline hover:no-underline hover:bg-sky-100"
    >
      {kind}:{id}
    </Link>
  );
}

export function StepsTimeline({
  steps,
  repoId,
  repo,
  resolveTargetApi,
}: {
  steps: StepItem[];
  repoId: string;
  repo?: string;
  /** 由 caller page 提供；通常是 (ref) => resolveApiRef(allRepos, ref)，非必填 */
  resolveTargetApi?: (ref: string) => ApiRefResolution | null;
}) {
  if (steps.length === 0) {
    return <p className="text-sm text-slate-500">(no steps)</p>;
  }
  return (
    <ol className="relative border-l-2 border-slate-200 pl-5 space-y-4">
      {steps.map((s) => (
        <li key={s.order} className="relative">
          <div className="absolute -left-[27px] flex items-center justify-center size-6 rounded-full bg-white border-2 border-slate-300 text-xs font-semibold text-slate-600">
            {s.order}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900 text-sm">
              {s.action}
            </span>
            {s.optional && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                optional
              </span>
            )}
            {s.to && (
              <span className="text-xs text-slate-500">
                → <span className="font-mono">{s.to}</span>
              </span>
            )}
            {s.status !== undefined && (
              <span className="text-xs text-slate-500">
                status: <span className="font-mono">{String(s.status)}</span>
              </span>
            )}
            {s.target && renderTarget(s.target, repoId)}
            {s.target_api_ref &&
              renderCrossRepoLink(
                s.target_api_ref,
                resolveTargetApi ? resolveTargetApi(s.target_api_ref) : null,
              )}
            {s.schema && (
              <span className="font-mono text-xs text-slate-500">
                schema: {s.schema}
              </span>
            )}
            {s.code_ref && <CodeRef value={s.code_ref} repo={repo} />}
          </div>
          {s.rule && (
            <p className="text-xs text-slate-600 mt-1">rule: {s.rule}</p>
          )}
          {s.path && (
            <p className="text-xs text-slate-500 mt-1 font-mono">
              path: {s.path}
            </p>
          )}
          {s.note && <p className="text-xs text-slate-500 mt-1">{s.note}</p>}
        </li>
      ))}
    </ol>
  );
}
