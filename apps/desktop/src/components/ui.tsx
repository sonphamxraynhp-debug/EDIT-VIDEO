import { ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Check, Film, Info, Loader2, Play, X } from "lucide-react";
import { ApiError, fileUrl } from "../lib/api";
import { JOB_STATUS, Tone, VARIANT_STATUS } from "../lib/format";

export function PageHead(props: { title: string; sub?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      {props.icon && <div className="ph-icon">{props.icon}</div>}
      <div>
        <h1 className="page-title">{props.title}</h1>
        {props.sub && <div className="page-sub">{props.sub}</div>}
      </div>
      {props.actions && <div className="page-actions">{props.actions}</div>}
    </div>
  );
}

export function Card(props: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children?: ReactNode; className?: string; style?: React.CSSProperties; icon?: ReactNode }) {
  return (
    <div className={`card ${props.className || ""}`} style={props.style}>
      {(props.title || props.right) && (
        <div className="card-head">
          <div>
            <div className="card-title">
              {props.icon}
              {props.title}
            </div>
            {props.sub && <div className="card-sub">{props.sub}</div>}
          </div>
          {props.right && <div className="spacer row">{props.right}</div>}
        </div>
      )}
      {props.children}
    </div>
  );
}

export function Kpi(props: { icon: ReactNode; value: ReactNode; label: ReactNode; tone?: "" | "teal" | "cyan" | "orange" | "red"; extra?: ReactNode }) {
  return (
    <div className={`kpi ${props.tone || ""}`}>
      <div className="kpi-icon">{props.icon}</div>
      <div className="grow">
        <div className="kpi-val">{props.value}</div>
        <div className="kpi-label">{props.label}</div>
        {props.extra}
      </div>
    </div>
  );
}

export function Badge({ tone = "gray", children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={`badge b-${tone}`}>
      {icon}
      {children}
    </span>
  );
}

