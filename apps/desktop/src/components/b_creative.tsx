import { ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/** Chọn nhiều giá trị dạng dropdown nhỏ (dùng cho trục ma trận). */
export function MultiPick({ value, options, onChange, placeholder, allLabel, min = 1 }: {
  value: string[];
  options: Array<{ value: string; label: string; hint?: ReactNode; disabled?: boolean }>;
  onChange: (v: string[]) => void;
  placeholder?: string;
  allLabel?: string;
  min?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const labels = options.filter((o) => value.includes(o.value)).map((o) => o.label);
  const text = !labels.length ? placeholder || "Chưa chọn" : labels.length === options.length && allLabel ? allLabel : labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1}`;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="select row" style={{ textAlign: "left", cursor: "pointer", backgroundImage: "none", justifyContent: "space-between" }} onClick={() => setOpen(!open)}>
        <span className="ellipsis">{text}</span>
        <ChevronDown size={14} className="muted" />
      </button>
      {open && (
        <div className="card" style={{ position: "absolute", zIndex: 20, top: 42, left: 0, minWidth: "100%", width: "max-content", maxWidth: 320, padding: 8, boxShadow: "var(--shadow)", background: "#111936" }}>
          {options.map((o) => {
            const on = value.includes(o.value);
            return (
              <label key={o.value} className="row small" style={{ padding: "6px 6px", borderRadius: 7, cursor: o.disabled ? "not-allowed" : "pointer", opacity: o.disabled ? 0.5 : 1 }}>
                <input type="checkbox" className="check" checked={on} disabled={o.disabled || (on && value.length <= min)}
                  onChange={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])} />
                <span className="grow">{o.label}</span>
                {o.hint && <span className="xs muted">{o.hint}</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Pager đơn giản 1 2 3 … n */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const list: Array<number | "…"> = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) list.push(i);
    else if (list[list.length - 1] !== "…") list.push("…");
  }
  return (
    <div className="row" style={{ gap: 6 }}>
      <button className="btn xs" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
      {list.map((p, i) => p === "…" ? <span key={`e${i}`} className="muted">…</span> : (
        <button key={p} className={`btn xs ${p === page ? "primary" : ""}`} style={{ minWidth: 26 }} onClick={() => onPage(p)}>{p}</button>
      ))}
      <button className="btn xs" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
    </div>
  );
}

export const BEAT_META: Record<string, { label: string; tone: "purple" | "cyan" | "teal" | "orange"; color: string }> = {
  hook: { label: "HOOK", tone: "purple", color: "#a074ff" },
  body: { label: "BODY", tone: "cyan", color: "#4fc3ff" },
  cta: { label: "CTA", tone: "teal", color: "#19d3b5" },
};

export const MOTION_LABEL: Record<string, string> = {
  zoom_in: "Zoom vào (Push in)",
  zoom_out: "Zoom ra (Pull out)",
  pan_left: "Lia trái (Pan left)",
  pan_right: "Lia phải (Pan right)",
  none: "Tĩnh (không chuyển động)",
};

export const sec = (s?: number | null) => (s === undefined || s === null ? "—" : `${(Math.round(s * 10) / 10).toString().replace(".", ",")}s`);
