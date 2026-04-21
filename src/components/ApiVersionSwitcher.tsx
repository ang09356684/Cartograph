"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  versions: { label: string; value: string }[];
  current: string;
  latest: string;
}

/**
 * API 詳細頁的版本切換下拉。
 * - 切到「最新版」→ 從 URL 移除 `?version=`
 * - 切到其他版本 → 設 `?version=v<n>`
 */
export function ApiVersionSwitcher({ versions, current, latest }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (versions.length <= 1) return null;

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === latest) sp.delete("version");
    else sp.set("version", next);
    const qs = sp.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span className="font-semibold">Version</span>
      <select
        className="border border-slate-300 rounded px-2 py-0.5 font-mono text-xs bg-white"
        value={current}
        onChange={onChange}
        disabled={isPending}
      >
        {versions.map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </select>
    </label>
  );
}
