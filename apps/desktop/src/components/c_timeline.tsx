/** Thành phần dùng chung cho Editor / Motion / Subtitles: tải + chỉnh timeline (avf.timeline/1),
 * lịch sử undo/redo, đồng hồ phát, khung preview 9:16 có phụ đề/tiêu đề vẽ bằng HTML, và timeline nhiều track. */
import { CSSProperties, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Film, Music, Type, Captions as CaptionsIcon, Mic, Diamond, Clapperboard } from "lucide-react";
import { api, fileUrl, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { msPrecise } from "../lib/format";
import { useSelectedVariant, useVariants, VariantSelect } from "./pickers";
import { Empty, ErrorBox, Loading, NeedProject } from "./ui";

// ---------------------------------------------------------------- types
export type Motion = "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "none";
export interface VideoClip {
  scene_id: string;
  asset_id: string;
  src_in_ms: number;
  src_out_ms: number;
  start_ms: number;
  end_ms: number;
  motion?: Motion | string;
  loop?: boolean;
  fallback?: boolean;
}
export interface Word { w: string; start_ms: number; end_ms: number }
export interface CaptionItem { beat?: number; start_ms: number; end_ms: number; text: string; words?: Word[] }
export interface TitleItem { beat?: number; start_ms: number; end_ms: number; text: string; style?: string }
export interface Timeline {
  schema: string;
  canvas: { aspect: string; width: number; height: number; fps: number };
  duration_ms: number;
  template_id?: string;
  gaps?: any[];
  tracks: {
    video: VideoClip[];
    captions: CaptionItem[];
    titles: TitleItem[];
    voice?: Array<{ start_ms: number; end_ms: number; text?: string; uri?: string }>;
    music?: any[];
    voice_mix?: string;
    music_mix?: string;
  };
  [k: string]: any;
}
export type SelKind = "video" | "caption" | "title";
export interface Sel { kind: SelKind; i: number }

export const MOTIONS: Array<{ id: Motion; label: string; desc: string }> = [
  { id: "zoom_in", label: "Zoom vào", desc: "Phóng to dần 8% – đưa sản phẩm vào tâm điểm" },
  { id: "zoom_out", label: "Zoom ra", desc: "Thu nhỏ dần 8% – mở bối cảnh" },
  { id: "pan_left", label: "Lia trái", desc: "Khung hình trượt sang trái 12%" },
  { id: "pan_right", label: "Lia phải", desc: "Khung hình trượt sang phải 12%" },
  { id: "none", label: "Tĩnh", desc: "Không chuyển động, cắt cúp vừa khung" },
];
export const motionLabel = (m?: string) => MOTIONS.find((x) => x.id === m)?.label || "Tĩnh";

export const STORYBOARD_STATES = ["STORYBOARD_READY", "PREVIEW_READY", "QC_PENDING", "APPROVED", "RENDERING", "COMPLETED", "NEEDS_REVISION", "FAILED"];

export interface CaptionStyle {
  font_size: number;
  color: string;
  highlight_color: string;
  stroke: number;
  stroke_color: string;
  box: boolean;
  box_color: string;
  max_lines: number;
  caption_y: number;
  safe_margin: number;
  preset?: string;
}
/** Giá trị mặc định khớp render.draw_text_png. */
export const DEFAULT_CAPTION: CaptionStyle = {
  font_size: 54, color: "#FFFFFF", highlight_color: "#FFD700", stroke: 3, stroke_color: "#000000",
  box: false, box_color: "#000000", max_lines: 2, caption_y: 0.7, safe_margin: 0.08,
};

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- timeline maths
export function recomputeDuration(tl: Timeline) {
  const ends = [
    ...tl.tracks.video.map((c) => c.end_ms),
    ...tl.tracks.captions.map((c) => c.end_ms),
    ...tl.tracks.titles.map((c) => c.end_ms),
    0,
  ];
  tl.duration_ms = Math.max(...ends);
}
/** Xếp lại clip video liên tiếp theo thứ tự mảng, giữ thời lượng từng clip. */
export function packVideo(tl: Timeline) {
  let t = tl.tracks.video[0]?.start_ms ? 0 : 0;
  for (const c of tl.tracks.video) {
    const d = c.end_ms - c.start_ms;
    c.start_ms = t;
    c.end_ms = t + d;
    t += d;
  }
  recomputeDuration(tl);
}
export function clipAt(tl: Timeline | null | undefined, t: number): number {
  if (!tl) return -1;
  const v = tl.tracks.video;
  const i = v.findIndex((c) => t >= c.start_ms && t < c.end_ms);
  if (i >= 0) return i;
  return v.length && t >= v[v.length - 1].end_ms ? v.length - 1 : -1;
}
export const activeAt = <T extends { start_ms: number; end_ms: number }>(arr: T[] | undefined, t: number) =>
  (arr || []).findIndex((x) => t >= x.start_ms && t < x.end_ms);

// ---------------------------------------------------------------- document hook (load / history / save)
export function useTimelineDoc(variantId: string | null | undefined, poll?: number) {
  const { toast, toastError } = useApp();
  const q = useApi<any>(variantId ? `/variants/${variantId}` : null, undefined, poll);
  const [hist, setHist] = useState<{ past: Timeline[]; present: Timeline | null; future: Timeline[] }>({ past: [], present: null, future: [] });
  const [baseId, setBaseId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const sb = q.data?.id === variantId ? q.data?.storyboard : undefined;

  useEffect(() => {
    setHist({ past: [], present: null, future: [] });
    setBaseId(null);
    setDirty(false);
  }, [variantId]);

  useEffect(() => {
    if (!sb?.timeline_json) return;
    if (sb.id !== baseId && !dirty) {
      const tl = clone(sb.timeline_json) as Timeline;
      tl.tracks.captions ||= [];
      tl.tracks.titles ||= [];
      tl.tracks.video ||= [];
      setHist({ past: [], present: tl, future: [] });
      setBaseId(sb.id);
    }
  }, [sb, baseId, dirty]);

  const commit = useCallback((fn: (d: Timeline) => void) => {
    setHist((h) => {
      if (!h.present) return h;
      const next = clone(h.present);
      fn(next);
      recomputeDuration(next);
      return { past: [...h.past.slice(-49), h.present], present: next, future: [] };
    });
    setDirty(true);
  }, []);
  const undo = useCallback(() => {
    setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present!, ...h.future] } : h));
    setDirty(true);
  }, []);
  const redo = useCallback(() => {
    setHist((h) => (h.future.length ? { past: [...h.past, h.present!], present: h.future[0], future: h.future.slice(1) } : h));
    setDirty(true);
  }, []);
  const reset = useCallback(() => {
    if (!sb?.timeline_json) return;
    setHist({ past: [], present: clone(sb.timeline_json), future: [] });
    setDirty(false);
  }, [sb]);

  const save = useCallback(
    async (silent = false) => {
      if (!variantId || !hist.present) return undefined;
      try {
        const r = await api.put(`/variants/${variantId}/timeline`, hist.present);
        setBaseId(r.id);
        setDirty(false);
        if (!silent) toast({ kind: "success", title: `Đã lưu timeline (phiên bản ${r.version})` });
        q.reload();
        return r;
      } catch (e) {
        toastError(e, "Không lưu được timeline");
        throw e;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variantId, hist.present, toast, toastError],
  );

  return {
    q,
    variant: q.data?.id === variantId ? q.data : undefined,
    storyboard: sb,
    tl: hist.present,
    commit,
    undo,
    redo,
    reset,
    save,
    dirty,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
  };
}

