import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FolderOpen, HardDrive, Loader2, ScanSearch, Sparkles, Trash2, Upload, UploadCloud, X } from "lucide-react";
import { api, ApiError, fileUrl, useApi } from "../lib/api";
import { bytes, ms, RIGHTS } from "../lib/format";
import { useApp } from "../lib/store";
import { Badge, Bar, Btn, Card, Empty, ErrorBox, Field, InfoNote, JobStatus, Loading, Modal, NeedProject, PageHead, Select, Thumb, Toggle } from "../components/ui";
import { ACTIVE_JOB, FlowStepper, playablePath, uploadWithProgress } from "../components/a_flow";

const ACCEPT = ".mp4,.mov,.m4v,.mkv,.webm,.avi,.mp3,.wav,.m4a,.aac,.jpg,.jpeg,.png,.webp";
const RIGHT_OPTS = Object.entries(RIGHTS).map(([value, r]) => ({ value, label: r.label }));
const ASSET_STATUS: Record<string, { label: string; tone: any }> = {
  imported: { label: "Đang tạo proxy", tone: "cyan" },
  ready: { label: "Sẵn sàng phân tích", tone: "purple" },
  analyzed: { label: "Đã phân tích", tone: "teal" },
};

interface UploadItem {
  key: string;
  file: File;
  progress: number;
  state: "uploading" | "done" | "error";
  error?: ApiError;
}

export default function MediaImport() {
  const { projectId, project } = useApp();
  return (
    <>
      <PageHead title="Nguồn video" sub="Tải video quay thật và cấu hình phân tích nội dung trước khi tạo chiến dịch." />
      <NeedProject projectId={projectId}>{projectId && <MediaBody key={projectId} projectId={projectId} project={project} />}</NeedProject>
    </>
  );
}

