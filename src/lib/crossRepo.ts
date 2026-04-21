import type { Repo } from "@/types/manifest";
import { apiPath } from "@/lib/paths";

/**
 * Cross-repo API 直連 — declare-at-A、resolve-at-render（2026-04 pilot）。
 *
 * 當 repo A 的 API step 在 code 層呼叫另一個 repo B 的某支 API 時，在 A 的 step
 * 上寫：
 *
 *   steps:
 *     - target: integration:<B-adapter>
 *       target_api_ref: "<B-repo-id>:<B-api-id>"
 *
 * 這個欄位是**單純字串**；A 在寫的當下 B 的 manifest 不需要存在。
 * Aggregator 在 render A 的 api detail 頁時才解析：
 *   - 若 `data/<B-repo-id>/apis/<B-api-id>.yaml` 已被 index → render clickable Link
 *   - 若尚未 index → render disabled badge（title 提示 target 文件待產）
 *   - 當 B 的 manifest 加進來，下次 rebuild 自動變成可點 — A 端不用改任何東西
 *
 * **Why forward-only（不做 back-link）**：被呼叫方要列「誰呼叫我」的清單，真相分散
 * 在每個 caller repo，個別 repo 維護下 staleness / completeness 無法保證。Forward
 * pointer 則純粹由 caller 宣告 — 單一來源、自己可控。
 */

export interface ApiRefResolution {
  targetRepoId: string;
  targetApiId: string;
  /** 目標 repo 與 API 都 index 到時為 true；此時 `href` 可點 */
  exists: boolean;
  /** 指向 `/repos/<repo>/apis/<api>` 的完整路徑；exists=false 時也會產生但不可點 */
  href: string;
}

/**
 * 解析 `<repo-id>:<api-id>` composite ref；回傳 render 需要的資訊。
 * 格式不合（沒有 `:` 或空段）時回 null，render 端做 fallback。
 */
export function resolveApiRef(
  allRepos: Repo[],
  ref: string,
): ApiRefResolution | null {
  const idx = ref.indexOf(":");
  if (idx <= 0 || idx === ref.length - 1) return null;
  const targetRepoId = ref.slice(0, idx);
  const targetApiId = ref.slice(idx + 1);
  const targetRepo = allRepos.find((r) => r.service.id === targetRepoId);
  const exists = !!targetRepo?.apis.some((a) => a.id === targetApiId);
  return {
    targetRepoId,
    targetApiId,
    exists,
    href: apiPath(targetRepoId, targetApiId),
  };
}