/** Tư liệu + cảnh của dự án (map theo id). */
export function useProjectMedia(projectId: string | null) {
  const assets = useApi<any[]>(projectId ? "/assets" : null, projectId ? { project_id: projectId } : undefined);
  const scenes = useApi<any[]>(projectId ? "/scenes" : null, projectId ? { project_id: projectId } : undefined);
  const assetsById = useMemo(() => Object.fromEntries((assets.data || []).map((a) => [a.id, a])), [assets.data]);
  const scenesById = useMemo(() => Object.fromEntries((scenes.data || []).map((s) => [s.id, s])), [scenes.data]);
  return { assets, scenes, assetsById, scenesById };
}
export const assetSrc = (a: any) => (a ? fileUrl(a.meta_json?.proxy || a.uri) : undefined);

/** Style phụ đề hiệu lực = mặc định ← template ← brand kit đang dùng (giống pipeline.job_render). */
export function useCaptionStyle(templateId?: string) {
  const templates = useApi<any[]>("/templates");
  const brands = useApi<any>("/brands");
  const kit = brands.data?.kits?.find((k: any) => k.id === brands.data?.active);
  const tmpl = templates.data?.find((t) => t.id === templateId)?.template_json;
  const style: CaptionStyle = { ...DEFAULT_CAPTION, ...(tmpl?.caption || {}), ...(kit?.caption || {}) };
  return { style, kit, brands, tmpl, accent: kit?.primary || tmpl?.accent || "#7B56FF" };
}

