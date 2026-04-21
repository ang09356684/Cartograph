"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import mermaid from "mermaid";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

let initialized = false;

function ensureInit() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    securityLevel: "strict",
  });
  initialized = true;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const STEP = 0.15;

function clamp(n: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, n));
}

function ZoomControls({
  scale,
  setScale,
  onExpand,
  onClose,
}: {
  scale: number;
  setScale: (n: number) => void;
  onExpand?: () => void;
  onClose?: () => void;
}) {
  const btn =
    "inline-flex items-center justify-center rounded border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm disabled:opacity-40";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={btn}
        onClick={() => setScale(clamp(scale - STEP))}
        disabled={scale <= MIN_SCALE + 0.001}
        aria-label="縮小"
      >
        <Minus size={14} />
      </button>
      <span className="inline-flex min-w-[3rem] justify-center rounded border border-slate-200 bg-white/90 px-2 py-1 text-xs font-mono text-slate-700 shadow-sm">
        {Math.round(scale * 100)}%
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => setScale(clamp(scale + STEP))}
        disabled={scale >= MAX_SCALE - 0.001}
        aria-label="放大"
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => setScale(1)}
        aria-label="重設為 100%"
        title="重設"
      >
        <RotateCcw size={14} />
      </button>
      {onExpand && (
        <button
          type="button"
          className={btn + " gap-1"}
          onClick={onExpand}
          aria-label="全螢幕"
        >
          <Maximize2 size={14} />
          全螢幕
        </button>
      )}
      {onClose && (
        <button
          type="button"
          className={btn + " gap-1"}
          onClick={onClose}
          aria-label="關閉"
        >
          <X size={14} />
          關閉 (Esc)
        </button>
      )}
    </div>
  );
}

/**
 * 可縮放的 SVG 容器：
 * - 用 transform: scale 做視覺縮放
 * - 用 measured natural size × scale 撐開外層 div 的寬高，讓父容器的 overflow 能正確滾動
 */
function ZoomableSvg({
  svg,
  scale,
  minWidth,
}: {
  svg: string;
  scale: number;
  minWidth?: string;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    null,
  );

  // 當 svg 字串變了才重新量測；scale 變化不應該觸發量測
  useEffect(() => {
    if (!innerRef.current) return;
    const svgEl = innerRef.current.querySelector("svg");
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    setNatural({ w: rect.width, h: rect.height });
  }, [svg]);

  const scaledW = natural ? natural.w * scale : undefined;
  const scaledH = natural ? natural.h * scale : undefined;

  return (
    <div
      style={{
        width: scaledW,
        height: scaledH,
        minWidth,
      }}
    >
      <div
        ref={innerRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

export function MermaidDiagram({ source }: { source: string }) {
  const id = useId().replace(/:/g, "_");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [inlineScale, setInlineScale] = useState(1);
  const [modalScale, setModalScale] = useState(1);

  useEffect(() => {
    ensureInit();
    let cancelled = false;
    mermaid
      .render(`m_${id}`, source)
      .then(({ svg: out }) => {
        // 移除 mermaid 塞的 inline max-width 讓自然尺寸量得到
        const cleaned = out.replace(/(<svg[^>]*)\sstyle="[^"]*"/, "$1");
        if (!cancelled) setSvg(cleaned);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  // Esc 關閉 modal
  const closeModal = useCallback(() => setZoomed(false), []);
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed, closeModal]);

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 text-red-700 text-xs p-3 font-mono whitespace-pre-wrap">
        Mermaid error: {error}
        {"\n\n"}
        {source}
      </div>
    );
  }

  return (
    <>
      <div className="relative rounded border border-slate-200 bg-white p-4 overflow-auto">
        {svg && (
          <div className="absolute top-2 right-2 z-10">
            <ZoomControls
              scale={inlineScale}
              setScale={setInlineScale}
              onExpand={() => {
                setModalScale(1);
                setZoomed(true);
              }}
            />
          </div>
        )}

        {svg ? (
          <ZoomableSvg svg={svg} scale={inlineScale} />
        ) : (
          <div className="text-xs text-slate-400">Rendering diagram…</div>
        )}
      </div>

      {zoomed && svg && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="relative bg-white rounded-lg shadow-2xl w-[95vw] h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
              <span className="text-sm font-semibold text-slate-700">
                Sequence diagram
              </span>
              <ZoomControls
                scale={modalScale}
                setScale={setModalScale}
                onClose={closeModal}
              />
            </div>
            <div className="flex-1 overflow-auto p-6">
              <ZoomableSvg svg={svg} scale={modalScale} minWidth="1600px" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
