import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, CheckCircle2, Lock, Merge, Pencil, RefreshCw, Scissors, Unlock, X } from "lucide-react";
import { api, fileUrl, useApi } from "../lib/api";
import { ms, msPrecise, RIGHTS, SHOT_TAGS } from "../lib/format";
import { useApp } from "../lib/store";
import { Badge, Bar, Btn, Card, Empty, ErrorBox, Field, JobStatus, Loading, Modal, NeedProject, PageHead, Tabs, Warn } from "../components/ui";
import { ACTIVE_JOB, playablePath } from "../components/a_flow";

const REVIEW: Record<string, { label: string; tone: any }> = {
  pending: { label: "Chờ duyệt", tone: "orange" },
  approved: { label: "Đã duyệt", tone: "teal" },
  rejected: { label: "Đã loại", tone: "red" },
};

const USE_HINT: Array<[string, string]> = [
  ["cta", "Kết / CTA"],
  ["before_after", "Trước / sau"],
  ["demonstration", "Hướng dẫn / Demo"],
  ["presenter", "Người dẫn / Giải đáp"],
  ["packshot", "Hook / Giới thiệu"],
  ["packaging", "Giới thiệu bao bì"],
  ["face", "Trải nghiệm người dùng"],
  ["hand", "Thao tác cận tay"],
  ["close_up", "Chi tiết cận cảnh"],
  ["insert", "Insert / chuyển cảnh"],
];
const hintFor = (tags: string[]) => USE_HINT.filter(([t]) => tags.includes(t)).slice(0, 2).map(([, l]) => l).join(" · ") || "—";
const sceneCode = (i: number) => `SCENE_${String(i + 1).padStart(3, "0")}`;

export default function VideoAnalyzer() {
  const { projectId } = useApp();
  return <NeedProject projectId={projectId}>{projectId && <AnalyzerBody key={projectId} projectId={projectId} />}</NeedProject>;
}

