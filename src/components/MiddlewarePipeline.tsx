import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CodeRef } from "./CodeRef";
import { middlewarePath } from "@/lib/paths";

export interface MiddlewareItem {
  id: string;
  code_ref?: string;
  config_env?: string;
  note?: string;
}

export function MiddlewarePipeline({
  pipelineId,
  items,
  repo,
  repoId,
  resolvableIds,
}: {
  pipelineId?: string;
  items: MiddlewareItem[];
  repo?: string;
  /** repo id 用於組 middleware detail URL；若未提供則不渲染連結 */
  repoId?: string;
  /** 存在於 manifest/middlewares/*.yaml 的 id 集合；chip 才會變可點 */
  resolvableIds?: Set<string>;
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-slate-500">(no middlewares declared)</div>
    );
  }
  return (
    <div>
      {pipelineId && (
        <div className="text-xs text-slate-500 mb-2">
          pipeline: <span className="font-mono">{pipelineId}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {items.map((m, i) => {
          const canLink = Boolean(
            repoId && resolvableIds && resolvableIds.has(m.id),
          );
          const chipInner = (
            <>
              <div className="font-medium text-slate-900 text-sm">{m.id}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {m.code_ref && <CodeRef value={m.code_ref} repo={repo} />}
                {m.config_env && (
                  <span className="font-mono text-[11px] px-1 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-100">
                    {m.config_env}
                  </span>
                )}
              </div>
            </>
          );
          return (
            <div key={m.id} className="flex items-center gap-2">
              {canLink ? (
                <Link
                  href={middlewarePath(repoId!, m.id)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm hover:border-sky-300 hover:bg-sky-50 no-underline hover:no-underline"
                  title={m.note ?? "Open middleware details"}
                >
                  {chipInner}
                </Link>
              ) : (
                <div
                  className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-2 shadow-sm"
                  title={
                    m.note ??
                    "No middlewares/<id>.yaml for this middleware; showing inline fields only."
                  }
                >
                  {chipInner}
                </div>
              )}
              {i < items.length - 1 && (
                <ChevronRight className="size-4 text-slate-400" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