// ---------------------------------------------------------------- variant gate
/** Bọc màn hình theo biến thể: cần dự án, chiến dịch, biến thể có storyboard. */
export function VariantGate({ children, title }: { title?: string; children: (ctx: { variantId: string; items: any[]; select: (id: string) => void; picker: ReactNode }) => ReactNode }) {
  const { projectId, campaign } = useApp();
  const nav = useNavigate();
  const vq = useVariants(undefined, 15000);
  const items = vq.data?.items;
  const withSb = useMemo(() => (items || []).filter((v) => STORYBOARD_STATES.includes(v.status)), [items]);
  const sel = useSelectedVariant(withSb.length ? withSb : items, (v) => STORYBOARD_STATES.includes(v.status));
  return (
    <NeedProject projectId={projectId}>
      {!campaign ? (
        <Empty title="Chưa có chiến dịch" action={<button className="btn primary" onClick={() => nav("/creative/strategy")}>Lập chiến lược</button>}>
          Tạo chiến lược và ma trận biến thể trước khi {title || "chỉnh sửa video"}.
        </Empty>
      ) : vq.loading && !items ? (
        <Loading rows={4} h={20} />
      ) : vq.error && !items ? (
        <ErrorBox error={vq.error} onRetry={vq.reload} />
      ) : !withSb.length ? (
        <Empty title="Chưa có biến thể nào có storyboard" action={<button className="btn primary" onClick={() => nav("/creative/storyboard")}>Mở Storyboard</button>}>
          Duyệt kịch bản và dựng storyboard để có timeline chỉnh sửa.
        </Empty>
      ) : !sel.id ? (
        <Loading />
      ) : (
        <>{children({ variantId: sel.id, items: withSb, select: sel.select, picker: <VariantSelect items={withSb} value={sel.id} onChange={sel.select} /> })}</>
      )}
    </NeedProject>
  );
}

// ---------------------------------------------------------------- playback clock
export function usePlayer(durationMs: number, voiceUrl?: string) {
  const [t, setTState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tRef = useRef(0);
  const raf = useRef<number>();
  const last = useRef<number>(0);

  const setT = useCallback(
    (v: number) => {
      const x = Math.max(0, Math.min(durationMs || 0, v));
      tRef.current = x;
      setTState(x);
      if (audioRef.current) {
        try {
          audioRef.current.currentTime = x / 1000;
        } catch {
          /* audio chưa sẵn sàng */
        }
      }
    },
    [durationMs],
  );

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const a = audioRef.current;
    if (a && voiceUrl) {
      a.currentTime = tRef.current / 1000;
      a.play().catch(() => undefined);
    }
    const tick = (now: number) => {
      const dt = now - last.current;
      last.current = now;
      let nt = a && voiceUrl && !a.paused && a.currentTime * 1000 <= durationMs ? a.currentTime * 1000 : tRef.current + dt;
      if (nt >= durationMs) {
        nt = durationMs;
        setPlaying(false);
      }
      tRef.current = nt;
      setTState(nt);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      a?.pause();
    };
  }, [playing, durationMs, voiceUrl]);

  const toggle = useCallback(() => {
    if (!playing && tRef.current >= durationMs - 30) setT(0);
    setPlaying((p) => !p);
  }, [playing, durationMs, setT]);

  const audio = voiceUrl ? <audio ref={audioRef} src={voiceUrl} preload="auto" style={{ display: "none" }} /> : null;
  return { t, setT, playing, setPlaying, toggle, audio };
}