function AnalyzerBody({ projectId }: { projectId: string }) {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { toast, toastError } = useApp();
  const videos = useApi<any[]>("/assets", { project_id: projectId, media_type: "video" });
  const models = useApi<any>("/models");
  const asrReady = !!models.data?.models?.find((m: any) => m.kind === "asr")?.installed;
  const list = videos.data || [];
  const qAsset = sp.get("asset");
  const aid = qAsset && list.some((a) => a.id === qAsset) ? qAsset : list.length ? list[list.length - 1].id : qAsset;

  const [poll, setPoll] = useState<number | undefined>(undefined);
  const q = useApi<any>(aid ? `/assets/${aid}` : null, undefined, poll);
  const a = q.data && q.data.id === aid ? q.data : undefined;
  const jobs: any[] = a?.jobs || [];
  const analysisJob = jobs.find((j) => j.kind === "analysis");
  const running = !!analysisJob && ACTIVE_JOB.includes(analysisJob.status);
  const proxyRunning = jobs.some((j) => j.kind === "proxy" && ACTIVE_JOB.includes(j.status));
  useEffect(() => setPoll(running || proxyRunning ? 1500 : undefined), [running, proxyRunning]);
  // khi job vừa xong → nạp lại danh sách (scene_count)
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) {
      videos.reload();
      if (analysisJob?.status === "COMPLETED") toast({ kind: "success", title: "Phân tích hoàn tất", body: `${a?.scenes?.length || 0} cảnh được nhận diện` });
      if (analysisJob?.status === "FAILED") toast({ kind: "error", title: "Phân tích thất bại", code: analysisJob.error_code, body: analysisJob.error_message });
    }
    wasRunning.current = running;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const scenes: any[] = a?.scenes || [];
  const [selScene, setSelScene] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState("transcript");
  const [editing, setEditing] = useState<any>(null);
  const [splitting, setSplitting] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [curMs, setCurMs] = useState(0);

  useEffect(() => {
    setChecked((s) => new Set([...s].filter((id) => scenes.some((x) => x.id === id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes.map((s) => s.id).join()]);

  function pickAsset(id: string) {
    const n = new URLSearchParams(sp);
    n.set("asset", id);
    setSp(n, { replace: true });
    setChecked(new Set());
    setSelScene(null);
  }

  function seek(s: any) {
    setSelScene(s.id);
    const v = videoRef.current;
    if (v) {
      v.currentTime = s.start_ms / 1000;
      v.play().catch(() => undefined);
    }
  }

  async function patchScene(s: any, body: Record<string, unknown>, msg?: string) {
    try {
      await api.patch(`/scenes/${s.id}`, body);
      if (msg) toast({ kind: "success", title: msg });
      q.reload();
      return true;
    } catch (e) {
      toastError(e, "Không cập nhật được cảnh");
      return undefined;
    }
  }

  async function bulkReview(review: "approved" | "rejected") {
    const ids = [...checked];
    try {
      await Promise.all(ids.map((id) => api.patch(`/scenes/${id}`, { review })));
      toast({ kind: "success", title: review === "approved" ? `Đã duyệt ${ids.length} cảnh` : `Đã loại ${ids.length} cảnh`, body: review === "approved" ? "Cảnh đã duyệt sẵn sàng dùng trong sản xuất." : "Cảnh bị loại sẽ không được dùng để dựng video." });
      setChecked(new Set());
      q.reload();
      return true;
    } catch (e) {
      toastError(e, "Không cập nhật được trạng thái cảnh");
      q.reload();
      return undefined;
    }
  }

  async function merge() {
    const ids = [...checked];
    try {
      await api.post("/scenes/merge", ids);
      toast({ kind: "success", title: `Đã gộp ${ids.length} cảnh` });
      setChecked(new Set());
      q.reload();
      return true;
    } catch (e) {
      toastError(e, "Không gộp được cảnh");
      return undefined;
    }
  }

  async function reanalyze() {
    if (!a) return undefined;
    const p = analysisJob?.profile_json || {};
    const body = { asset_id: a.id, scene_detect: p.scene_detect ?? true, asr: p.asr ?? true, ocr: p.ocr ?? true, quality: p.quality ?? true, threshold: p.threshold ?? 0.3 };
    try {
      await api.post("/analysis/jobs", body);
      toast({ kind: "success", title: "Đã đưa vào hàng đợi phân tích", body: "Các cảnh đã khoá được giữ nguyên." });
      setPoll(1500);
      q.reload();
      return true;
    } catch (e) {
      toastError(e, "Không tạo được tác vụ phân tích");
      return undefined;
    }
  }

  const sel = scenes.find((s) => s.id === selScene);
  const playing = scenes.find((s) => curMs >= s.start_ms && curMs < s.end_ms);
  const checkedList = scenes.filter((s) => checked.has(s.id));
  const contiguous = checkedList.length >= 2 && checkedList.every((s, i) => i === 0 || scenes.indexOf(s) === scenes.indexOf(checkedList[i - 1]) + 1);

  return (
    <>
      <PageHead
        title="AI phân tích video"
        sub="Tách cảnh, nhận diện lời nói, OCR và gắn nhãn tư liệu từ video nguồn."
        actions={
          <>
            {list.length > 1 && (
              <select className="select" style={{ width: 220 }} value={aid || ""} onChange={(e) => pickAsset(e.target.value)}>
                {list.map((x) => <option key={x.id} value={x.id}>{x.file_name}</option>)}
              </select>
            )}
            <Btn icon={<RefreshCw size={15} />} onClick={reanalyze} disabled={!a || running} title={running ? "Đang phân tích" : !a ? "Chưa có video" : "Chạy lại phân tích (giữ cảnh đã khoá)"}>
              {analysisJob ? "Phân tích lại" : "Phân tích ngay"}
            </Btn>
            <Btn kind="primary" size="lg" icon={<CheckCircle2 size={17} />} onClick={() => bulkReview("approved")} disabled={!checked.size} title={checked.size ? undefined : "Chọn cảnh trong bảng danh mục bên dưới"}>
              Đưa vào thư viện cảnh{checked.size ? ` (${checked.size})` : ""}
            </Btn>
          </>
        }
      />

      {videos.loading && !videos.data ? (
        <Loading rows={4} />
      ) : videos.error && !videos.data ? (
        <ErrorBox error={videos.error} onRetry={videos.reload} />
      ) : list.length === 0 ? (
        <Empty title="Chưa có video nguồn" action={<Btn kind="primary" onClick={() => nav("/media")}>Nhập video</Btn>}>Nhập video quay thật ở màn hình Nguồn video trước khi phân tích.</Empty>
      ) : q.error && !a ? (
        <ErrorBox error={q.error} onRetry={q.reload} />
      ) : !a ? (
        <Loading rows={5} />
      ) : (
        <>
          <StageCards a={a} job={analysisJob} asrReady={asrReady} />

          <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0,.95fr) minmax(0,2fr) minmax(0,1fr)" }}>
            <Card title="Video nguồn" right={<span className="small muted ellipsis" style={{ maxWidth: 160 }}>{a.file_name}</span>}>
              <div style={{ position: "relative" }}>
                <video
                  ref={videoRef}
                  key={a.id}
                  className="video-player"
                  src={fileUrl(playablePath(a))}
                  poster={fileUrl(a.meta_json?.thumbnail)}
                  controls
                  preload="metadata"
                  style={{ maxHeight: 360, objectFit: "contain" }}
                  onTimeUpdate={(e) => setCurMs(Math.round(e.currentTarget.currentTime * 1000))}
                />
                <div style={{ position: "absolute", top: 8, left: 8 }}><Badge tone="cyan">{a.meta_json?.aspect || "—"} · {a.meta_json?.height ? `${Math.min(a.meta_json.width, a.meta_json.height)}p` : ""}</Badge></div>
              </div>
              <div className="row between mt12">
                <Badge tone={RIGHTS[a.rights]?.tone || "gray"}>{RIGHTS[a.rights]?.label || a.rights}</Badge>
                <span className="small muted">{a.meta_json?.fps ? `${Math.round(a.meta_json.fps)} FPS` : ""} · {(a.meta_json?.video_codec || "").toUpperCase()}</span>
              </div>
              {playing && <div className="xs t2 mt8">Đang phát: <b>{sceneCode(scenes.indexOf(playing))}</b> · {playing.label}</div>}
            </Card>

            <Card title={`Phân cảnh nhận diện (${scenes.length} cảnh)`} right={<span className="small muted">Từ một video quay thật</span>}>
              {scenes.length === 0 ? (
                <Empty title={running ? "Đang tách cảnh…" : "Chưa có cảnh nào"}>{running ? "Kết quả sẽ hiện tự động." : "Bấm “Phân tích ngay” để tách cảnh và tạo keyframe."}</Empty>
              ) : (
                <div className="grid g3" style={{ gap: 12, maxHeight: 460, overflowY: "auto", paddingRight: 4 }}>
                  {scenes.map((s, i) => {
                    const r = REVIEW[s.review] || REVIEW.pending;
                    return (
                      <div key={s.id} className={`list-item ${s.id === selScene ? "on" : ""}`} style={{ flexDirection: "column", alignItems: "stretch", gap: 6, padding: 8 }} onClick={() => seek(s)}>
                        <div className={`media ${s.keyframe ? "" : "ph-media"}`} style={{ aspectRatio: "16/10" }}>
                          {s.keyframe ? <img src={fileUrl(s.keyframe)} alt="" loading="lazy" /> : null}
                          <div className="tag-tl"><Badge tone="purple">{String(i + 1).padStart(2, "0")}</Badge></div>
                          <div className="tag-br">{ms(s.start_ms)} – {ms(s.end_ms)}</div>
                          {!!s.locked && <div style={{ position: "absolute", top: 8, right: 8 }}><Badge tone="gray" icon={<Lock size={10} />}>Khoá</Badge></div>}
                        </div>
                        <div className="semi small ellipsis" title={s.label}>{s.label || "—"}</div>
                        <div className="row between">
                          <Badge tone={r.tone}>{r.label}</Badge>
                          <span className="xs muted">{s.quality_json?.score !== undefined ? `CL ${s.quality_json.score}` : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card title="Thông tin & nhận diện" right={<span className="small muted">AI Insight</span>}>
              <Tabs pill value={tab} onChange={setTab} tabs={[{ id: "transcript", label: "Transcript" }, { id: "ocr", label: "OCR" }, { id: "obj", label: "Đối tượng" }]} />
              <div className="mt12">
                {tab === "transcript" && <TranscriptPanel a={a} job={analysisJob} asrReady={asrReady} onSeek={(t) => { if (videoRef.current) videoRef.current.currentTime = t / 1000; }} />}
                {tab === "ocr" && <OcrPanel scenes={scenes} job={analysisJob} onSeek={seek} />}
                {tab === "obj" && <TagsPanel scenes={scenes} sel={sel} />}
              </div>
              <ConfidenceBox scenes={scenes} />
            </Card>
          </div>

          <Card className="mt16" title="Danh mục cảnh nguồn" right={<span className="small muted">Chỉ cảnh không bị loại và tư liệu có quyền sử dụng mới được đưa vào sản xuất</span>}>
            {checked.size > 0 && (
              <div className="row inner mb12" style={{ padding: "8px 12px" }}>
                <b className="small">Đã chọn {checked.size} cảnh</b>
                <Btn size="sm" kind="teal" icon={<Check size={13} />} onClick={() => bulkReview("approved")}>Duyệt</Btn>
                <Btn size="sm" kind="danger" icon={<X size={13} />} onClick={() => bulkReview("rejected")}>Loại</Btn>
                <Btn size="sm" icon={<Merge size={13} />} onClick={merge} disabled={!contiguous} title={contiguous ? "Gộp thành một cảnh" : "Chọn ≥ 2 cảnh liền kề nhau"}>Gộp cảnh</Btn>
                <Btn size="sm" kind="ghost" onClick={() => setChecked(new Set())}>Bỏ chọn</Btn>
              </div>
            )}
            {scenes.length === 0 ? (
              <div className="small muted">Chưa có cảnh để duyệt.</div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 460 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}><input type="checkbox" className="check" checked={checked.size === scenes.length} onChange={(e) => setChecked(e.target.checked ? new Set(scenes.map((s) => s.id)) : new Set())} /></th>
                      <th>ID cảnh</th><th>Thời gian</th><th>Nhãn AI</th><th>Nhãn shot</th><th>Gợi ý ứng dụng</th><th>Chất lượng</th><th>Nguồn tư liệu</th><th>Kiểm duyệt</th><th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenes.map((s, i) => {
                      const r = REVIEW[s.review] || REVIEW.pending;
                      const tags: string[] = s.tags_json || [];
                      return (
                        <tr key={s.id} className={s.id === selScene ? "sel" : ""}>
                          <td><input type="checkbox" className="check" checked={checked.has(s.id)} onChange={(e) => { const n = new Set(checked); e.target.checked ? n.add(s.id) : n.delete(s.id); setChecked(n); }} /></td>
                          <td className="mono" style={{ cursor: "pointer" }} onClick={() => seek(s)}>{sceneCode(i)}</td>
                          <td className="mono small">{ms(s.start_ms)} – {ms(s.end_ms)}</td>
                          <td className="ellipsis" style={{ maxWidth: 180 }} title={s.label}>{s.label || "—"}</td>
                          <td>
                            <div className="row" style={{ gap: 4, flexWrap: "wrap", maxWidth: 260 }}>
                              {tags.length ? tags.map((t) => <Badge key={t} tone="purple">{SHOT_TAGS[t] || t}</Badge>) : <span className="xs muted">Chưa gắn</span>}
                            </div>
                          </td>
                          <td className="small t2">{hintFor(tags)}</td>
                          <td className="small">{s.quality_json?.score !== undefined ? `${s.quality_json.score}/100${s.quality_json.shaky ? " · rung" : ""}${s.quality_json.dark ? " · tối" : ""}` : "—"}</td>
                          <td className="small">{RIGHTS[a.rights]?.label || a.rights}</td>
                          <td><Badge tone={r.tone}>{r.label}</Badge></td>
                          <td>
                            <div className="row" style={{ gap: 4 }}>
                              <button className="btn xs teal" title="Duyệt cảnh" disabled={s.review === "approved"} onClick={() => patchScene(s, { review: "approved" })}><Check size={12} /></button>
                              <button className="btn xs danger" title="Loại cảnh" disabled={s.review === "rejected"} onClick={() => patchScene(s, { review: "rejected" })}><X size={12} /></button>
                              <button className="btn xs" title="Sửa nhãn" onClick={() => setEditing(s)}><Pencil size={12} /></button>
                              <button className="btn xs" title={s.locked ? "Mở khoá (phân tích lại có thể ghi đè)" : "Khoá cảnh (giữ nguyên khi phân tích lại)"} onClick={() => patchScene(s, { locked: s.locked ? 0 : 1 }, s.locked ? "Đã mở khoá cảnh" : "Đã khoá cảnh")}>{s.locked ? <Lock size={12} className="c-orange" /> : <Unlock size={12} />}</button>
                              <button className="btn xs" title={s.end_ms - s.start_ms < 400 ? "Cảnh quá ngắn để tách" : "Tách cảnh"} disabled={s.end_ms - s.start_ms < 400} onClick={() => setSplitting(s)}><Scissors size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <TagEditor scene={editing} onClose={() => setEditing(null)} onSave={async (body) => { const r = await patchScene(editing, body, "Đã cập nhật nhãn cảnh"); if (r) setEditing(null); return r; }} />
      <SplitModal scene={splitting} curMs={curMs} onClose={() => setSplitting(null)} onDone={() => { setSplitting(null); q.reload(); }} />
    </>
  );
}

// ---------------------------------------------------------------- stage cards
function StageCards({ a, job, asrReady }: { a: any; job: any; asrReady: boolean }) {
  const nav = useNavigate();
  const opts = job?.profile_json || {};
  const res = job?.status === "COMPLETED" ? job.profile_json?.result || a.meta_json?.analysis : a.meta_json?.analysis;
  const running = job && ACTIVE_JOB.includes(job.status);
  const failed = job?.status === "FAILED";
  const p = job?.progress || 0;
  const scenes: any[] = a.scenes || [];
  const span = (lo: number, hi: number) => Math.round(Math.max(0, Math.min(1, (p - lo) / (hi - lo))) * 100);
  const asr = res?.asr;
  const asrSkipped = asr && typeof asr === "object" && asr.skipped;
  const hasAudio = res?.audio?.has_audio;
  const ocrCount = scenes.filter((s) => s.ocr_text).length;
  const conf = scenes.length ? Math.round((scenes.reduce((x, s) => x + (s.quality_json?.confidence || 0), 0) / scenes.length) * 100) : 0;

  type St = { title: string; pct: number; sub: React.ReactNode; tone?: string };
  const off = (title: string): St => ({ title, pct: 0, sub: "Đã tắt trong tuỳ chọn", tone: "gray" });
  let stages: St[];
  if (!job && !res) {
    stages = ["Scene Detect", "Speech Recognition", "OCR", "Chất lượng hình ảnh", "Content Classification"].map((t) => ({ title: t, pct: 0, sub: "Chưa chạy", tone: "gray" }));
  } else if (running) {
    stages = [
      opts.scene_detect === false ? off("Scene Detect") : { title: "Scene Detect", pct: span(0, 0.25), sub: job.status === "PENDING" ? "Đang chờ trong hàng đợi" : "Đang tách cảnh…" },
      opts.asr === false ? off("Speech Recognition") : { title: "Speech Recognition", pct: span(0.7, 0.95), sub: p < 0.7 ? "Chờ bước trước" : "Đang nhận diện lời nói…" },
      opts.ocr === false ? off("OCR") : { title: "OCR", pct: span(0.25, 0.7), sub: p < 0.25 ? "Chờ bước trước" : "Đang đọc chữ trên keyframe…" },
      opts.quality === false ? off("Chất lượng hình ảnh") : { title: "Chất lượng hình ảnh", pct: span(0.25, 0.7), sub: p < 0.25 ? "Chờ bước trước" : "Đang đo độ sáng, rung…" },
      { title: "Content Classification", pct: span(0.25, 0.95), sub: "Gợi ý nhãn shot theo cảnh" },
    ];
  } else {
    stages = [
      { title: "Scene Detect", pct: failed ? 0 : 100, sub: failed ? "Thất bại" : `${res?.scene_detect ?? scenes.length} cảnh · xử lý local`, tone: failed ? "red" : undefined },
      opts.asr === false
        ? off("Speech Recognition")
        : asrSkipped
          ? { title: "Speech Recognition", pct: 0, tone: "orange", sub: asr.skipped === "ASR_MODEL_MISSING" && asrReady
              ? "Lần trước chưa có model Whisper — model đã cài, bấm Phân tích lại"
              : <span>Bỏ qua: {asr.skipped === "ASR_MODEL_MISSING" ? "chưa cài model Whisper" : asr.message} · <span className="link" onClick={() => nav("/system/models")}>Quản lý model</span></span> }
          : typeof asr === "number"
            ? { title: "Speech Recognition", pct: 100, sub: `${asr} đoạn lời thoại · whisper.cpp` }
            : hasAudio === false
              ? { title: "Speech Recognition", pct: 0, tone: "gray", sub: "Video không có âm thanh" }
              : { title: "Speech Recognition", pct: 0, tone: "gray", sub: "Không chạy trong lần phân tích này" },
      opts.ocr === false ? off("OCR") : { title: "OCR", pct: failed ? 0 : 100, sub: `${ocrCount}/${scenes.length} cảnh có chữ` },
      opts.quality === false ? off("Chất lượng hình ảnh") : { title: "Chất lượng hình ảnh", pct: failed ? 0 : 100, sub: `${scenes.filter((s) => s.quality_json?.score !== undefined).length} cảnh đã chấm điểm` },
      { title: "Content Classification", pct: failed ? 0 : scenes.length ? 100 : 0, sub: scenes.length ? `Nhãn gợi ý · tin cậy TB ${conf}% — cần xác nhận` : "—" },
    ];
  }
  return (
    <>
      {failed && (
        <div className="err-box mb12 small">
          <b>Phân tích thất bại</b> <span className="mono muted">[{job.error_code}]</span> {job.error_message}
        </div>
      )}
      <div className="grid g5">
        {stages.map((s) => (
          <div key={s.title} className="card" style={{ padding: 14 }}>
            <div className="row between">
              <span className="semi">{s.title}</span>
              <b className={s.tone === "orange" ? "c-orange" : s.tone === "red" ? "c-red" : s.tone === "gray" ? "muted" : "c-teal"}>{s.pct}%</b>
            </div>
            <Bar value={s.pct} style={{ marginTop: 10 }} tone={s.tone === "orange" ? "orange" : s.tone === "red" ? "red" : ""} />
            <div className="xs muted mt8">{s.sub}</div>
          </div>
        ))}
      </div>
      {job && (running || failed) && (
        <div className="row xs muted mt8"><JobStatus status={job.status} /> Tác vụ phân tích · {Math.round(p * 100)}% {job.attempts > 1 ? `· lần thử ${job.attempts}` : ""}</div>
      )}
    </>
  );
}

function TranscriptPanel({ a, job, asrReady, onSeek }: { a: any; job: any; asrReady: boolean; onSeek: (ms: number) => void }) {
  const nav = useNavigate();
  const segs: any[] = a.transcript || [];
  const asr = (job?.profile_json?.result || a.meta_json?.analysis)?.asr;
  if (segs.length) {
    return (
      <div className="inner" style={{ maxHeight: 260, overflowY: "auto" }}>
        <div className="xs muted semi mb8">TRÍCH XUẤT LỜI THOẠI</div>
        {segs.map((s) => (
          <div key={s.id} className="row small" style={{ alignItems: "flex-start", padding: "6px 0", borderTop: "1px solid var(--border)", cursor: "pointer" }} onClick={() => onSeek(s.start_ms)}>
            <span className="mono muted" style={{ minWidth: 92 }}>{ms(s.start_ms)} – {ms(s.end_ms)}</span>
            <span>{s.text}</span>
          </div>
        ))}
      </div>
    );
  }
  if (asr && typeof asr === "object" && asr.skipped === "ASR_MODEL_MISSING" && asrReady) {
    return <div className="small muted">Lần phân tích trước chạy khi chưa có model Whisper. Model đã cài — bấm <b>Phân tích lại</b> để tách lời thoại.</div>;
  }
  if (asr && typeof asr === "object" && asr.skipped) {
    return (
      <Warn title="Chưa có transcript — bước nhận diện giọng nói bị bỏ qua">
        {asr.message} <span className="mono">[{asr.skipped}]</span>
        {asr.hint && <div>{asr.hint}</div>}
        <button className="btn sm orange mt8" onClick={() => nav("/system/models")}>Mở Quản lý mô hình AI</button>
      </Warn>
    );
  }
  if (job?.profile_json?.asr === false) return <div className="small muted">Tách lời thoại đã tắt khi phân tích. Bật lại ở màn hình Nguồn video rồi phân tích lại.</div>;
  if ((job?.profile_json?.result || a.meta_json?.analysis)?.audio?.has_audio === false) return <div className="small muted">Video không có âm thanh.</div>;
  return <div className="small muted">Chưa có lời thoại được nhận diện.</div>;
}

function OcrPanel({ scenes, job, onSeek }: { scenes: any[]; job: any; onSeek: (s: any) => void }) {
  const withText = scenes.filter((s) => s.ocr_text);
  if (job?.profile_json?.ocr === false) return <div className="small muted">OCR đã tắt trong lần phân tích này.</div>;
  if (!withText.length) return <div className="small muted">Không phát hiện chữ trên keyframe của các cảnh.</div>;
  return (
    <div className="inner" style={{ maxHeight: 260, overflowY: "auto" }}>
      <div className="xs muted semi mb8">CHỮ TRÊN KHUNG HÌNH</div>
      {withText.map((s) => (
        <div key={s.id} className="small" style={{ padding: "6px 0", borderTop: "1px solid var(--border)", cursor: "pointer" }} onClick={() => onSeek(s)}>
          <span className="mono muted">{ms(s.start_ms)}</span> {s.ocr_text}
        </div>
      ))}
    </div>
  );
}

function TagsPanel({ scenes, sel }: { scenes: any[]; sel: any }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    scenes.forEach((s) => (s.tags_json || []).forEach((t: string) => (c[t] = (c[t] || 0) + 1)));
    return Object.entries(c).sort((x, y) => y[1] - x[1]);
  }, [scenes]);
  return (
    <div className="inner">
      <div className="xs muted semi mb8">NHÃN SHOT / HÀNH ĐỘNG {sel ? `· ${sel.label}` : "· toàn video"}</div>
      {sel ? (
        <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>{(sel.tags_json || []).map((t: string) => <Badge key={t} tone="purple">{SHOT_TAGS[t] || t}</Badge>)}</div>
      ) : counts.length ? (
        <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>{counts.map(([t, n]) => <Badge key={t} tone="purple">{SHOT_TAGS[t] || t} · {n}</Badge>)}</div>
      ) : (
        <div className="small muted">Chưa có nhãn.</div>
      )}
      <div className="xs muted mt8">Nhãn do bộ gợi ý local đề xuất (không có mô hình nhận dạng vật thể) — hãy xác nhận ở bảng danh mục.</div>
    </div>
  );
}

function ConfidenceBox({ scenes }: { scenes: any[] }) {
  if (!scenes.length) return null;
  const conf = Math.round((scenes.reduce((x, s) => x + (s.quality_json?.confidence || 0), 0) / scenes.length) * 100);
  const approved = scenes.filter((s) => s.review === "approved").length;
  return (
    <div className="inner mt12">
      <div className="row between small"><span>Độ tin cậy nhãn gợi ý (TB)</span><b className={conf >= 70 ? "c-teal" : "c-orange"}>{conf}%</b></div>
      <Bar value={conf} thin style={{ marginTop: 6 }} />
      <div className="row between xs muted mt8"><span>Đã duyệt</span><span>{approved}/{scenes.length} cảnh</span></div>
    </div>
  );
}

// ---------------------------------------------------------------- modals
function TagEditor({ scene, onClose, onSave }: { scene: any; onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<unknown> }) {
  const [tags, setTags] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (scene) {
      setTags(scene.tags_json || []);
      setLabel(scene.label || "");
    }
  }, [scene]);
  if (!scene) return null;
  return (
    <Modal open onClose={onClose} title={<><Pencil size={16} /> Sửa nhãn cảnh · {ms(scene.start_ms)} – {ms(scene.end_ms)}</>} footer={<><Btn kind="ghost" onClick={onClose}>Huỷ</Btn><Btn kind="primary" icon={<Check size={15} />} onClick={() => onSave({ label: label.trim() || null, tags_json: tags })}>Lưu nhãn</Btn></>}>
      {scene.keyframe && <img src={fileUrl(scene.keyframe)} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 10, background: "#000" }} />}
      <div className="mt12"><Field label="Nhãn mô tả cảnh"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></Field></div>
      <div className="label mt12 mb8">Nhãn shot (dùng để ghép cảnh vào kịch bản)</div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {Object.entries(SHOT_TAGS).map(([k, l]) => (
          <span key={k} className={`chip ${tags.includes(k) ? "on" : ""}`} onClick={() => setTags(tags.includes(k) ? tags.filter((t) => t !== k) : [...tags, k])}>
            {tags.includes(k) && <Check size={12} />} {l}
          </span>
        ))}
      </div>
    </Modal>
  );
}

function SplitModal({ scene, curMs, onClose, onDone }: { scene: any; curMs: number; onClose: () => void; onDone: () => void }) {
  const { toast, toastError } = useApp();
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (scene) setAt(curMs > scene.start_ms && curMs < scene.end_ms ? curMs : Math.round((scene.start_ms + scene.end_ms) / 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  if (!scene) return null;
  const valid = at > scene.start_ms && at < scene.end_ms;
  async function split() {
    try {
      await api.post(`/scenes/${scene.id}/split`, undefined, { at_ms: Math.round(at) });
      toast({ kind: "success", title: `Đã tách cảnh tại ${msPrecise(at)}` });
      onDone();
      return true;
    } catch (e) {
      toastError(e, "Không tách được cảnh");
      return undefined;
    }
  }
  return (
    <Modal open onClose={onClose} title={<><Scissors size={16} /> Tách cảnh</>} footer={<><Btn kind="ghost" onClick={onClose}>Huỷ</Btn><Btn kind="primary" icon={<Scissors size={15} />} disabled={!valid} title={valid ? undefined : "Điểm cắt phải nằm trong cảnh"} onClick={split}>Tách tại {msPrecise(at)}</Btn></>}>
      <div className="small t2">Cảnh {msPrecise(scene.start_ms)} – {msPrecise(scene.end_ms)} ({scene.label})</div>
      <input type="range" className="range mt12" min={scene.start_ms + 100} max={scene.end_ms - 100} step={100} value={at} onChange={(e) => setAt(Number(e.target.value))} />
      <div className="row between xs muted"><span>{msPrecise(scene.start_ms)}</span><b className="c-primary">{msPrecise(at)}</b><span>{msPrecise(scene.end_ms)}</span></div>
      <div className="xs muted mt12">Mẹo: phát video tới đúng khung hình rồi mở hộp thoại này — điểm cắt sẽ lấy theo vị trí đang phát.</div>
    </Modal>
  );
}