export function VariantStatus({ status }: { status: string }) {
  const s = VARIANT_STATUS[status] || { label: status, tone: "gray" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function JobStatus({ status }: { status: string }) {
  const s = JOB_STATUS[status] || { label: status, tone: "gray" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Bar({ value, tone, thin, style }: { value: number; tone?: string; thin?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={`bar ${tone || ""} ${thin ? "thin" : ""}`} style={style} role="progressbar" aria-valuenow={Math.round(value)}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Nút có trạng thái loading/success/error/disabled (mục 4 SRS). */
export function Btn(props: {
  children?: ReactNode;
  onClick?: () => unknown | Promise<unknown>;
  kind?: "primary" | "teal" | "orange" | "danger" | "ghost" | "";
  size?: "sm" | "lg" | "xs" | "";
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  className?: string;
  type?: "button" | "submit";
}) {
  const [state, setState] = useState<"idle" | "loading" | "ok">("idle");
  const loading = props.loading || state === "loading";
  async function click() {
    if (!props.onClick) return;
    const r = props.onClick();
    if (r && typeof (r as Promise<unknown>).then === "function") {
      setState("loading");
      try {
        const v = await r;
        setState(v === undefined ? "idle" : "ok");
        if (v !== undefined) setTimeout(() => setState("idle"), 1200);
      } catch {
        setState("idle");
      }
    }
  }
  return (
    <button
      type={props.type || "button"}
      title={props.title}
      className={`btn ${props.kind || ""} ${props.size || ""} ${state === "ok" ? "success-flash" : ""} ${props.className || ""}`}
      disabled={props.disabled || loading}
      onClick={click}
    >
      {loading ? <Loader2 size={15} className="spin" /> : state === "ok" ? <Check size={15} /> : props.icon}
      {props.children}
    </button>
  );
}

export function Toggle({ on, onChange, purple, disabled }: { on: boolean; onChange?: (v: boolean) => void; purple?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={`toggle ${on ? "on" : ""} ${purple ? "purple" : ""}`}
      onClick={() => onChange?.(!on)}
    />
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="xs muted">{hint}</span>}
    </label>
  );
}

export function Select({ value, onChange, options, disabled, style }: {
  value: string | number | undefined;
  onChange: (v: string) => void;
  options: Array<{ value: string | number; label: string } | string>;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <select className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={style}>
      {options.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  );
}

export function Tabs({ tabs, value, onChange, pill }: { tabs: Array<{ id: string; label: ReactNode }>; value: string; onChange: (v: string) => void; pill?: boolean }) {
  return (
    <div className={pill ? "pill-tabs" : "tabs"}>
      {tabs.map((t) => (
        <button key={t.id} className={`${pill ? "pill-tab" : "tab"} ${value === t.id ? "on" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Seg({ value, options, onChange }: { value: string | number; options: Array<{ value: string | number; label: ReactNode }>; onChange: (v: any) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.value)} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="semi t2">{title}</div>
      {children && <div className="small mt8">{children}</div>}
      {action}
    </div>
  );
}

/** Lỗi luôn có mã, nguyên nhân, cách khắc phục và nút xem log (mục 4.1 SRS). */
export function ErrorBox({ error, onRetry }: { error: ApiError | null | undefined; onRetry?: () => void }) {
  const nav = useNavigate();
  if (!error) return null;
  const b = error.body;
  return (
    <div className="err-box">
      <div className="row">
        <AlertTriangle size={16} className="c-red" />
        <b>{b.message}</b>
        <span className="mono muted">[{b.code}]</span>
      </div>
      {b.hint && <div className="small t2 mt8">Cách khắc phục: {b.hint}</div>}
      <div className="row mt8">
        {onRetry && (
          <button className="btn sm" onClick={onRetry}>
            Thử lại
          </button>
        )}
        <button className="btn sm ghost" onClick={() => nav("/settings?tab=logs")}>
          Xem log
        </button>
        {b.trace_id && <span className="xs muted">trace {b.trace_id}</span>}
      </div>
    </div>
  );
}

export function Loading({ rows = 3, h = 16 }: { rows?: number; h?: number }) {
  return (
    <div className="col">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: h, width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** Bao quanh nội dung phụ thuộc dữ liệu: loading / error / empty. */
export function Async<T>({ q, empty, children }: { q: { data?: T; error: ApiError | null; loading: boolean; reload: () => void }; empty?: (d: T) => ReactNode | false; children: (d: T) => ReactNode }) {
  if (q.loading && q.data === undefined) return <Loading />;
  if (q.error && q.data === undefined) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (q.data === undefined) return null;
  const e = empty?.(q.data);
  if (e) return <>{e}</>;
  return <>{children(q.data)}</>;
}

export function Modal({ open, onClose, title, children, footer, width }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" style={width ? { width: `min(${width}px, 94vw)` } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="row between mb12">
          <div className="card-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={16} />
          </button>
        </div>
        {children}
        {footer && <div className="row mt16" style={{ justifyContent: "flex-end" }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Thumb({ src, ratio = "9/16", label, duration, play, children, style, onClick }: { src?: string | null; ratio?: string; label?: ReactNode; duration?: ReactNode; play?: boolean; children?: ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  const url = src ? (src.startsWith("/api") || src.startsWith("http") || src.startsWith("data:") ? src : fileUrl(src)) : undefined;
  return (
    <div className={`media ${url ? "" : "ph-media"}`} style={{ aspectRatio: ratio, cursor: onClick ? "pointer" : undefined, ...style }} onClick={onClick}>
      {url ? <img src={url} alt="" loading="lazy" /> : <Film size={22} />}
      {label && <div className="tag-tl">{label}</div>}
      {duration && <div className="tag-br">{duration}</div>}
      {play && (
        <div className="play">
          <Play size={16} fill="#fff" />
        </div>
      )}
      {children}
    </div>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="info-box small">
      <Info size={15} className="c-cyan" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

export function Warn({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <div className="warn-box small">
      <div className="row semi">
        <AlertTriangle size={15} /> {title}
      </div>
      {children && <div className="mt8" style={{ color: "#f3d9a8" }}>{children}</div>}
    </div>
  );
}

/** Yêu cầu chọn dự án trước khi dùng màn hình theo dự án. */
export function NeedProject({ children, projectId }: { children: ReactNode; projectId: string | null }) {
  const nav = useNavigate();
  if (projectId) return <>{children}</>;
  return (
    <Empty title="Chưa có dự án nào" action={<button className="btn primary" onClick={() => nav("/projects?new=1")}>Tạo dự án mới</button>}>
      Tạo dự án để bắt đầu nhập video, hồ sơ sản phẩm và sản xuất biến thể.
    </Empty>
  );
}