function MediaBody({ projectId, project }: { projectId: string; project: any }) {
  const nav = useNavigate();
  const { toast, toastError, reloadProject, product } = useApp();
  const [poll, setPoll] = useState<number | undefined>(undefined);
  const assetsQ = useApi<any[]>("/assets", { project_id: projectId }, poll);
  const assets = assetsQ.data || [];
  const [sel, setSel] = useState<string | null>(null);
  const selId = sel && assets.some((a) => a.id === sel) ? sel : ([...assets].reverse().find((a) => a.media_type === "video") || assets[assets.length - 1])?.id || null;
  const detail = useApi<any>(selId ? `/assets/${selId}` : null, undefined, poll);
  const asset = detail.data && detail.data.id === selId ? detail.data : assets.find((a) => a.id === selId);
  const models = useApi<any>("/models");
  const storage = useApi<any>("/system/storage", undefined, 30000);

  const anyPending = assets.some((a) => a.status === "imported" && a.media_type === "video") || (detail.data?.jobs || []).some((j: any) => ACTIVE_JOB.includes(j.status));
  useEffect(() => setPoll(anyPending ? 2500 : undefined), [anyPending]);

  // ---------------------------------------------------------------- upload
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [rights, setRights] = useState("own_footage");
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pathOpen, setPathOpen] = useState(false);

  async function uploadOne(item: UploadItem, allowDuplicate = false) {
    const upd = (p: Partial<UploadItem>) => setUploads((xs) => xs.map((x) => (x.key === item.key ? { ...x, ...p } : x)));
    upd({ state: "uploading", progress: 0, error: undefined });
    const fd = new FormData();
    fd.append("project_id", projectId);
    fd.append("rights", rights);
    fd.append("allow_duplicate", String(allowDuplicate));
    fd.append("file", item.file);
    try {
      const a = await uploadWithProgress("/assets/import", fd, (p) => upd({ progress: p }));
      upd({ state: "done", progress: 1 });
      setSel(a.id);
      assetsQ.reload();
      reloadProject();
    } catch (e) {
      upd({ state: "error", error: e as ApiError });
    }
  }

  function addFiles(files: FileList | File[] | null) {
    if (!files || !files.length) return;
    const items: UploadItem[] = Array.from(files).map((f) => ({ key: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`, file: f, progress: 0, state: "uploading" }));
    setUploads((xs) => [...items, ...xs].slice(0, 20));
    items.reduce((p, it) => p.then(() => uploadOne(it)), Promise.resolve());
  }

  // ---------------------------------------------------------------- analysis options
  const asrModel = models.data?.models?.find((m: any) => m.kind === "asr");
  const ocrModel = models.data?.models?.find((m: any) => m.kind === "ocr");
  const [opts, setOpts] = useState({ scene_detect: true, asr: true, ocr: true, quality: true, threshold: 0.3 });

  async function analyze() {
    if (!asset) return undefined;
    try {
      await api.post("/analysis/jobs", { asset_id: asset.id, ...opts });
      toast({ kind: "success", title: "Đã đưa vào hàng đợi phân tích", body: asset.file_name });
      nav(`/media/analyze?asset=${asset.id}`);
      return true;
    } catch (e) {
      toastError(e, "Không tạo được tác vụ phân tích");
      return undefined;
    }
  }

  async function setRightsOf(a: any, r: string) {
    try {
      await api.patch(`/assets/${a.id}`, { rights: r });
      toast({ kind: "success", title: "Đã cập nhật quyền sử dụng", body: `${a.file_name}: ${RIGHTS[r]?.label || r}` });
      assetsQ.reload();
      detail.reload();
    } catch (e) {
      toastError(e, "Không cập nhật được quyền sử dụng");
    }
  }

  const [toDelete, setToDelete] = useState<any>(null);
  async function deleteAsset() {
    const a = toDelete;
    try {
      await api.del(`/assets/${a.id}`);
      toast({ kind: "success", title: `Đã xoá ${a.file_name}` });
      setToDelete(null);
      if (sel === a.id) setSel(null);
      assetsQ.reload();
      reloadProject();
      return true;
    } catch (e) {
      toastError(e, "Không xoá được tư liệu");
      return undefined;
    }
  }

  const meta = asset?.meta_json || {};
  const isVideo = asset?.media_type === "video";
  const videoSrc = isVideo ? fileUrl(playablePath(asset)) : undefined;
  const lastProxyJob = (detail.data?.jobs || []).find((j: any) => j.kind === "proxy");
  const lastAnalysis = (detail.data?.jobs || []).find((j: any) => j.kind === "analysis");
  const analysisRunning = lastAnalysis && ACTIVE_JOB.includes(lastAnalysis.status);

  const done = [assets.length > 0, !!product, (project?.variants || 0) > 0, (project?.completed || 0) > 0, (project?.completed || 0) > 0 && project?.progress >= 100, false];

  return (
    <>
      <FlowStepper active={0} done={done} />

      <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,.9fr)" }}>
        {/* Dropzone */}
        <Card title="Nhập tư liệu nguồn" right={<Badge tone="purple">Bước 01 / 06</Badge>}>
          <div
            className={`dropzone ${over ? "over" : ""}`}
            style={{ minHeight: 210 }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
          >
            <UploadCloud size={34} className="c-primary" />
            <div className="bold" style={{ fontSize: 16 }}>Kéo thả video vào đây</div>
            <div className="small t2">hoặc chọn video trực tiếp từ máy</div>
            <span className="btn primary mt8"><FolderOpen size={15} /> Chọn video từ máy tính</span>
            <div className="xs muted mt8">MP4, MOV, MKV, WEBM · H.264/H.265 · ảnh và âm thanh cũng được nhận</div>
            <input ref={inputRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          <div className="row mt12" style={{ gap: 8 }}>
            <span className="small muted" style={{ whiteSpace: "nowrap" }}>Quyền mặc định</span>
            <Select value={rights} onChange={setRights} options={RIGHT_OPTS} />
            <Btn size="sm" icon={<FolderOpen size={14} />} onClick={() => setPathOpen(true)} title="Nhập file hoặc cả thư mục theo đường dẫn trên máy">Từ thư mục</Btn>
          </div>
          {uploads.length > 0 && (
            <div className="col mt12" style={{ gap: 8 }}>
              {uploads.map((u) => (
                <UploadRow key={u.key} u={u} onRetry={(dup) => uploadOne(u, dup)} onDismiss={() => setUploads((xs) => xs.filter((x) => x.key !== u.key))} />
              ))}
            </div>
          )}
        </Card>

        {/* Player */}
        <Card title="Video nguồn đã nhập" right={asset && <Badge tone="teal">{ms(meta.duration_ms)}</Badge>}>
          {assetsQ.loading && !assetsQ.data ? (
            <Loading rows={4} />
          ) : !asset ? (
            <Empty title="Chưa có video nào">Kéo thả hoặc chọn video quay thật để bắt đầu.</Empty>
          ) : isVideo ? (
            <>
              <video key={videoSrc} className="video-player" src={videoSrc} poster={fileUrl(meta.thumbnail)} controls preload="metadata" style={{ maxHeight: 300, objectFit: "contain" }} />
              <div className="row between mt8 small">
                <span className="ellipsis semi">{asset.file_name}</span>
                <span className="muted">{meta.width && `${meta.width}×${meta.height}`} · {meta.aspect || "—"}</span>
              </div>
              {!meta.proxy && !lastProxyJob?.profile_json?.result?.proxy && (
                <div className="xs muted mt8">
                  {lastProxyJob && ACTIVE_JOB.includes(lastProxyJob.status) ? <><Loader2 size={11} className="spin" /> Đang tạo proxy ({Math.round(lastProxyJob.progress * 100)}%) — đang phát file gốc.</> : lastProxyJob?.status === "FAILED" ? <span className="c-red">Tạo proxy lỗi [{lastProxyJob.error_code}] — đang phát file gốc.</span> : "Đang phát file gốc (chưa có proxy)."}
                </div>
              )}
            </>
          ) : asset.media_type === "image" ? (
            <Thumb src={meta.thumbnail || asset.uri} ratio="16/10" />
          ) : (
            <audio src={fileUrl(asset.uri)} controls style={{ width: "100%" }} />
          )}
        </Card>

        {/* Options */}
        <Card title="Tuỳ chọn phân tích AI" right={<span className="small muted">Local</span>}>
          <div className="col" style={{ gap: 0 }}>
            <OptRow title="Tự nhận diện phân cảnh" sub="Tìm điểm cắt và phân loại cảnh" on={opts.scene_detect} onChange={(v) => setOpts({ ...opts, scene_detect: v })} />
            <OptRow
              title="Tách lời thoại"
              sub={asrModel && !asrModel.installed ? <span className="c-orange">Chưa cài Whisper — bước này sẽ bị bỏ qua. <span className="link" onClick={() => nav("/system/models")}>Tải model</span></span> : "Speech-to-Text tiếng Việt (whisper.cpp)"}
              on={opts.asr}
              onChange={(v) => setOpts({ ...opts, asr: v })}
            />
            <OptRow title="Nhận diện chữ (OCR)" sub={ocrModel && !ocrModel.installed ? <span className="c-orange">OCR chưa sẵn sàng — sẽ không đọc được chữ.</span> : "Đọc chữ xuất hiện trên video"} on={opts.ocr} onChange={(v) => setOpts({ ...opts, ocr: v })} />
            <OptRow title="Kiểm tra chất lượng nguồn" sub="Phát hiện tối, rung, độ sáng" on={opts.quality} onChange={(v) => setOpts({ ...opts, quality: v })} />
            <OptRow title="Giữ nguyên video gốc" sub="Luôn bật: app chỉ làm việc trên bản sao + proxy" on disabled />
            <div style={{ padding: "10px 0 0" }}>
              <div className="row between small"><span className="t2">Độ nhạy tách cảnh</span><b>{opts.threshold.toFixed(2)}</b></div>
              <input type="range" className="range" min={0.1} max={0.6} step={0.05} value={opts.threshold} onChange={(e) => setOpts({ ...opts, threshold: Number(e.target.value) })} disabled={!opts.scene_detect} />
              <div className="row between xs muted"><span>Nhiều cảnh hơn</span><span>Ít cảnh hơn</span></div>
            </div>
          </div>
        </Card>
      </div>

      {/* Source info table */}
      <Card className="mt16" title="Thông tin video nguồn" right={<span className="small muted">{assets.length} tệp được nhập · dữ liệu thật từ ffprobe</span>}>
        {assetsQ.error && !assetsQ.data ? (
          <ErrorBox error={assetsQ.error} onRetry={assetsQ.reload} />
        ) : assets.length === 0 ? (
          <div className="small muted">Chưa có tệp nào trong dự án này.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Tệp nguồn</th><th>Thời lượng</th><th>Kích thước</th><th>FPS</th><th>Codec</th><th>Dung lượng</th><th>Quyền sử dụng</th><th>Khung hình</th><th>Âm thanh</th><th>Trạng thái</th><th /></tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const m = a.meta_json || {};
                  const st = ASSET_STATUS[a.status] || { label: a.status, tone: "gray" };
                  return (
                    <tr key={a.id} className={a.id === selId ? "sel" : ""} onClick={() => setSel(a.id)} style={{ cursor: "pointer" }}>
                      <td><div className="row"><Thumb src={m.thumbnail} ratio="1/1" style={{ width: 34 }} /><span className="semi ellipsis" style={{ maxWidth: 220 }} title={a.file_name}>{a.file_name}</span></div></td>
                      <td>{a.media_type === "image" ? "—" : ms(m.duration_ms)}</td>
                      <td>{m.width ? `${m.width} × ${m.height}` : "—"}</td>
                      <td>{m.fps ? Math.round(m.fps * 100) / 100 : "—"}</td>
                      <td className="mono">{(m.video_codec || m.audio_codec || "—").toUpperCase()}</td>
                      <td>{bytes(m.size_bytes)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select className="select" style={{ height: 30, minWidth: 160, color: `var(--${RIGHTS[a.rights]?.tone === "red" ? "red" : RIGHTS[a.rights]?.tone === "orange" ? "orange" : "teal"})` }} value={a.rights} onChange={(e) => setRightsOf(a, e.target.value)}>
                          {RIGHT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td>{m.aspect ? `${m.aspect} (${m.height > m.width ? "Dọc" : m.height === m.width ? "Vuông" : "Ngang"})` : "—"}</td>
                      <td>{m.audio_codec ? (m.audio_channels === 1 ? "Mono" : m.audio_channels === 2 ? "Stereo" : `${m.audio_channels} kênh`) : "Không có"}</td>
                      <td><Badge tone={st.tone}>{st.label}</Badge>{a.scene_count > 0 && <span className="xs muted"> · {a.scene_count} cảnh</span>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row" style={{ gap: 4 }}>
                          {a.media_type === "video" && <button className="btn xs" title="Mở màn hình phân tích" onClick={() => nav(`/media/analyze?asset=${a.id}`)}><ScanSearch size={13} /></button>}
                          <button className="btn xs danger" title="Xoá tư liệu" onClick={() => setToDelete(a)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {assets.some((a) => a.rights === "unknown" || a.rights === "needs_check") && (
          <div className="mt12"><InfoNote>Tư liệu “Chưa rõ quyền” / “Cần duyệt” sẽ bị chặn khi duyệt video cuối (BLOCK-02). Cập nhật quyền sử dụng trước khi sản xuất.</InfoNote></div>
        )}
      </Card>

      <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0,2.2fr) minmax(0,1fr)" }}>
        <QualityCard asset={detail.data && detail.data.id === selId ? detail.data : null} loading={detail.loading && !detail.data} />

        <Card title={<><HardDrive size={16} /> Dung lượng & xử lý local</>} right={storage.data && <Badge tone={storage.data.disk_free_gb >= 10 ? "teal" : "orange"}>{storage.data.disk_free_gb >= 10 ? "Ready" : "Sắp đầy"}</Badge>}>
          {storage.error && !storage.data ? (
            <ErrorBox error={storage.error} onRetry={storage.reload} />
          ) : !storage.data ? (
            <Loading rows={2} />
          ) : (
            <StorageBlock s={storage.data} />
          )}
          <div className="row mt12" style={{ justifyContent: "flex-end" }}>
            <Btn
              kind="primary"
              icon={<Sparkles size={15} />}
              onClick={analyze}
              disabled={!isVideo || analysisRunning || (!opts.scene_detect && !opts.asr && !opts.ocr && !opts.quality)}
              title={!asset ? "Nhập video trước" : !isVideo ? "Chỉ phân tích được video" : analysisRunning ? "Video này đang được phân tích" : undefined}
            >
              {analysisRunning ? "Đang phân tích…" : "Phân tích video"}
            </Btn>
          </div>
          {lastAnalysis && (
            <div className="xs muted mt8 right">
              Lần gần nhất: <JobStatus status={lastAnalysis.status} /> {lastAnalysis.error_code && <span className="c-red">[{lastAnalysis.error_code}]</span>}{" "}
              <span className="link" onClick={() => nav(`/media/analyze?asset=${asset.id}`)}>Xem kết quả ›</span>
            </div>
          )}
        </Card>
      </div>

      <ImportPathModal open={pathOpen} onClose={() => setPathOpen(false)} projectId={projectId} rights={rights} onDone={() => { assetsQ.reload(); reloadProject(); }} />

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={<><Trash2 size={16} className="c-red" /> Xoá tư liệu</>}
        footer={<><Btn kind="ghost" onClick={() => setToDelete(null)}>Huỷ</Btn><Btn kind="danger" icon={<Trash2 size={15} />} onClick={deleteAsset}>Xoá</Btn></>}
      >
        <div className="small">
          Xoá <b>{toDelete?.file_name}</b> cùng proxy, keyframe và {toDelete?.scene_count || 0} cảnh đã phân tích. Bản sao trong thư mục dữ liệu app sẽ bị xoá; file gốc bạn chọn từ thư mục ngoài không bị đụng tới.
        </div>
      </Modal>
    </>
  );
}

function OptRow({ title, sub, on, onChange, disabled }: { title: string; sub: React.ReactNode; on: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div>
        <div className="semi">{title}</div>
        <div className="xs muted">{sub}</div>
      </div>
      <span title={disabled ? "Video gốc không bao giờ bị sửa" : undefined}><Toggle on={on} onChange={onChange} disabled={disabled} /></span>
    </div>
  );
}

function UploadRow({ u, onRetry, onDismiss }: { u: UploadItem; onRetry: (allowDup: boolean) => void; onDismiss: () => void }) {
  const dup = u.error?.body.code === "ASSET_DUPLICATE";
  return (
    <div className="inner" style={{ padding: 10 }}>
      <div className="row small">
        {u.state === "uploading" ? <Loader2 size={14} className="spin c-cyan" /> : u.state === "done" ? <CheckCircle2 size={14} className="c-teal" /> : <AlertTriangle size={14} className="c-red" />}
        <span className="semi ellipsis grow" title={u.file.name}>{u.file.name}</span>
        <span className="xs muted">{bytes(u.file.size)}</span>
        {u.state !== "uploading" && <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={onDismiss} aria-label="Ẩn"><X size={12} /></button>}
      </div>
      {u.state === "uploading" && <Bar value={u.progress * 100} thin style={{ marginTop: 6 }} />}
      {u.state === "uploading" && u.progress >= 1 && <div className="xs muted mt8">Đang kiểm tra file, đọc metadata và tạo thumbnail…</div>}
      {u.error && (
        <div className="xs mt8">
          <span className="c-red semi">{u.error.body.message}</span> <span className="mono muted">[{u.error.body.code}]</span>
          {u.error.body.hint && <div className="muted">Cách khắc phục: {u.error.body.hint}</div>}
          <div className="row mt8" style={{ gap: 6 }}>
            {dup ? (
              <><button className="btn xs orange" onClick={() => onRetry(true)}>Vẫn nhập bản trùng</button><button className="btn xs ghost" onClick={onDismiss}>Bỏ qua</button></>
            ) : (
              !["ASSET_CORRUPT", "ASSET_UNSUPPORTED"].includes(u.error.body.code) && <button className="btn xs" onClick={() => onRetry(false)}>Thử lại</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QualityCard({ asset, loading }: { asset: any; loading: boolean }) {
  const scenes: any[] = asset?.scenes || [];
  const analysis = asset?.meta_json?.analysis;
  const audio = analysis?.audio;
  const withQ = scenes.filter((s) => s.quality_json && s.quality_json.brightness !== undefined);
  const avg = (k: string) => (withQ.length ? Math.round(withQ.reduce((a, s) => a + (Number(s.quality_json[k]) || 0), 0) / withQ.length) : null);
  const bright = avg("brightness");
  const score = avg("score");
  const shaky = withQ.filter((s) => s.quality_json.shaky).length;
  const dark = withQ.filter((s) => s.quality_json.dark).length;
  const tone = (good: boolean, warn?: boolean) => (good ? "teal" : warn ? "orange" : "red");

  const cards: Array<{ k: string; tone: any; v: string }> = !analysis
    ? []
    : [
        { k: "Độ sáng", tone: bright === null ? "gray" : tone(bright >= 60, bright >= 35), v: bright === null ? "Không kiểm tra" : `${bright >= 60 ? "Tốt" : bright >= 35 ? "Hơi tối" : "Tối"} (${bright}/100)` },
        { k: "Âm thanh", tone: !audio ? "gray" : !audio.has_audio || audio.silent ? "orange" : audio.clipping ? "red" : "teal", v: !audio ? "—" : !audio.has_audio ? "Không có tiếng" : audio.silent ? "Gần như im lặng" : audio.clipping ? `Bị rè (peak ${audio.peak_db} dB)` : `Rõ · TB ${audio.mean_db} dB` },
        { k: "Điểm chất lượng", tone: score === null ? "gray" : tone(score >= 60, score >= 40), v: score === null ? "Không kiểm tra" : `${score >= 60 ? "Tốt" : score >= 40 ? "Trung bình" : "Kém"} (${score}/100)` },
        { k: "Rung hình", tone: !withQ.length ? "gray" : shaky === 0 ? "teal" : "orange", v: !withQ.length ? "Không kiểm tra" : shaky === 0 ? "Không phát hiện" : `${shaky}/${withQ.length} cảnh rung` },
        { k: "Khung hình lỗi", tone: !withQ.length ? "gray" : dark === 0 ? "teal" : "orange", v: !withQ.length ? "Không kiểm tra" : dark === 0 ? "Không phát hiện" : `${dark} cảnh quá tối` },
      ];
  return (
    <Card title="Đánh giá chất lượng tư liệu" right={<span className="small muted">Kiểm tra trước khi phân tích nội dung</span>}>
      {loading ? (
        <Loading rows={2} />
      ) : !asset ? (
        <div className="small muted">Chọn một video để xem đánh giá.</div>
      ) : !analysis ? (
        <div className="grid g5">
          {["Độ sáng", "Âm thanh", "Điểm chất lượng", "Rung hình", "Khung hình lỗi"].map((k) => (
            <div key={k} className="inner center"><Badge tone="gray">{k}</Badge><div className="semi mt8 muted">Chưa phân tích</div></div>
          ))}
        </div>
      ) : (
        <div className="grid g5">
          {cards.map((c) => (
            <div key={c.k} className="inner center" style={{ padding: "14px 10px" }}>
              <Badge tone={c.tone}>{c.k}</Badge>
              <div className="semi mt8">{c.v}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function StorageBlock({ s }: { s: any }) {
  const parts = [
    { k: "Media", v: s.media },
    { k: "Proxy & keyframe", v: s.proxy },
    { k: "Output", v: s.output },
    { k: "Giọng đọc", v: s.voice },
    { k: "Tạm", v: s.work },
    { k: "Model", v: s.models },
  ];
  const used = parts.reduce((a, p) => a + (p.v || 0), 0);
  const free = s.disk_free_gb * 1024 ** 3;
  return (
    <>
      <div className="semi">Ổ dữ liệu: {s.disk_free_gb.toFixed(1).replace(".", ",")} GB trống</div>
      <Bar value={(used / Math.max(1, used + free)) * 100} style={{ marginTop: 8 }} />
      <div className="xs muted mt8">App đang dùng {bytes(used)} ({parts.filter((p) => p.v).map((p) => `${p.k} ${bytes(p.v)}`).join(" · ") || "chưa có dữ liệu"})</div>
    </>
  );
}

function ImportPathModal({ open, onClose, projectId, rights, onDone }: { open: boolean; onClose: () => void; projectId: string; rights: string; onDone: () => void }) {
  const { toast, toastError } = useApp();
  const [path, setPath] = useState("");
  const [copy, setCopy] = useState(true);
  const [res, setRes] = useState<any>(null);
  useEffect(() => {
    if (open) setRes(null);
  }, [open]);
  async function run() {
    if (!path.trim()) return undefined;
    try {
      const r = await api.post("/assets/import-path", { project_id: projectId, path: path.trim(), copy_files: copy, rights });
      setRes(r);
      toast({ kind: r.errors.length ? "warn" : "success", title: `Đã nhập ${r.imported.length} tệp`, body: r.errors.length ? `${r.errors.length} tệp lỗi` : undefined });
      onDone();
      return r;
    } catch (e) {
      toastError(e, "Không nhập được từ đường dẫn");
      return undefined;
    }
  }
  const summary = useMemo(() => res?.errors || [], [res]);
  return (
    <Modal open={open} onClose={onClose} title={<><FolderOpen size={16} /> Nhập từ thư mục / đường dẫn</>} footer={<><Btn kind="ghost" onClick={onClose}>Đóng</Btn><Btn kind="primary" icon={<Upload size={15} />} disabled={!path.trim()} onClick={run}>Nhập</Btn></>}>
      <Field label="Đường dẫn file hoặc thư mục trên máy" hint="Ví dụ: ~/Movies/serum hoặc /Volumes/Data/quay/clip01.mp4">
        <input className="input mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/Users/…/footage" />
      </Field>
      <div className="row between mt12">
        <div><div className="semi small">Sao chép vào thư mục dữ liệu app</div><div className="xs muted">Tắt để chỉ tham chiếu file gốc (không di chuyển, không sửa).</div></div>
        <Toggle on={copy} onChange={setCopy} />
      </div>
      <div className="xs muted mt8">Quyền mặc định: {RIGHTS[rights]?.label}</div>
      {res && (
        <div className="mt12 col" style={{ gap: 6 }}>
          <div className="small"><CheckCircle2 size={13} className="c-teal" /> Nhập thành công {res.imported.length} tệp.</div>
          {summary.map((e: any, i: number) => (
            <div key={i} className="err-box xs"><b>{e.file}</b>: {e.message} <span className="mono muted">[{e.code}]</span>{e.hint && <div className="muted">{e.hint}</div>}</div>
          ))}
        </div>
      )}
      {res === null && <div className="mt12"><InfoNote>Video nhập xong sẽ tự tạo proxy để xem nhanh; phân tích chỉ chạy khi bạn bấm “Phân tích video”.</InfoNote></div>}
    </Modal>
  );
}
