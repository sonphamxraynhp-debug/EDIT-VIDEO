import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, BarChart3, Bookmark, Check, ChevronRight, Columns2, Crop, Diamond, Eye, Film, Gauge, Layers, Move, Pause, Play, RotateCcw,
  Search, Shuffle, SkipBack, Sparkles, Type, Wand2, Zap,
} from "lucide-react";
import { api, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { msPrecise } from "../lib/format";
import { Badge, Btn, Card, Empty, Field, InfoNote, Loading, PageHead, Seg, Select, Thumb, Warn, ErrorBox } from "../components/ui";
import { MOTIONS, motionLabel, motionTransform, useProjectMedia, useTimelineDoc, VariantGate } from "../components/c_timeline";

const CATEGORIES: Array<{ id: string; label: string; desc: string; icon: React.ReactNode; supported: boolean; note?: string }> = [
  { id: "functional", label: "Functional Motion", desc: "Chuyển động chức năng (zoom, pan)", icon: <Move size={16} />, supported: true },
  { id: "callouts", label: "Product Callouts", desc: "Chú thích & nhấn mạnh tính năng", icon: <Sparkles size={16} />, supported: false, note: "Dùng track Tiêu đề (callout) trong Smart Editor" },
  { id: "kinetic", label: "Kinetic Typography", desc: "Chữ động kể chuyện", icon: <Type size={16} />, supported: false, note: "Engine vẽ chữ tĩnh (PNG overlay)" },
  { id: "transitions", label: "Scene Transitions", desc: "Chuyển cảnh mượt", icon: <Shuffle size={16} />, supported: false, note: "Engine hiện cắt thẳng giữa các cảnh" },
  { id: "framing", label: "Framing", desc: "Khung hình & bố cục", icon: <Crop size={16} />, supported: false, note: "Chỉ có lưới vùng an toàn để xem trước" },
  { id: "split", label: "Split Screen", desc: "Chia màn hình, so sánh", icon: <Columns2 size={16} />, supported: false, note: "Chưa có trong engine render" },
  { id: "infographics", label: "Infographics", desc: "Biểu đồ, số liệu", icon: <BarChart3 size={16} />, supported: false, note: "Chưa có trong engine render" },
  { id: "brand", label: "Brand Patterns", desc: "Hoạ tiết thương hiệu", icon: <Layers size={16} />, supported: false, note: "Chưa có trong engine render" },
];

const EASINGS: Record<string, { label: string; fn: (p: number) => number }> = {
  linear: { label: "Tuyến tính (engine)", fn: (p) => p },
  in: { label: "Ease In (chậm → nhanh)", fn: (p) => p * p },
  out: { label: "Ease Out (nhanh → chậm)", fn: (p) => 1 - (1 - p) * (1 - p) },
  inout: { label: "Ease In-Out", fn: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) },
};

const SAFE: Record<string, number | null> = { all: null, "16:9": 16 / 9, "1:1": 1, "9:16": 9 / 16 };
const PreviewOnly = () => <Badge tone="orange">Xem trước – chưa áp dụng khi render</Badge>;

export default function Motion() {
  return <VariantGate title="áp hiệu ứng">{(g) => <MotionInner key={g.variantId} variantId={g.variantId} picker={g.picker} />}</VariantGate>;
}

