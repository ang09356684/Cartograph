"use client";

import { ReactNode, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  title: string;
  count: number;
  defaultOpen?: boolean;
  id?: string;             // 作為 <section> 的 anchor id，給 sidebar 點 group 時可 scroll-to
  children: ReactNode;
}

/**
 * 可收折的 section，給 list page（APIs / tables）的 group heading 用。
 * 預設展開；點標題列整個 toggle。
 */
export function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  id,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={id} className="scroll-mt-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1 mb-2 text-left hover:bg-slate-100 rounded px-1 py-0.5 -mx-1"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="size-3.5 text-slate-400" />
        )}
        <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
          {title}{" "}
          <span className="text-slate-400 font-normal">({count})</span>
        </h2>
      </button>
      {open && children}
    </section>
  );
}
