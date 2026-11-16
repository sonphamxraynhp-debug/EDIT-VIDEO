/** Biểu đồ SVG nhẹ, không phụ thuộc thư viện. */
import { ReactNode } from "react";

export const PALETTE = ["#19d3b5", "#4f8bff", "#a074ff", "#f5a524", "#8a93b8", "#e879f9", "#4fc3ff", "#f0506e"];

export function Donut({ data, size = 150, thickness = 22, center }: { data: Array<{ label: string; value: number; color?: string }>; size?: number; thickness?: number; center?: ReactNode }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1d2752" strokeWidth={thickness} />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color || PALETTE[i % PALETTE.length]} strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-acc}>
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          );
          acc += len;
          return el;
        })}
      </svg>
      {center && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{center}</div>}
    </div>
  );
}

export function Ring({ value, size = 64, thickness = 7, color = "#19d3b5", label }: { value: number; size?: number; thickness?: number; color?: string; label?: ReactNode }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1d2752" strokeWidth={thickness} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 700, fontSize: size / 4.6 }}>{label ?? `${Math.round(v)}%`}</div>
    </div>
  );
}

export function AreaChart({ series, labels, height = 190, colors = ["#8b6cff", "#19d3b5"], showDots = true, yMax }: { series: number[][]; labels: string[]; height?: number; colors?: string[]; showDots?: boolean; yMax?: number }) {
  const W = 560;
  const H = height;
  const pad = { l: 38, r: 12, t: 14, b: 24 };
  const max = yMax ?? Math.max(1, ...series.flat()) * 1.15;
  const n = Math.max(1, labels.length - 1);
  const x = (i: number) => pad.l + (i / n) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = 5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        {colors.map((c, i) => (
          <linearGradient key={i} id={`ag${i}${c.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity=".45" />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const v = (max / ticks) * i;
        return (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#1f2a55" strokeDasharray="3 4" />
            <text x={pad.l - 6} y={y(v) + 3} fontSize="10" fill="#7e88b0" textAnchor="end">{Math.round(v)}</text>
          </g>
        );
      })}
      {labels.map((l, i) => (
        <text key={i} x={x(i)} y={H - 6} fontSize="10" fill="#7e88b0" textAnchor="middle">{l}</text>
      ))}
      {series.map((s, si) => {
        if (!s.length) return null;
        const pts = s.map((v, i) => `${x(i)},${y(v)}`).join(" ");
        const c = colors[si % colors.length];
        return (
          <g key={si}>
            <polygon points={`${x(0)},${y(0)} ${pts} ${x(s.length - 1)},${y(0)}`} fill={`url(#ag${si}${c.slice(1)})`} />
            <polyline points={pts} fill="none" stroke={c} strokeWidth="2.4" />
            {showDots && s.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke={c} strokeWidth="2"><title>{v}</title></circle>)}
          </g>
        );
      })}
    </svg>
  );
}

export function HBars({ data, color = "#8b6cff", format = (v: number) => String(v) }: { data: Array<{ label: string; value: number }>; color?: string; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="col" style={{ gap: 8 }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr 60px", alignItems: "center", gap: 10 }}>
          <span className="small t2 ellipsis">{d.label}</span>
          <div style={{ height: 14, background: "#1a2450", borderRadius: 4 }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${color}, #b49cff)` }} />
          </div>
          <span className="small right">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function VBars({ data, height = 110, color = "#8b6cff" }: { data: Array<{ label: string; value: number }>; height?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height }}>
      {data.map((d) => (
        <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
          <div title={`${d.value}`} style={{ width: "70%", height: `${(d.value / max) * 82}%`, minHeight: 2, borderRadius: "4px 4px 0 0", background: `linear-gradient(180deg, #b49cff, ${color})` }} />
          <span className="xs muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, color = "#8b6cff", height = 40, fill = true }: { values: number[]; color?: string; height?: number; fill?: boolean }) {
  const W = 200;
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${height - ((v - min) / (max - min || 1)) * (height - 4) - 2}`).join(" ");
  const id = `sp${color.slice(1)}`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <polygon points={`0,${height} ${pts} ${W},${height}`} fill={`url(#${id})`} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function Waveform({ values, height = 60, color = "#8b6cff", progress, onSeek }: { values: number[]; height?: number; color?: string; progress?: number; onSeek?: (p: number) => void }) {
  const n = values.length || 1;
  return (
    <svg viewBox={`0 0 ${n} 100`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block", cursor: onSeek ? "pointer" : undefined }}
      onClick={(e) => {
        if (!onSeek) return;
        const r = (e.currentTarget as SVGElement).getBoundingClientRect();
        onSeek((e.clientX - r.left) / r.width);
      }}>
      {values.map((v, i) => {
        const h = Math.max(2, v * 96);
        const past = progress !== undefined && i / n <= progress;
        return <rect key={i} x={i + 0.15} width={0.7} y={50 - h / 2} height={h} fill={past ? "#19d3b5" : color} opacity={past ? 1 : 0.85} />;
      })}
      {progress !== undefined && <line x1={progress * n} x2={progress * n} y1="0" y2="100" stroke="#fff" strokeWidth={Math.max(0.4, n / 400)} />}
    </svg>
  );
}