function MotionInner({ variantId, picker }: { variantId: string; picker: React.ReactNode }) {
  const nav = useNavigate();
  const { projectId, toast, toastError } = useApp();
  const doc = useTimelineDoc(variantId);
  const { tl } = doc;
  const media = useProjectMedia(projectId);
  const [bench, setBench] = useState(false);
  const benchQ = useApi<any>("/system/benchmark", undefined, bench ? 2000 : undefined);
  const [ci, setCi] = useState(0);
  const [cat, setCat] = useState("functional");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [scope, setScope] = useState<"clip" | "asset" | "all">("clip");
  const [easing, setEasing] = useState("linear");
  const [offX, setOffX] = useState(0);
  const [offY, setOffY] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [safe, setSafe] = useState("9:16");
  const [p, setP] = useState(0);
  const [playing, setPlaying] = useState(true);
  const raf = useRef<number>();
  const [saveReq, setSaveReq] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!saveReq) return;
    setSaveReq(false);
    setSaving(true);
    doc.save().catch(() => undefined).finally(() => setSaving(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveReq]);

  const clip = tl?.tracks.video[ci];
  const dur = clip ? clip.end_ms - clip.start_ms : 1000;
  const motion = draft ?? clip?.motion ?? "none";

  useEffect(() => {
    if (bench && benchQ.data && !benchQ.data.running) setBench(false);
  }, [bench, benchQ.data]);
  useEffect(() => setDraft(null), [ci]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      setP((x) => {
        const n = x + (now - last) / Math.max(300, dur);
        return n >= 1 ? 0 : n;
      });
      last = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, dur]);

  const targets = useMemo(() => {
    if (!tl || !clip) return [] as number[];
    if (scope === "clip") return [ci];
    if (scope === "asset") return tl.tracks.video.map((c, i) => (c.asset_id === clip.asset_id ? i : -1)).filter((i) => i >= 0);
    return tl.tracks.video.map((_, i) => i);
  }, [tl, clip, ci, scope]);

  if (doc.q.loading && !doc.variant) return <Loading rows={6} h={22} />;
  if (doc.q.error && !doc.variant) return <ErrorBox error={doc.q.error} onRetry={doc.q.reload} />;
  if (!tl && doc.storyboard) return <Loading rows={6} h={22} />;
  if (!tl || !clip) {
    return (
      <Empty title="Biến thể này chưa có storyboard" action={<button className="btn primary" onClick={() => nav(`/creative/storyboard?v=${variantId}`)}>Dựng storyboard</button>}>
        {picker}
      </Empty>
    );
  }

  const scene = media.scenesById[clip.scene_id];
  const kf = scene?.keyframe || media.assetsById[clip.asset_id]?.meta_json?.thumbnail;
  const ep = EASINGS[easing].fn(p);
  const counts = MOTIONS.reduce<Record<string, number>>((a, m) => ({ ...a, [m.id]: tl.tracks.video.filter((c) => (c.motion || "none") === m.id).length }), {});
  const presets = MOTIONS.filter((m) => !search || (m.label + m.desc + m.id).toLowerCase().includes(search.toLowerCase()));
  const catInfo = CATEGORIES.find((c) => c.id === cat)!;
  const pendingChange = draft !== null && targets.some((i) => (tl.tracks.video[i].motion || "none") !== draft);

  const apply = () => {
    if (draft === null) return;
    const m = draft;
    doc.commit((d) => {
      for (const i of targets) d.tracks.video[i].motion = m;
    });
    setDraft(null);
  };

  const results: any[] = benchQ.data?.results || [];
  const okRes = results.filter((r) => r.ok && r.speed > 0);
  const speed = okRes.length ? okRes.reduce((a, r) => a + r.speed, 0) / okRes.length : null;
  const totalS = tl.duration_ms / 1000;
  const motionClips = tl.tracks.video.filter((c) => c.motion && c.motion !== "none").length;

  const saveTemplate = async () => {
    if (!tl.template_id) return;
    try {
      const list = await api.get<any[]>("/templates");
      const t = list.find((x) => x.id === tl.template_id);
      if (!t) throw new Error("Không tìm thấy template");
      const motions = Array.from(new Set(tl.tracks.video.map((c) => c.motion || "none")));
      await api.put(`/templates/${t.id}`, { template_json: { ...t.template_json, motions } });
      toast({ kind: "success", title: `Đã lưu bộ chuyển động vào template “${t.name}”`, body: `Storyboard mới sẽ chọn trong: ${motions.map(motionLabel).join(", ")}` });
      return true;
    } catch (e) {
      toastError(e, "Không lưu được template");
      return undefined;
    }
  };

  const afterStyle = (): React.CSSProperties => {
    const base = motionTransform(motion, ep);
    const extra = offX || offY ? ` translate(${(offX / 1080) * 100}%, ${(offY / 1920) * 100}%)` : "";
    return { transform: (base === "none" ? "" : base) + extra || "none", opacity: opacity / 100, transformOrigin: "center", transition: "none" };
  };
  const safeBox = SAFE[safe];

  return (
    <>
      <PageHead
        title="Motion & Effects"
        sub="Hiệu ứng chuyển động cho từng cảnh – tăng khả năng thu hút, làm nổi bật lợi ích và giữ nhịp kể chuyện."
        icon={<Wand2 size={22} />}
        actions={
          <>
            {picker}
            <Btn icon={<RotateCcw size={16} />} disabled={!doc.dirty && draft === null} title="Bỏ các thay đổi chưa lưu" onClick={() => { doc.reset(); setDraft(null); }}>Đặt lại</Btn>
            <Btn icon={<Bookmark size={16} />} disabled={!tl.template_id} title={tl.template_id ? "Ghi bộ chuyển động hiện tại vào template của biến thể (áp dụng cho storyboard dựng sau)" : "Timeline không gắn template"} onClick={saveTemplate}>Lưu làm mẫu</Btn>
            <Btn kind="primary" icon={<Check size={16} />} disabled={!doc.dirty && !pendingChange} title="Áp dụng hiệu ứng và lưu timeline" loading={saving} onClick={() => { if (pendingChange) apply(); setSaveReq(true); }}>
              Lưu hiệu ứng áp dụng{doc.dirty ? " *" : ""}
            </Btn>
          </>
        }
      />

      <div className="grid" style={{ gridTemplateColumns: "290px minmax(0,1fr) 340px", alignItems: "start" }}>
        {/* ---------------- library */}
        <Card title="Thư viện hiệu ứng">
          <div className="search" style={{ maxWidth: "none", margin: 0 }}>
            <Search size={14} />
            <input placeholder="Tìm hiệu ứng (zoom, pan…)" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="col mt12" style={{ gap: 6 }}>
            {CATEGORIES.map((c) => (
              <div key={c.id} className={`list-item ${cat === c.id ? "on" : ""}`} style={{ padding: 8, opacity: c.supported ? 1 : 0.7 }} onClick={() => setCat(c.id)} title={c.note}>
                <span className="c-primary">{c.icon}</span>
                <div className="grow"><div className="small semi">{c.label}</div><div className="xs muted ellipsis">{c.desc}</div></div>
                {c.supported ? <Badge tone="teal">{MOTIONS.length}</Badge> : <Badge tone="gray">Sắp có</Badge>}
              </div>
            ))}
          </div>
          <div className="divider" />
          {catInfo.supported ? (
            <div className="col" style={{ gap: 6 }}>
              <div className="xs muted">Preset engine hỗ trợ · số clip đang dùng trong biến thể</div>
              {presets.map((m) => (
                <div key={m.id} className={`list-item ${motion === m.id ? "on" : ""}`} style={{ padding: 8 }} onClick={() => setDraft(m.id)}>
                  <Move size={14} className="c-cyan" />
                  <div className="grow"><div className="small semi">{m.label}</div><div className="xs muted">{m.desc}</div></div>
                  <Badge tone={counts[m.id] ? "purple" : "gray"}>{counts[m.id]}</Badge>
                </div>
              ))}
              {!presets.length && <div className="xs muted">Không có hiệu ứng khớp “{search}”.</div>}
            </div>
          ) : (
            <InfoNote>{catInfo.note}. Nhóm hiệu ứng này sẽ được bật khi engine render hỗ trợ.</InfoNote>
          )}
        </Card>

        {/* ---------------- before/after */}
        <Card title={<span>Minh hoạ hiệu ứng: C{ci + 1} · {scene?.label || "Cảnh"}</span>} icon={<Film size={16} />} right={<Badge tone={pendingChange ? "orange" : "teal"}>{pendingChange ? "Chưa áp dụng" : "Đang áp dụng"}</Badge>}>
          <div className="row wrap mb12" style={{ gap: 6 }}>
            {tl.tracks.video.map((c, i) => (
              <button key={i} className={`chip ${i === ci ? "on" : ""}`} onClick={() => setCi(i)} title={`${msPrecise(c.start_ms)} – ${msPrecise(c.end_ms)}`}>
                C{i + 1} <span className="xs muted">{motionLabel(c.motion)}</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 14, alignItems: "stretch" }}>
            <div className="grow col" style={{ gap: 6 }}>
              <Badge tone="gray">Trước khi áp dụng hiệu ứng</Badge>
              <Thumb src={kf} ratio="9/16" />
            </div>
            <div style={{ display: "grid", placeItems: "center" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--grad)", display: "grid", placeItems: "center" }}><ArrowRight size={16} /></div>
            </div>
            <div className="grow col" style={{ gap: 6 }}>
              <Badge tone="purple" icon={<Check size={12} />}>Sau khi áp dụng · {motionLabel(motion)}</Badge>
              <div className="media" style={{ aspectRatio: "9/16", background: "#000" }}>
                {kf ? <img src={kf.startsWith("/api") ? kf : `/api/v1/files?path=${encodeURIComponent(kf)}`} alt="" style={afterStyle()} /> : <div className="ph-media" style={{ position: "absolute", inset: 0 }}><Film size={22} /></div>}
                {safeBox && (
                  <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: safeBox >= 9 / 16 ? "84%" : "84%", aspectRatio: String(safeBox), maxHeight: "68%", border: "1px dashed rgba(25,211,181,.9)", borderRadius: 4, pointerEvents: "none" }} />
                )}
                {safe === "all" && <div style={{ position: "absolute", left: "8%", right: "8%", top: "12%", bottom: "20%", border: "1px dashed rgba(25,211,181,.9)", borderRadius: 4, pointerEvents: "none" }} />}
              </div>
            </div>
          </div>
          <div className="row mt12">
            <button className="btn icon sm" onClick={() => setP(0)} title="Về đầu"><SkipBack size={14} /></button>
            <button className="btn icon sm" onClick={() => setPlaying((x) => !x)} title="Phát/Dừng minh hoạ">{playing ? <Pause size={14} /> : <Play size={14} />}</button>
            <span className="mono small">{msPrecise(p * dur)} / {msPrecise(dur)}</span>
            <input className="range grow" type="range" min={0} max={1000} value={Math.round(p * 1000)} onChange={(e) => { setPlaying(false); setP(Number(e.target.value) / 1000); }} />
          </div>
          <div className="row wrap mt12" style={{ gap: 8 }}>
            {MOTIONS.map((m) => (
              <button key={m.id} className={`chip ${motion === m.id ? "on" : ""}`} onClick={() => setDraft(m.id)}>
                <Move size={12} /> {m.label}
              </button>
            ))}
          </div>
          <div className="xs muted mt8">Minh hoạ dựng trên keyframe của cảnh nguồn, mô phỏng đúng biên độ của engine (zoom 8%, pan 12%).</div>
        </Card>

        {/* ---------------- params */}
        <Card title="Thông số hiệu ứng" icon={<Gauge size={16} />}>
          <div className="col" style={{ gap: 12 }}>
            <Field label="Hiệu ứng">
              <Select value={motion} onChange={(v) => setDraft(v)} options={MOTIONS.map((m) => ({ value: m.id, label: m.label }))} />
            </Field>
            <div className="kv">
              <span>Thời lượng</span><span>{dur} ms <span className="xs muted">(= độ dài clip, chỉnh trong <span className="link" onClick={() => nav(`/production/editor?v=${variantId}`)}>Editor</span>)</span></span>
              <span>Tỉ lệ (Scale)</span><span>{motion === "zoom_in" ? "100% → 108%" : motion === "zoom_out" ? "108% → 100%" : motion.startsWith("pan") ? "112% (cố định)" : "100%"} <span className="xs muted">· engine cố định</span></span>
            </div>
            <Field label={<span className="row">Đường cong (Easing) <PreviewOnly /></span>}>
              <Select value={easing} onChange={setEasing} options={Object.entries(EASINGS).map(([k, v]) => ({ value: k, label: v.label }))} />
            </Field>
            <Field label={<span className="row">Độ lệch (Offset) <PreviewOnly /></span>}>
              <div className="row">
                <span className="xs muted">X</span><input className="input" type="number" style={{ height: 32 }} value={offX} onChange={(e) => setOffX(Number(e.target.value) || 0)} />
                <span className="xs muted">Y</span><input className="input" type="number" style={{ height: 32 }} value={offY} onChange={(e) => setOffY(Number(e.target.value) || 0)} />
                <span className="xs muted">px</span>
              </div>
            </Field>
            <Field label={<span className="row">Độ mờ (Opacity) {opacity}% <PreviewOnly /></span>}>
              <input className="range" type="range" min={0} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
            </Field>
            <Field label="Vùng an toàn (Safe Areas) – lưới xem trước">
              <Seg value={safe} onChange={setSafe} options={[{ value: "all", label: "Nền tảng" }, { value: "16:9", label: "16:9" }, { value: "1:1", label: "1:1" }, { value: "9:16", label: "9:16" }]} />
            </Field>
            <Field label="Kiểu chuyển cảnh (Transition)">
              <select className="select" disabled title="Engine render hiện cắt thẳng giữa các cảnh"><option>Cắt thẳng (engine chưa hỗ trợ chuyển cảnh)</option></select>
            </Field>
            <div className="inner">
              <div className="row between"><span className="semi small">Ước tính chi phí render</span><Zap size={14} className="c-primary" /></div>
              {speed ? (
                <>
                  <div className="row between mt8"><span className="xs muted">Tốc độ đo được ({okRes[0]?.encoder})</span><b className="c-teal">{speed.toFixed(1)}× thời gian thực</b></div>
                  <div className="row between mt8"><span className="xs muted">Encode final video {totalS.toFixed(1)}s</span><b>≈ {(totalS / speed).toFixed(1)} giây</b></div>
                  <div className="row between mt8"><span className="xs muted">Clip có chuyển động</span><b>{motionClips}/{tl.tracks.video.length}</b></div>
                  <div className="xs muted mt8">Benchmark chỉ đo encode; mỗi clip được dựng lại riêng nên thời gian thực tế cao hơn.</div>
                </>
              ) : (
                <div className="row between mt8">
                  <span className="small t2">{benchQ.data?.running || bench ? "Đang chạy benchmark…" : "Chạy benchmark để ước tính"}</span>
                  <Btn size="sm" loading={!!benchQ.data?.running || bench} onClick={async () => { try { await api.post("/system/benchmark"); setBench(true); benchQ.reload(); } catch (e) { toastError(e); } }}>Chạy benchmark</Btn>
                </div>
              )}
            </div>
            {motion !== "none" && (clip.end_ms - clip.start_ms) < 1200 && <Warn title="Clip ngắn">Chuyển động trên clip &lt; 1,2 giây dễ gây giật; cân nhắc “Tĩnh”.</Warn>}
          </div>
        </Card>
      </div>

      {/* ---------------- keyframe timeline */}
      <Card className="mt16" title="Timeline chuyển động (Keyframe)" icon={<Diamond size={16} className="c-primary" />}
        right={
          <div className="row" style={{ gap: 10 }}>
            <span className="small t2">Phạm vi áp dụng:</span>
            <Seg value={scope} onChange={setScope} options={[
              { value: "clip", label: "Cảnh hiện tại" },
              { value: "asset", label: `Cùng tư liệu (${tl.tracks.video.filter((c) => c.asset_id === clip.asset_id).length})` },
              { value: "all", label: `Toàn video (${tl.tracks.video.length})` },
            ]} />
            <Btn kind="teal" size="sm" icon={<Check size={14} />} disabled={!pendingChange} title={pendingChange ? `Gán “${motionLabel(draft!)}” cho ${targets.length} clip` : "Chọn hiệu ứng khác với hiện tại"} onClick={apply}>
              Áp dụng cho {targets.length} clip
            </Btn>
          </div>
        }>
        <KeyframeTimeline tl={tl} ci={ci} motion={motion} p={p} dur={dur} onSeek={(x) => { setPlaying(false); setP(x); }} />
        <div className="row mt12 xs muted" style={{ gap: 12 }}>
          <Eye size={13} /> Chỉ Scale/Position (zoom, pan tuyến tính) được engine render. Opacity, easing, điểm nhấn là xem trước.
          <span className="grow" />
          <span className="link" onClick={() => nav(`/production/editor?v=${variantId}`)}>Mở trong Editor <ChevronRight size={12} /></span>
        </div>
      </Card>
      {doc.dirty && <div className="mt12"><Warn title="Có thay đổi chưa lưu">Bấm “Lưu hiệu ứng áp dụng” để ghi phiên bản storyboard mới – render preview/final sẽ dùng chuyển động mới.</Warn></div>}
    </>
  );

}