// ---------------------------------------------------------------- preview canvas
function motionTransform(motion: string | undefined, p: number): string {
  p = Math.max(0, Math.min(1, p));
  switch (motion) {
    case "zoom_in":
      return `scale(${1 + 0.08 * p})`;
    case "zoom_out":
      return `scale(${1.08 - 0.08 * p})`;
    case "pan_left":
      return `scale(1.12) translateX(${((0.5 - p) * 0.12 * 100) / 1.12}%)`;
    case "pan_right":
      return `scale(1.12) translateX(${((p - 0.5) * 0.12 * 100) / 1.12}%)`;
    default:
      return "none";
  }
}
export { motionTransform };

export function hexA(hex: string, a: number) {
  const h = (hex || "#000000").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Ước lượng số dòng như textwrap trong render (độ rộng ký tự TB ≈ 0.52 × cỡ chữ). */
export function wrapCaption(text: string, style: CaptionStyle, canvasW = 1080) {
  const usable = canvasW * (1 - 2 * (style.safe_margin ?? 0.08));
  const width = Math.max(8, Math.floor(usable / (style.font_size * 0.52)));
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= width) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function CaptionOverlay({ text, words, t, style, scale, karaoke }: { text: string; words?: Word[]; t: number; style: CaptionStyle; scale: number; karaoke?: boolean }) {
  const lines = wrapCaption(text, style);
  const shown = lines.slice(0, style.max_lines);
  if (lines.length > style.max_lines && shown.length) shown[shown.length - 1] = shown[shown.length - 1].replace(/[ ,.]+$/, "") + "…";
  const fs = style.font_size * scale;
  let wi = 0;
  return (
    <div style={{ position: "absolute", left: `${style.safe_margin * 100}%`, right: `${style.safe_margin * 100}%`, top: `${style.caption_y * 100}%`, transform: "translateY(-50%)", textAlign: "center", pointerEvents: "none", lineHeight: 1.25 }}>
      {shown.map((ln, li) => (
        <div key={li}>
          <span
            style={{
              fontSize: fs, fontWeight: 800, color: style.color, fontFamily: "Arial, Helvetica, sans-serif",
              WebkitTextStroke: style.stroke ? `${Math.max(0.5, style.stroke * scale * 2)}px ${style.stroke_color}` : undefined,
              paintOrder: "stroke fill",
              background: style.box ? hexA(style.box_color, 0.59) : undefined,
              padding: style.box ? `${fs * 0.08}px ${fs * 0.25}px` : undefined,
              borderRadius: style.box ? fs * 0.25 : undefined,
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
            } as CSSProperties}
          >
            {ln.split(" ").map((w, k) => {
              const word = words?.[wi++];
              const on = karaoke && word && t >= word.start_ms && t < word.end_ms;
              const past = karaoke && word && t >= word.end_ms;
              return (
                <span key={k} style={{ color: on || (past && style.preset === "karaoke") ? style.highlight_color : undefined, transition: "color .08s" }}>
                  {w}
                  {k < ln.split(" ").length - 1 ? " " : ""}
                </span>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TitleOverlay({ item, scale, accent }: { item: TitleItem; scale: number; accent: string }) {
  const kind = item.style || "callout";
  const fs = (kind === "hook" ? 64 : 46) * scale;
  return (
    <div style={{ position: "absolute", left: "8%", right: "8%", top: kind === "cta" ? "56%" : "16%", textAlign: "center", pointerEvents: "none" }}>
      <span style={{ display: "inline", background: accent, color: "#fff", fontWeight: 800, fontSize: fs, lineHeight: 1.6, padding: `${fs * 0.15}px ${fs * 0.35}px`, borderRadius: fs * 0.28, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", fontFamily: "Arial, Helvetica, sans-serif" } as CSSProperties}>
        {item.text}
      </span>
    </div>
  );
}

/** Khung preview 9:16: phát proxy nguồn tại src_in của clip đang chạy + chuyển động + overlay. */
export function PreviewCanvas({ tl, assetsById, t, playing, captionStyle, accent, karaoke, showSafe, width = 300, children, hideTitles, overrideCaption }: {
  tl: Timeline;
  assetsById: Record<string, any>;
  t: number;
  playing: boolean;
  captionStyle: CaptionStyle;
  accent: string;
  karaoke?: boolean;
  showSafe?: boolean;
  width?: number;
  children?: ReactNode;
  hideTitles?: boolean;
  overrideCaption?: CaptionItem | null;
}) {
  const vref = useRef<HTMLVideoElement>(null);
  const ci = clipAt(tl, t);
  const clip = ci >= 0 ? tl.tracks.video[ci] : undefined;
  const asset = clip ? assetsById[clip.asset_id] : undefined;
  const src = assetSrc(asset);
  const ratio = tl.canvas ? tl.canvas.width / tl.canvas.height : 9 / 16;
  const scale = width / (tl.canvas?.width || 1080);
  const want = useMemo(() => {
    if (!clip) return 0;
    const span = Math.max(1, clip.src_out_ms - clip.src_in_ms);
    let off = Math.max(0, t - clip.start_ms);
    if (clip.loop) off = off % span;
    return (clip.src_in_ms + off) / 1000;
  }, [clip, t]);

  useEffect(() => {
    const v = vref.current;
    if (!v || !src) return;
    if (v.dataset.src !== src) {
      v.dataset.src = src;
      v.src = src;
    }
    if (!playing || Math.abs(v.currentTime - want) > 0.35) {
      try {
        v.currentTime = want;
      } catch {
        /* metadata chưa tải */
      }
    }
    if (playing && v.paused) v.play().catch(() => undefined);
    if (!playing && !v.paused) v.pause();
  }, [src, want, playing]);

  const p = clip ? (t - clip.start_ms) / Math.max(1, clip.end_ms - clip.start_ms) : 0;
  const capI = activeAt(tl.tracks.captions, t);
  const cap = overrideCaption !== undefined ? overrideCaption : capI >= 0 ? tl.tracks.captions[capI] : null;
  const titles = hideTitles ? [] : tl.tracks.titles.filter((x) => t >= x.start_ms && t < x.end_ms);
  return (
    <div className="media" style={{ width, aspectRatio: `${ratio}`, background: "#000", margin: "0 auto", flexShrink: 0 }}>
      {src ? (
        <video
          ref={vref}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            try {
              e.currentTarget.currentTime = want;
            } catch {
              /* bỏ qua */
            }
          }}
          style={{ transform: motionTransform(clip?.motion, p), transformOrigin: "center", objectFit: "cover" }}
        />
      ) : (
        <div className="ph-media" style={{ position: "absolute", inset: 0 }}>
          <Film size={26} />
        </div>
      )}
      {titles.map((x, i) => (
        <TitleOverlay key={i} item={x} scale={scale} accent={accent} />
      ))}
      {cap && <CaptionOverlay text={cap.text} words={cap.words} t={t} style={captionStyle} scale={scale} karaoke={karaoke} />}
      {showSafe && (
        <div style={{ position: "absolute", left: `${captionStyle.safe_margin * 100}%`, right: `${captionStyle.safe_margin * 100}%`, top: "12%", bottom: "20%", border: "1px dashed rgba(25,211,181,.8)", borderRadius: 6, pointerEvents: "none" }} />
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- multi-track timeline
export type TrackId = "video" | "titles" | "captions" | "voice" | "music" | "keyframes";
const TRACK_META: Record<TrackId, { label: string; icon: ReactNode; color: string }> = {
  video: { label: "Footage (V1)", icon: <Clapperboard size={13} />, color: "linear-gradient(180deg,#4f6bff,#3b4fd8)" },
  titles: { label: "Tiêu đề", icon: <Type size={13} />, color: "linear-gradient(180deg,#9b5cf6,#7b3fe0)" },
  captions: { label: "Phụ đề", icon: <CaptionsIcon size={13} />, color: "linear-gradient(180deg,#8a7a24,#6b5d12)" },
  voice: { label: "Giọng đọc", icon: <Mic size={13} />, color: "linear-gradient(180deg,#128a7a,#0d6b5e)" },
  music: { label: "Nhạc nền", icon: <Music size={13} />, color: "linear-gradient(180deg,#147a52,#0e5c3d)" },
  keyframes: { label: "Keyframes", icon: <Diamond size={13} />, color: "transparent" },
};

export function TimelineView({ tl, t, onSeek, sel, onSelect, pxPerSec = 60, tracks = ["video", "titles", "captions", "voice", "music", "keyframes"], clipName }: {
  tl: Timeline;
  t: number;
  onSeek: (ms: number) => void;
  sel?: Sel | null;
  onSelect?: (s: Sel) => void;
  pxPerSec?: number;
  tracks?: TrackId[];
  clipName?: (c: VideoClip, i: number) => string;
}) {
  const dur = Math.max(1000, tl.duration_ms);
  const W = (dur / 1000) * pxPerSec;
  const x = (ms: number) => (ms / 1000) * pxPerSec;
  const step = pxPerSec >= 90 ? 1 : pxPerSec >= 45 ? 2 : 5;
  const ticks = Math.floor(dur / 1000 / step) + 1;
  const laneRef = useRef<HTMLDivElement>(null);
  const seekFromEvent = (e: React.MouseEvent) => {
    const r = laneRef.current?.getBoundingClientRect();
    if (!r) return;
    onSeek(Math.max(0, Math.min(dur, ((e.clientX - r.left) / pxPerSec) * 1000)));
  };
  const clip = (key: string, left: number, width: number, bg: string, label: ReactNode, on: boolean, onClick?: () => void, title?: string) => (
    <div key={key} className={`tl-clip ${on ? "sel" : ""}`} title={title} style={{ left, width: Math.max(4, width - 2), background: bg }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}>
      {label}
    </div>
  );
  return (
    <div className="tl" style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 130 + W + 20 }}>
        <div className="tl-ruler">
          <div />
          <div style={{ position: "relative", cursor: "pointer" }} onMouseDown={seekFromEvent}>
            {Array.from({ length: ticks }).map((_, i) => (
              <span key={i} style={{ position: "absolute", left: x(i * step * 1000), top: 4, transform: "translateX(-50%)" }}>
                {`0:${String(i * step).padStart(2, "0")}`}
              </span>
            ))}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          {tracks.map((tid) => {
            const m = TRACK_META[tid];
            let content: ReactNode = null;
            if (tid === "video")
              content = tl.tracks.video.map((c, i) =>
                clip(`v${i}`, x(c.start_ms), x(c.end_ms - c.start_ms), m.color, <span className="ellipsis">{clipName ? clipName(c, i) : `C${i + 1}`}{c.loop ? " ↻" : ""}</span>, sel?.kind === "video" && sel.i === i, () => onSelect?.({ kind: "video", i }), `${msPrecise(c.start_ms)} – ${msPrecise(c.end_ms)}`),
              );
            if (tid === "titles")
              content = tl.tracks.titles.map((c, i) => clip(`t${i}`, x(c.start_ms), x(c.end_ms - c.start_ms), m.color, <span className="ellipsis">{c.text}</span>, sel?.kind === "title" && sel.i === i, () => onSelect?.({ kind: "title", i })));
            if (tid === "captions")
              content = tl.tracks.captions.map((c, i) => clip(`c${i}`, x(c.start_ms), x(c.end_ms - c.start_ms), m.color, <span className="ellipsis">{c.text}</span>, sel?.kind === "caption" && sel.i === i, () => onSelect?.({ kind: "caption", i })));
            if (tid === "voice")
              content = (tl.tracks.voice || []).length ? (
                (tl.tracks.voice || []).map((c, i) => clip(`a${i}`, x(c.start_ms), x(c.end_ms - c.start_ms), m.color, <span className="ellipsis">🎙 {c.text}</span>, false))
              ) : (
                <span className="xs muted" style={{ position: "absolute", left: 8, top: 8 }}>Chưa tạo giọng đọc – sẽ tự tạo khi render</span>
              );
            if (tid === "music")
              content = (tl.tracks.music || []).length || tl.tracks.music_mix ? (
                clip("m0", 0, W, m.color, <span className="ellipsis">Nhạc nền</span>, false)
              ) : (
                <span className="xs muted" style={{ position: "absolute", left: 8, top: 8 }}>Chưa có nhạc nền (engine chưa gắn nhạc tự động)</span>
              );
            if (tid === "keyframes")
              content = tl.tracks.video.flatMap((c, i) =>
                c.motion && c.motion !== "none"
                  ? [c.start_ms, c.end_ms].map((ms, k) => (
                      <span key={`k${i}${k}`} title={`${motionLabel(c.motion)} · C${i + 1}`} style={{ position: "absolute", left: x(ms) - 5 - (k ? 3 : -3), top: 10, width: 9, height: 9, background: "#a074ff", transform: "rotate(45deg)", borderRadius: 2 }} />
                    ))
                  : [],
              );
            return (
              <div key={tid} className="tl-row">
                <div className="tl-label">{m.icon} {m.label}</div>
                <div className="tl-lane" ref={tid === tracks[0] ? laneRef : undefined} onMouseDown={seekFromEvent} style={{ cursor: "pointer" }}>
                  {content}
                </div>
              </div>
            );
          })}
          <div className="tl-head" style={{ left: 130 + x(t) }}>
            <span style={{ position: "absolute", top: -20, left: -26, background: "var(--primary)", borderRadius: 5, padding: "1px 5px", fontSize: 10, color: "#fff", whiteSpace: "nowrap" }}>{msPrecise(t)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- misc
export function toSrt(caps: CaptionItem[]) {
  const ts = (ms: number) => {
    ms = Math.max(0, Math.round(ms));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return caps.map((c, i) => `${i + 1}\n${ts(c.start_ms)} --> ${ts(c.end_ms)}\n${c.text}\n`).join("\n");
}

export function download(name: string, text: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bỏ qua phím tắt khi đang gõ trong ô nhập. */
export const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/** Job preview mới nhất & job đang chạy của biến thể. */
export function previewJobs(variant: any) {
  const jobs: any[] = variant?.jobs || [];
  const active = jobs.find((j) => j.kind === "preview" && ["PENDING", "PREPARING", "RENDERING", "VERIFYING", "RETRY_WAIT"].includes(j.status));
  const done = jobs.find((j) => j.kind === "preview" && j.status === "COMPLETED" && j.output_uri);
  const final = jobs.find((j) => j.kind === "final" && j.status === "COMPLETED" && j.output_uri);
  const failed = jobs.find((j) => j.kind === "preview" && j.status === "FAILED");
  return { active, done, final, failed: failed && (!done || failed.created_at > done.created_at) ? failed : undefined };
}

export function NumInput({ value, onChange, step = 100, min, max, suffix, disabled, style }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; disabled?: boolean; style?: CSSProperties }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  const commitV = () => {
    let n = Number(txt);
    if (isNaN(n)) return setTxt(String(value));
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (n !== value) onChange(n);
    else setTxt(String(value));
  };
  return (
    <div className="row" style={{ gap: 6, ...style }}>
      <input className="input" style={{ height: 32 }} type="number" step={step} value={txt} disabled={disabled} onChange={(e) => setTxt(e.target.value)} onBlur={commitV} onKeyDown={(e) => e.key === "Enter" && commitV()} />
      {suffix && <span className="xs muted">{suffix}</span>}
    </div>
  );
}
