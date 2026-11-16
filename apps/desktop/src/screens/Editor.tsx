import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowDown, ArrowUp, Captions, ChevronLeft, ChevronRight, Clapperboard, Film, Layers, Move, MousePointer2,
  Pause, Play, Plus, Redo2, Repeat, Save, Scissors, ShieldCheck, Sparkles, SplitSquareHorizontal, Trash2, Type, Undo2, Upload, Wand2, ZoomIn, ZoomOut,
} from "lucide-react";
import { api, fileUrl } from "../lib/api";
import { useApp } from "../lib/store";
import { dt, JOB_STATUS, ms, msPrecise } from "../lib/format";
import { Badge, Bar, Btn, Card, Empty, Field, InfoNote, JobStatus, Loading, PageHead, Seg, Tabs, Thumb, Toggle, VariantStatus, Warn, Select, ErrorBox } from "../components/ui";
import {
  activeAt, clipAt, isTyping, MOTIONS, motionLabel, NumInput, packVideo, PreviewCanvas, previewJobs, Sel, TimelineView,
  useCaptionStyle, usePlayer, useProjectMedia, useTimelineDoc, VariantGate, wrapCaption,
} from "../components/c_timeline";

const BEAT_LABEL: Record<string, string> = { hook: "Hook mở đầu", body: "Nội dung", cta: "CTA – Kêu gọi" };

export default function Editor() {
  return (
    <VariantGate title="dựng video">
      {(g) => <EditorInner key={g.variantId} variantId={g.variantId} picker={g.picker} />}
    </VariantGate>
  );
}