function KeyframeTimeline({ tl, ci, motion, p, dur, onSeek }: { tl: any; ci: number; motion: string; p: number; dur: number; onSeek: (p: number) => void }) {
  const clip = tl.tracks.video[ci];
  const rel = (ms: number) => Math.max(0, Math.min(1, (ms - clip.start_ms) / dur));
  const texts = [...tl.tracks.titles.map((x: any) => ({ ...x, k: "title" })), ...tl.tracks.captions.map((x: any) => ({ ...x, k: "cap" }))].filter((x: any) => x.start_ms < clip.end_ms && x.end_ms > clip.start_ms);
  const step = dur > 4000 ? 1000 : 500;
  const rows: Array<{ label: string; icon: React.ReactNode; content: React.ReactNode }> = [
    {
      label: "Scale (Phóng to)", icon: <Layers size={13} />,
      content: motion === "zoom_in" || motion === "zoom_out" || motion.startsWith("pan") ? <KfBar a={0} b={1} color="#8b6cff" labels={motion === "zoom_in" ? ["100%", "108%"] : motion === "zoom_out" ? ["108%", "100%"] : ["112%", "112%"]} /> : <span className="xs muted">Không có keyframe</span>,
    },
    {
      label: "Position (Vị trí)", icon: <Move size={13} />,
      content: motion.startsWith("pan") ? <KfBar a={0} b={1} color="#4f8bff" labels={motion === "pan_left" ? ["x +5%", "x −5%"] : ["x −5%", "x +5%"]} /> : <span className="xs muted">Giữa khung (cố định)</span>,
    },
    { label: "Opacity (Độ mờ)", icon: <Eye size={13} />, content: <span className="xs muted">100% cố định – engine chưa hỗ trợ keyframe opacity</span> },
    {
      label: "Text (Chữ thích)", icon: <Type size={13} />,
      content: texts.length ? texts.map((x: any, i: number) => (
        <div key={i} className="tl-clip" title={x.text} style={{ left: `${rel(x.start_ms) * 100}%`, width: `${(rel(x.end_ms) - rel(x.start_ms)) * 100}%`, top: x.k === "title" ? 2 : 15, bottom: x.k === "title" ? 15 : 2, background: x.k === "title" ? "rgba(155,92,246,.8)" : "rgba(25,211,181,.55)", fontSize: 10 }}>{x.text}</div>
      )) : <span className="xs muted">Không có chữ trong cảnh</span>,
    },
    { label: "Hiệu ứng điểm nhấn", icon: <Sparkles size={13} />, content: <span className="xs muted">Chưa hỗ trợ trong engine render</span> },
  ];
  return (
    <div className="tl">
      <div className="tl-ruler" style={{ gridTemplateColumns: "170px 1fr" }}>
        <div />
        <div style={{ position: "relative", cursor: "pointer" }} onMouseDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width); }}>
          {Array.from({ length: Math.floor(dur / step) + 1 }).map((_, i) => (
            <span key={i} style={{ position: "absolute", left: `${((i * step) / dur) * 100}%`, top: 4, transform: "translateX(-50%)" }}>{((i * step) / 1000).toFixed(step < 1000 ? 1 : 0)}s</span>
          ))}
        </div>
      </div>
      <div style={{ position: "relative" }}>
        {rows.map((r) => (
          <div key={r.label} className="tl-row" style={{ gridTemplateColumns: "170px 1fr", height: 34 }}>
            <div className="tl-label">{r.icon} {r.label}</div>
            <div className="tl-lane" style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onMouseDown={(e) => { const rr = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - rr.left) / rr.width); }}>{r.content}</div>
          </div>
        ))}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(170px + (100% - 170px) * ${p})`, width: 2, background: "var(--primary-2)", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

function KfBar({ a, b, color, labels }: { a: number; b: number; color: string; labels: [string, string] | string[] }) {
  return (
    <div style={{ position: "absolute", left: `${a * 100}%`, width: `${(b - a) * 100}%`, top: 12, height: 8, background: `${color}66`, borderRadius: 4 }}>
      {[0, 1].map((k) => (
        <span key={k} title={labels[k]} style={{ position: "absolute", left: k ? "calc(100% - 6px)" : -4, top: -2, width: 11, height: 11, background: color, transform: "rotate(45deg)", borderRadius: 2 }} />
      ))}
      <span className="xs" style={{ position: "absolute", left: 10, top: -14, color: "var(--text-2)" }}>{labels[0]}</span>
      <span className="xs" style={{ position: "absolute", right: 10, top: -14, color: "var(--text-2)" }}>{labels[1]}</span>
    </div>
  );
}