function EditorInner({ variantId, picker }: { variantId: string; picker: React.ReactNode }) {
  const nav = useNavigate();
  const { projectId, toast, toastError } = useApp();
  const [watch, setWatch] = useState(false);
  const doc = useTimelineDoc(variantId, watch ? 1500 : 10000);
  const { tl, commit, variant } = doc;
  const media = useProjectMedia(projectId);
  const cap = useCaptionStyle(tl?.template_id);
  const voiceUrl = tl?.tracks.voice_mix ? fileUrl(tl.tracks.voice_mix) : undefined;
  const player = usePlayer(tl?.duration_ms || 0, voiceUrl);
  const [sel, setSel] = useState<Sel | null>({ kind: "video", i: 0 });
  const [leftTab, setLeftTab] = useState("assets");
  const [assetFilter, setAssetFilter] = useState<string>("");
  const [midTab, setMidTab] = useState("story");
  const [mode, setMode] = useState<"source" | "render">("source");
  const [zoom, setZoom] = useState(60);
  const jobs = previewJobs(variant);

  useEffect(() => {
    if (watch && variant && !jobs.active) {
      setWatch(false);
      if (jobs.done) {
        toast({ kind: "success", title: "Render preview hoàn tất", body: "Chuyển sang chế độ “Bản render” để xem." });
        setMode("render");
      } else if (jobs.failed) toast({ kind: "error", title: "Render preview thất bại", body: jobs.failed.error_message || undefined, code: jobs.failed.error_code || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, variant, jobs.active?.id]);

  const beats: any[] = variant?.script_full?.beats_json?.beats || [];
  const curClip = sel?.kind === "video" && tl ? tl.tracks.video[sel.i] : undefined;

  // ---------------------------------------------------------------- edit ops
  const split = () => {
    if (!tl) return;
    const i = clipAt(tl, player.t);
    const c = tl.tracks.video[i];
    if (!c || player.t - c.start_ms < 200 || c.end_ms - player.t < 200) {
      toast({ kind: "warn", title: "Đặt đầu phát vào giữa một clip (cách mép ≥ 0,2 giây) để tách" });
      return;
    }
    commit((d) => {
      const a = d.tracks.video[i];
      const off = player.t - a.start_ms;
      const b = { ...a, start_ms: player.t, src_in_ms: a.src_in_ms + off };
      a.end_ms = player.t;
      a.src_out_ms = a.src_in_ms + off;
      b.src_out_ms = Math.max(b.src_in_ms + 100, b.src_out_ms);
      d.tracks.video.splice(i + 1, 0, b);
    });
    setSel({ kind: "video", i: i + 1 });
  };
  const trimAt = (edge: "in" | "out") => {
    if (!tl || sel?.kind !== "video" || !curClip) return;
    const t = player.t;
    if (t <= curClip.start_ms + 100 || t >= curClip.end_ms - 100) {
      toast({ kind: "warn", title: "Đầu phát phải nằm trong clip đang chọn để cắt" });
      return;
    }
    commit((d) => {
      const c = d.tracks.video[sel.i];
      if (edge === "in") {
        const delta = t - c.start_ms;
        c.src_in_ms += delta;
        c.end_ms -= delta;
      } else {
        c.end_ms = t;
        c.src_out_ms = c.src_in_ms + (t - c.start_ms);
      }
      packVideo(d);
    });
  };
  const move = (dir: -1 | 1, idx = sel?.kind === "video" ? sel.i : -1) => {
    if (!tl || idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= tl.tracks.video.length) return;
    commit((d) => {
      const v = d.tracks.video;
      [v[idx], v[j]] = [v[j], v[idx]];
      packVideo(d);
    });
    setSel({ kind: "video", i: j });
  };
  const remove = () => {
    if (!tl || !sel) return;
    if (sel.kind === "video" && tl.tracks.video.length <= 1) {
      toast({ kind: "warn", title: "Timeline cần ít nhất 1 clip" });
      return;
    }
    commit((d) => {
      if (sel.kind === "video") {
        d.tracks.video.splice(sel.i, 1);
        packVideo(d);
      } else if (sel.kind === "caption") d.tracks.captions.splice(sel.i, 1);
      else d.tracks.titles.splice(sel.i, 1);
    });
    setSel(null);
  };
  const addTitle = () => {
    if (!tl) return;
    const s = Math.round(player.t);
    commit((d) => {
      d.tracks.titles.push({ start_ms: s, end_ms: Math.min(Math.max(s + 2000, s + 500), Math.max(d.duration_ms, s + 500)), text: "Tiêu đề mới", style: "callout" });
      d.tracks.titles.sort((a, b) => a.start_ms - b.start_ms);
    });
    setTimeout(() => setSel({ kind: "title", i: (tl.tracks.titles.filter((x) => x.start_ms <= s).length) }), 0);
  };
  const addCaption = () => {
    if (!tl) return;
    const s = Math.round(player.t);
    if (activeAt(tl.tracks.captions, s) >= 0) {
      toast({ kind: "warn", title: "Đã có phụ đề tại vị trí này – chọn phụ đề đó để sửa" });
      return;
    }
    const next = tl.tracks.captions.find((c) => c.start_ms > s);
    commit((d) => {
      d.tracks.captions.push({ start_ms: s, end_ms: Math.min(s + 2000, next ? next.start_ms : s + 2000), text: "Phụ đề mới" });
      d.tracks.captions.sort((a, b) => a.start_ms - b.start_ms);
    });
    setTimeout(() => setSel({ kind: "caption", i: tl.tracks.captions.filter((x) => x.start_ms <= s).length }), 0);
  };
  const setMotion = (m: string) => {
    if (sel?.kind !== "video") return;
    commit((d) => {
      d.tracks.video[sel.i].motion = m;
    });
  };
  const replaceScene = (sc: any) => {
    if (sel?.kind !== "video" || !curClip) {
      toast({ kind: "warn", title: "Chọn một clip trên timeline trước khi thay cảnh" });
      return;
    }
    commit((d) => {
      const c = d.tracks.video[sel.i];
      const dur = c.end_ms - c.start_ms;
      const len = sc.end_ms - sc.start_ms;
      c.scene_id = sc.id;
      c.asset_id = sc.asset_id;
      c.src_in_ms = sc.start_ms + (len > dur ? Math.floor((len - dur) / 2) : 0);
      c.src_out_ms = c.src_in_ms + Math.min(dur, len);
      c.loop = len < dur;
      c.fallback = false;
    });
    toast({ kind: "success", title: `Đã thay cảnh cho C${sel.i + 1}` });
  };

  const renderPreview = async () => {
    try {
      if (doc.dirty) await doc.save(true);
      await api.post(`/variants/${variantId}/preview`, {});
      setWatch(true);
      doc.q.reload();
      toast({ kind: "success", title: "Đã đưa render preview vào hàng đợi" });
      return true;
    } catch (e) {
      toastError(e, "Không tạo được job preview");
      return undefined;
    }
  };

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space") {
        e.preventDefault();
        player.toggle();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doc.redo();
        else doc.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doc.redo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        doc.save().catch(() => undefined);
      } else if (!mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        split();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      } else if (e.key === "ArrowLeft") player.setT(player.t - (e.shiftKey ? 1000 : 100));
      else if (e.key === "ArrowRight") player.setT(player.t + (e.shiftKey ? 1000 : 100));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const scenesOf = useMemo(() => (media.scenes.data || []).filter((s) => !assetFilter || s.asset_id === assetFilter), [media.scenes.data, assetFilter]);

  if (doc.q.loading && !variant) return <Loading rows={6} h={22} />;
  if (doc.q.error && !doc.variant) return <ErrorBox error={doc.q.error} onRetry={doc.q.reload} />;
  if (!tl && doc.storyboard) return <Loading rows={6} h={22} />;
  if (!tl) {
    return (
      <Empty title="Biến thể này chưa có storyboard" action={<button className="btn primary" onClick={() => nav(`/creative/storyboard?v=${variantId}`)}>Dựng storyboard</button>}>
        {picker}
      </Empty>
    );
  }
  const clipName = (c: any, i: number) => `C${i + 1} · ${media.scenesById[c.scene_id]?.label || media.assetsById[c.asset_id]?.file_name || "cảnh"}`;
  const curScene = curClip ? media.scenesById[curClip.scene_id] : undefined;
  const curAsset = curClip ? media.assetsById[curClip.asset_id] : undefined;
  const capsByClip = (i: number) => {
    const c = tl.tracks.video[i];
    return tl.tracks.captions.find((x) => x.beat === i) || tl.tracks.captions.find((x) => x.start_ms < c.end_ms && x.end_ms > c.start_ms);
  };
  const warnings = [
    ...(tl.gaps || []).map((g: any) => ({ code: g.code, text: g.suggest_shot || g.message })),
    ...tl.tracks.video.map((c, i) => (c.fallback ? { code: "FALLBACK", text: `C${i + 1}: dùng cảnh thay thế, chưa đúng loại shot` } : null)).filter(Boolean) as any[],
    ...tl.tracks.video.map((c, i) => (c.loop ? { code: "LOOP", text: `C${i + 1}: cảnh nguồn ngắn hơn đoạn dựng – sẽ lặp lại` } : null)).filter(Boolean) as any[],
    ...tl.tracks.captions.map((c, i) => (wrapCaption(c.text, cap.style).length > cap.style.max_lines ? { code: "TC-009", text: `Phụ đề ${i + 1} vượt ${cap.style.max_lines} dòng – sẽ bị cắt “…”` } : null)).filter(Boolean) as any[],
  ];
  const stale = jobs.done && doc.storyboard && doc.storyboard.created_at > (jobs.done.finished_at || "");

  return (
    <>
      <PageHead
        title="Smart Video Editor"
        sub={<span>Dựng video từ footage thật: chỉnh sửa nhiều lớp, thay cảnh, tối ưu nhịp dựng và CTA. {variant && <VariantStatus status={variant.status} />}</span>}
        icon={<Clapperboard size={22} />}
        actions={
          <>
            <Field label="Biến thể">{picker}</Field>
            <Field label="Chế độ xem">
              <Seg value={mode} onChange={setMode} options={[{ value: "source", label: "Nguồn" }, { value: "render", label: "Bản render" }]} />
            </Field>
            <button className="btn icon" title="Hoàn tác (⌘/Ctrl+Z)" disabled={!doc.canUndo} onClick={doc.undo}><Undo2 size={16} /></button>
            <button className="btn icon" title="Làm lại (⌘/Ctrl+Shift+Z)" disabled={!doc.canRedo} onClick={doc.redo}><Redo2 size={16} /></button>
            <Btn icon={<Save size={16} />} disabled={!doc.dirty} title={doc.dirty ? "Lưu timeline (⌘/Ctrl+S)" : "Không có thay đổi"} onClick={() => doc.save().then(() => true).catch(() => undefined)}>
              Lưu{doc.dirty ? " *" : ""}
            </Btn>
            <Btn kind="primary" icon={<Play size={16} />} disabled={!!jobs.active} title={jobs.active ? "Đang có job preview chạy" : "Lưu & render bản xem trước 540p"} onClick={renderPreview}>
              Render Preview
            </Btn>
          </>
        }
      />

      {jobs.active && (
        <div className="card flat row mb12" style={{ padding: 12 }}>
          <Film size={16} className="c-cyan" />
          <span className="semi">Render preview</span>
          <JobStatus status={jobs.active.status} />
          <Bar value={(jobs.active.progress || 0) * 100} tone="teal" style={{ flex: 1 }} />
          <b>{Math.round((jobs.active.progress || 0) * 100)}%</b>
          <span className="link small" onClick={() => nav("/production/queue")}>Mở hàng đợi →</span>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "250px minmax(280px, 0.95fr) minmax(300px, 1.15fr) 290px", alignItems: "stretch" }}>
        {/* ---------------- assets */}
        <Card style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <Tabs value={leftTab} onChange={setLeftTab} tabs={[{ id: "assets", label: "Tư liệu dự án" }, { id: "scenes", label: `Cảnh (${media.scenes.data?.length ?? 0})` }]} />
          <div className="row mb12">
            <Btn kind="primary" size="sm" icon={<Upload size={14} />} onClick={() => nav("/media")} className="grow">Nhập tư liệu</Btn>
          </div>
          <div style={{ overflowY: "auto", maxHeight: 420 }}>
            {leftTab === "assets" ? (
              media.assets.loading && !media.assets.data ? <Loading /> : !media.assets.data?.length ? (
                <Empty title="Chưa có tư liệu" />
              ) : (
                <div className="grid g2" style={{ gap: 10 }}>
                  {media.assets.data.map((a) => {
                    const used = tl.tracks.video.filter((c) => c.asset_id === a.id).length;
                    return (
                      <div key={a.id} onClick={() => { setAssetFilter(a.id); setLeftTab("scenes"); }} style={{ cursor: "pointer" }} title="Xem các cảnh của tư liệu này">
                        <Thumb src={a.meta_json?.thumbnail} ratio="1/1" duration={ms(a.meta_json?.duration_ms)} label={used ? <Badge tone="purple">{used} clip</Badge> : undefined} />
                        <div className="xs t2 ellipsis mt8">{a.file_name}</div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="col" style={{ gap: 8 }}>
                {assetFilter && (
                  <div className="row between xs"><span className="muted ellipsis">{media.assetsById[assetFilter]?.file_name}</span><span className="link" onClick={() => setAssetFilter("")}>Tất cả</span></div>
                )}
                {!scenesOf.length && <Empty title="Chưa có cảnh – phân tích video trước" />}
                {scenesOf.map((s) => (
                  <div key={s.id} className={`list-item ${curClip?.scene_id === s.id ? "on" : ""}`} style={{ padding: 8 }}>
                    <Thumb src={s.keyframe} ratio="1/1" style={{ width: 44 }} />
                    <div className="grow">
                      <div className="small semi ellipsis">{s.label || `Cảnh ${s.idx + 1}`}</div>
                      <div className="xs muted">{msPrecise(s.start_ms)} – {msPrecise(s.end_ms)}</div>
                    </div>
                    <button className="btn xs" disabled={sel?.kind !== "video"} title={sel?.kind === "video" ? `Thay cảnh cho C${sel.i + 1}` : "Chọn clip trên timeline trước"} onClick={() => replaceScene(s)}>Dùng</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ---------------- preview */}
        <Card style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {mode === "render" ? (
            jobs.done ? (
              <>
                <video key={jobs.done.output_uri} className="video-player" controls src={fileUrl(jobs.done.output_uri)} style={{ maxHeight: 470, width: "auto", maxWidth: "100%", aspectRatio: "9/16" }} />
                <div className="xs muted mt8">Preview render lúc {dt(jobs.done.finished_at)}</div>
                {stale && <div className="xs c-orange mt8">Timeline đã sửa sau lần render này – bấm Render Preview để cập nhật.</div>}
              </>
            ) : (
              <Empty title="Chưa có bản render preview">Bấm “Render Preview” để dựng bản xem trước bằng engine thật.</Empty>
            )
          ) : (
            <>
              <PreviewCanvas tl={tl} assetsById={media.assetsById} t={player.t} playing={player.playing} captionStyle={cap.style} accent={cap.accent} width={262} />
              {player.audio}
              <div className="row mt12" style={{ width: "100%" }}>
                <button className="btn icon sm" title="Clip trước" onClick={() => { const i = clipAt(tl, player.t); player.setT(tl.tracks.video[Math.max(0, i - (player.t - (tl.tracks.video[i]?.start_ms ?? 0) < 300 ? 1 : 0))]?.start_ms ?? 0); }}><ChevronLeft size={15} /></button>
                <button className="btn icon" title="Phát/Dừng (Space)" onClick={player.toggle} style={{ background: "var(--grad)", borderColor: "transparent" }}>{player.playing ? <Pause size={16} /> : <Play size={16} />}</button>
                <button className="btn icon sm" title="Clip sau" onClick={() => { const i = clipAt(tl, player.t); const n = tl.tracks.video[i + 1]; if (n) player.setT(n.start_ms); }}><ChevronRight size={15} /></button>
                <span className="mono small">{msPrecise(player.t)} / {msPrecise(tl.duration_ms)}</span>
                <span className="grow" />
                <Badge tone="gray">{tl.canvas?.aspect || "9:16"}</Badge>
              </div>
              <input className="range mt8" type="range" min={0} max={tl.duration_ms} value={player.t} onChange={(e) => player.setT(Number(e.target.value))} />
              {!voiceUrl && <div className="xs muted mt8">Chưa có giọng đọc – xem trước không có tiếng.</div>}
            </>
          )}
        </Card>

        {/* ---------------- narrative / shot inspector */}
        <Card title="AI Ngữ cảnh & Shot Inspector" icon={<Sparkles size={16} className="c-primary" />} style={{ display: "flex", flexDirection: "column" }}>
          <Tabs value={midTab} onChange={setMidTab} pill tabs={[{ id: "story", label: "Kịch bản & nhịp dựng" }, { id: "shots", label: "Shot inspector" }, { id: "warn", label: `Cảnh báo (${warnings.length})` }]} />
          <div className="mt12" style={{ overflowY: "auto", maxHeight: 430 }}>
            {midTab === "story" && (
              <div className="col" style={{ gap: 8 }}>
                <div className="small semi row"><Film size={14} /> Câu chuyện video ({tl.tracks.video.length} cảnh · {ms(tl.duration_ms)})</div>
                {tl.tracks.video.map((c, i) => {
                  const sc = media.scenesById[c.scene_id];
                  const b = beats[i];
                  const capI = capsByClip(i);
                  return (
                    <div key={i} className={`list-item ${sel?.kind === "video" && sel.i === i ? "on" : ""}`} style={{ padding: 8 }} onClick={() => { setSel({ kind: "video", i }); player.setT(c.start_ms); }}>
                      <div className="col" style={{ gap: 2 }}>
                        <button className="btn xs ghost" disabled={i === 0} title="Đưa lên" onClick={(e) => { e.stopPropagation(); move(-1, i); }}><ArrowUp size={12} /></button>
                        <button className="btn xs ghost" disabled={i === tl.tracks.video.length - 1} title="Đưa xuống" onClick={(e) => { e.stopPropagation(); move(1, i); }}><ArrowDown size={12} /></button>
                      </div>
                      <Thumb src={sc?.keyframe} ratio="1/1" style={{ width: 48 }} />
                      <div className="grow">
                        <div className="small semi ellipsis">C{i + 1} · {b ? BEAT_LABEL[b.type] || b.type : sc?.label || "Cảnh"}</div>
                        <div className="xs t2" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{capI?.text || b?.text || "—"}</div>
                        <div className="row mt8" style={{ gap: 4 }}>
                          <Badge tone="purple">{motionLabel(c.motion)}</Badge>
                          {c.loop && <Badge tone="orange">Lặp</Badge>}
                          {c.fallback && <Badge tone="red">Cảnh thay thế</Badge>}
                        </div>
                      </div>
                      <span className="badge b-gray mono">{msPrecise(c.start_ms)}–{msPrecise(c.end_ms)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {midTab === "shots" && (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>#</th><th>Cảnh nguồn</th><th>Vào → Ra</th><th>Dài</th><th>Chuyển động</th><th>Chất lượng</th></tr></thead>
                  <tbody>
                    {tl.tracks.video.map((c, i) => {
                      const sc = media.scenesById[c.scene_id];
                      return (
                        <tr key={i} className={sel?.kind === "video" && sel.i === i ? "sel" : ""} style={{ cursor: "pointer" }} onClick={() => { setSel({ kind: "video", i }); player.setT(c.start_ms); }}>
                          <td>C{i + 1}</td>
                          <td className="ellipsis" style={{ maxWidth: 140 }}>{sc?.label || "—"}<div className="xs muted">{(sc?.tags_json || []).slice(0, 3).join(", ")}</div></td>
                          <td className="mono">{msPrecise(c.src_in_ms)} → {msPrecise(c.src_out_ms)}</td>
                          <td>{((c.end_ms - c.start_ms) / 1000).toFixed(1)}s</td>
                          <td>{motionLabel(c.motion)}</td>
                          <td>{sc?.quality_json?.score ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {midTab === "warn" && (
              warnings.length ? (
                <div className="col" style={{ gap: 8 }}>
                  {warnings.map((w, i) => (
                    <div key={i} className="list-item" style={{ cursor: "default" }}><AlertTriangle size={15} className={w.code.startsWith("BLOCK") ? "c-red" : "c-orange"} /><span className="small grow">{w.text}</span><span className="mono xs muted">{w.code}</span></div>
                  ))}
                </div>
              ) : <Empty title="Không có cảnh báo" >Footage đủ cảnh, phụ đề trong giới hạn dòng.</Empty>
            )}
          </div>
        </Card>

        {/* ---------------- properties */}
        <Card title="Thuộc tính đã chọn" right={sel && <Badge tone="purple">{sel.kind === "video" ? `C${sel.i + 1}` : sel.kind === "caption" ? `Phụ đề ${sel.i + 1}` : `Tiêu đề ${sel.i + 1}`}</Badge>}>
          {!sel || (sel.kind === "video" && !curClip) || (sel.kind === "caption" && !tl.tracks.captions[sel.i]) || (sel.kind === "title" && !tl.tracks.titles[sel.i]) ? (
            <Empty title="Chọn một clip, phụ đề hoặc tiêu đề trên timeline" />
          ) : sel.kind === "video" && curClip ? (
            <div className="col" style={{ gap: 10 }}>
              <div className="row">
                <Thumb src={curScene?.keyframe || curAsset?.meta_json?.thumbnail} ratio="1/1" style={{ width: 64 }} />
                <div className="grow">
                  <div className="semi ellipsis">{curAsset?.file_name || "—"}</div>
                  <div className="xs muted">{msPrecise(curClip.start_ms)} – {msPrecise(curClip.end_ms)} ({((curClip.end_ms - curClip.start_ms) / 1000).toFixed(2)}s)</div>
                  <div className="xs muted">{curAsset?.meta_json?.width}×{curAsset?.meta_json?.height} · {curAsset?.meta_json?.fps} fps</div>
                </div>
              </div>
              <Field label="Điểm vào nguồn (ms)">
                <NumInput value={curClip.src_in_ms} min={0} max={Math.max(0, (curAsset?.meta_json?.duration_ms ?? 1e9) - 100)} onChange={(v) => commit((d) => { const c = d.tracks.video[sel.i]; const len = c.src_out_ms - c.src_in_ms; c.src_in_ms = v; c.src_out_ms = v + len; })} />
              </Field>
              <Field label="Thời lượng trên timeline (ms)">
                <NumInput value={curClip.end_ms - curClip.start_ms} min={300} max={20000} onChange={(v) => commit((d) => { const c = d.tracks.video[sel.i]; c.end_ms = c.start_ms + v; c.src_out_ms = c.src_in_ms + v; packVideo(d); })} />
              </Field>
              <Field label="Chuyển động (Motion)">
                <Select value={curClip.motion || "none"} onChange={setMotion} options={MOTIONS.map((m) => ({ value: m.id, label: m.label }))} />
              </Field>
              <div className="row between small"><span className="t2">Lặp cảnh nếu nguồn ngắn</span><Toggle on={!!curClip.loop} onChange={(v) => commit((d) => { d.tracks.video[sel.i].loop = v; })} /></div>
              <div className="row" style={{ gap: 6 }}>
                <Btn size="sm" icon={<ArrowUp size={13} />} disabled={sel.i === 0} onClick={() => move(-1)}>Lên</Btn>
                <Btn size="sm" icon={<ArrowDown size={13} />} disabled={sel.i === tl.tracks.video.length - 1} onClick={() => move(1)}>Xuống</Btn>
                <Btn size="sm" kind="danger" icon={<Trash2 size={13} />} onClick={remove} title="Xoá clip (Delete)">Xoá</Btn>
              </div>
              <div className="divider" style={{ margin: "4px 0" }} />
              <div className="card-title" style={{ fontSize: 13 }}><Wand2 size={14} className="c-primary" /> Hành động cho cảnh này</div>
              {[
                { l: "Thay cảnh bằng tư liệu phù hợp", icon: <Repeat size={14} />, fn: () => { setAssetFilter(""); setLeftTab("scenes"); } },
                { l: "Hiệu ứng chuyển động", icon: <Move size={14} />, fn: () => nav(`/production/motion?v=${variantId}`) },
                { l: "Chỉnh phụ đề", icon: <Captions size={14} />, fn: () => nav(`/production/subtitles?v=${variantId}`) },
                { l: "Kiểm tra QC / CTA", icon: <ShieldCheck size={14} />, fn: () => nav(`/review/qc?v=${variantId}`) },
              ].map((a) => (
                <div key={a.l} className="list-item" style={{ padding: 8 }} onClick={a.fn}>{a.icon}<span className="small grow">{a.l}</span><Plus size={14} className="c-primary" /></div>
              ))}
            </div>
          ) : sel.kind === "caption" ? (
            <CaptionProps item={tl.tracks.captions[sel.i]} style={cap.style} onChange={(fn) => commit((d) => fn(d.tracks.captions[sel.i]))} onDelete={remove} />
          ) : (
            <div className="col" style={{ gap: 10 }}>
              <Field label="Nội dung tiêu đề">
                <textarea className="textarea" value={tl.tracks.titles[sel.i].text} onChange={(e) => { const v = e.target.value; commit((d) => { d.tracks.titles[sel.i].text = v; }); }} />
              </Field>
              <Field label="Kiểu">
                <Select value={tl.tracks.titles[sel.i].style || "callout"} onChange={(v) => commit((d) => { d.tracks.titles[sel.i].style = v; })} options={[{ value: "hook", label: "Hook (to, phía trên)" }, { value: "callout", label: "Callout" }, { value: "cta", label: "CTA (giữa dưới)" }]} />
              </Field>
              <div className="grid g2" style={{ gap: 8 }}>
                <Field label="Bắt đầu (ms)"><NumInput value={tl.tracks.titles[sel.i].start_ms} min={0} onChange={(v) => commit((d) => { const x = d.tracks.titles[sel.i]; x.start_ms = Math.min(v, x.end_ms - 200); })} /></Field>
                <Field label="Kết thúc (ms)"><NumInput value={tl.tracks.titles[sel.i].end_ms} min={0} onChange={(v) => commit((d) => { const x = d.tracks.titles[sel.i]; x.end_ms = Math.max(v, x.start_ms + 200); })} /></Field>
              </div>
              <Btn size="sm" kind="danger" icon={<Trash2 size={13} />} onClick={remove}>Xoá tiêu đề</Btn>
            </div>
          )}
        </Card>
      </div>

      {/* ---------------- toolbar + timeline */}
      <Card className="mt16">
        <div className="row wrap mb12" style={{ gap: 6 }}>
          <button className="btn sm" title="Chọn" onClick={() => setSel(null)}><MousePointer2 size={14} /></button>
          <span className="divider" style={{ width: 1, height: 22, margin: "0 4px" }} />
          <Btn size="sm" icon={<Scissors size={14} />} disabled={sel?.kind !== "video"} title="Cắt đầu clip tới đầu phát" onClick={() => trimAt("in")}>Trim đầu</Btn>
          <Btn size="sm" icon={<Scissors size={14} style={{ transform: "scaleX(-1)" }} />} disabled={sel?.kind !== "video"} title="Cắt cuối clip tại đầu phát" onClick={() => trimAt("out")}>Trim cuối</Btn>
          <Btn size="sm" icon={<SplitSquareHorizontal size={14} />} title="Tách clip tại đầu phát (S)" onClick={split}>Split</Btn>
          <Btn size="sm" icon={<Layers size={14} />} disabled={sel?.kind !== "video" || sel.i === 0} title="Đổi chỗ với clip trước" onClick={() => move(-1)}>Rearrange ←</Btn>
          <Btn size="sm" disabled={sel?.kind !== "video" || !tl || sel.i >= tl.tracks.video.length - 1} title="Đổi chỗ với clip sau" onClick={() => move(1)}>→</Btn>
          <Btn size="sm" icon={<Type size={14} />} title="Thêm tiêu đề tại đầu phát" onClick={addTitle}>Title</Btn>
          <Btn size="sm" icon={<Captions size={14} />} title="Thêm phụ đề tại đầu phát" onClick={addCaption}>Caption</Btn>
          <div className="row" style={{ gap: 6 }} title={sel?.kind === "video" ? "Chuyển động cho clip đang chọn" : "Chọn clip video để đặt chuyển động"}>
            <Move size={14} className="muted" />
            <Select value={curClip?.motion || "none"} disabled={sel?.kind !== "video"} onChange={setMotion} options={MOTIONS.map((m) => ({ value: m.id, label: `Motion: ${m.label}` }))} style={{ height: 28, width: 160, fontSize: 12 }} />
          </div>
          <Btn size="sm" kind="danger" icon={<Trash2 size={14} />} disabled={!sel} title="Xoá mục đang chọn (Delete)" onClick={remove} />
          <span className="grow" />
          <span className="xs muted">Space phát · S tách · Del xoá · ⌘Z / ⇧⌘Z</span>
          <ZoomOut size={14} className="muted" />
          <input type="range" className="range" min={25} max={160} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: 110 }} />
          <ZoomIn size={14} className="muted" />
        </div>
        <TimelineView tl={tl} t={player.t} onSeek={player.setT} sel={sel} onSelect={(s) => { setSel(s); }} pxPerSec={zoom} clipName={clipName} />
        <div className="row mt12 xs muted" style={{ gap: 14 }}>
          <span>Phiên bản storyboard v{doc.storyboard?.version} · {doc.storyboard?.status === "edited" ? "đã chỉnh tay" : "AI dựng"} · {dt(doc.storyboard?.created_at)}</span>
          {jobs.done && <span>Preview gần nhất: <JobStatus status="COMPLETED" /> {dt(jobs.done.finished_at)}</span>}
          {jobs.failed && <span className="c-red">Preview lỗi: {jobs.failed.error_code} – {jobs.failed.error_message} ({JOB_STATUS.FAILED.label})</span>}
        </div>
      </Card>
      <div className="mt12">
        <InfoNote>Engine render hiện hỗ trợ: cắt/ghép clip theo điểm vào nguồn, lặp cảnh, chuyển động zoom/pan, tiêu đề (hook/callout/CTA) và phụ đề. B-roll V2, SFX và nhạc nền tự động chưa có trong engine nên không hiển thị như track chỉnh được.</InfoNote>
      </div>
      {doc.dirty && <div className="mt12"><Warn title="Có thay đổi chưa lưu">Bấm “Lưu” (⌘/Ctrl+S) để tạo phiên bản storyboard mới. Render Preview sẽ tự lưu trước khi render.</Warn></div>}
    </>
  );
}

function CaptionProps({ item, style, onChange, onDelete }: { item: any; style: any; onChange: (fn: (c: any) => void) => void; onDelete: () => void }) {
  const lines = wrapCaption(item.text, style);
  const words = item.text.split(/\s+/).filter(Boolean).length;
  return (
    <div className="col" style={{ gap: 10 }}>
      <Field label="Nội dung phụ đề">
        <textarea className="textarea" value={item.text} onChange={(e) => { const v = e.target.value; onChange((c) => { c.text = v; delete c.words; }); }} />
      </Field>
      <div className="xs muted">{words} từ · ~{lines.length} dòng {item.words ? "· có mốc từng từ" : "· mốc từ sẽ tạo lại khi tạo giọng"}</div>
      {(lines.length > style.max_lines || words > 16) && <Warn title="Phụ đề quá dài (TC-009)">Nên dưới {style.max_lines} dòng, ~14–16 từ/dòng.</Warn>}
      <div className="grid g2" style={{ gap: 8 }}>
        <Field label="Vào (ms)"><NumInput value={item.start_ms} min={0} onChange={(v) => onChange((c) => { c.start_ms = Math.min(v, c.end_ms - 200); })} /></Field>
        <Field label="Ra (ms)"><NumInput value={item.end_ms} min={0} onChange={(v) => onChange((c) => { c.end_ms = Math.max(v, c.start_ms + 200); })} /></Field>
      </div>
      <Btn size="sm" kind="danger" icon={<Trash2 size={13} />} onClick={onDelete}>Xoá phụ đề</Btn>
    </div>
  );
}
