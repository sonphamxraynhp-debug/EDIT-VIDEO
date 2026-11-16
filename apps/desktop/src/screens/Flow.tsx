/** Luồng một cửa: thả video vào → sản phẩm & căn cứ → kịch bản → xem & duyệt → xuất. Mỗi bước xong tự chuyển bước kế. */
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Clapperboard, Download, FileText, FolderOpen, Loader2, Plus,
  RefreshCw, ShieldCheck, Sparkles, Trash2, Upload, Volume2, Wand2, X,
} from "lucide-react";
import { api, ApiError, fileUrl, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { ms } from "../lib/format";
import { ACTIVE_JOB, uploadWithProgress } from "../components/a_flow";
import { ReasonModal, qcChecks, qcWarnings, useDecide, videoOf } from "../components/d_review";
import { Badge, Bar, Btn, Card, Empty, Field, InfoNote, Loading, PageHead, Warn } from "../components/ui";

const STEPS = [
  { label: "Đưa video vào", sub: "Thả video, máy tự phân tích" },
  { label: "Sản phẩm & căn cứ", sub: "Xác nhận câu được phép nói" },
  { label: "Kịch bản", sub: "AI viết, bạn duyệt" },
  { label: "Xem & duyệt video", sub: "Xem bản nháp, chọn bản dùng" },
  { label: "Xuất video", sub: "Bản final + gói quảng cáo" },
];

const PAST_SCRIPT = ["SCRIPT_APPROVED", "STORYBOARD_READY", "PREVIEW_READY", "QC_PENDING", "APPROVED", "RENDERING", "COMPLETED", "FAILED"];
const APPROVED_UP = ["APPROVED", "RENDERING", "COMPLETED"];
const KEY_TAGS: Array<[string, string]> = [["demonstration", "Đang thao tác"], ["hand", "Có bàn tay"], ["face", "Có khuôn mặt"], ["packshot", "Cận sản phẩm"]];

const BEAT_VI: Record<string, string> = { hook: "Mở đầu", body: "Nội dung", cta: "Kêu gọi" };
const count = (m: Record<string, number>, keys: string[]) => keys.reduce((a, k) => a + (m[k] || 0), 0);

type Mode = "ai" | "manual";

/** Lời cảnh báo của máy → câu người thường đọc được: bỏ mã nội bộ, đổi thuật ngữ. */
function plain(t: string): string {
  return (t || "")
    .replace(/^\s*\[?[A-Z]+-[A-Z0-9-]+\]?:?\s*/, "")
    .replace(/\bBeat (\d+)/g, "Câu $1")
    .replace(/Thiếu cảnh ([^—]+) — dùng cảnh thay thế/, (_m, x: string) => `Video nguồn chưa có cảnh ${x.split(",").map((k) => SHOT_VI[k.trim()] || k.trim()).join(", ")}; máy đã dùng cảnh khác thay`)
    .replace("Kịch bản giống biến thể gần nhất", "Lời thoại khá giống một bản khác:")
    .replace(" (ngưỡng 60%)", "")
    .replace(/khối chữ chạm vùng UI TikTok.*/, "chỗ chữ có thể bị nút TikTok che")
    .replace("Có giọng AI tổng hợp – xét nhãn disclosure khi đăng", "Video dùng giọng AI: nhớ bật nhãn “nội dung AI” khi đăng")
    .replace("phụ đề tràn khung", "câu phụ đề quá dài, đã bị cắt bớt")
    .replace("không gắn claim đã duyệt", "chưa khớp câu nào bạn đã xác nhận")
    .replace(/Điểm nguyên bản (\d+)% \(tối thiểu \d+%\)/, "Độ khác biệt so với các bản khác: $1%")
    .replace("(frozen) ", "").replace("clipping (peak", "vỡ tiếng (đỉnh").replace("footage", "cảnh quay");
}
const SHOT_VI: Record<string, string> = { cta: "kêu gọi", presenter: "người dẫn", testimonial: "khách hàng chia sẻ", unboxing: "mở hộp", packshot: "cận sản phẩm", insert: "cận chi tiết", close_up: "cận cảnh", demonstration: "đang thao tác", hand: "có bàn tay", face: "có khuôn mặt", before_after: "trước và sau", lifestyle: "đời thường", screen: "màn hình" };

export default function Flow() {
  const { projectId } = useApp();
  const [sp] = useSearchParams();
  // Đổi dự án là dựng lại toàn bộ màn: không giữ nhầm bước, căn cứ hay nội dung đang gõ của dự án trước
  return <FlowInner key={sp.get("new") === "1" ? "new" : projectId || "new"} />;
}

function FlowInner() {
  const { projectId, setProjectId, toastError } = useApp();
  const [sp, setSp] = useSearchParams();
  const fresh = sp.get("new") === "1" || !projectId;
  const q = useApi<any>(!fresh && projectId ? `/flow/${projectId}` : null, undefined, 3000);
  const f = q.data;
  const [picked, setPicked] = useState<number | null>(null);

  const done = useMemo(() => {
    if (!f) return [false, false, false, false, false];
    const analyzing = f.assets.some((a: any) => !a.analysis || ACTIVE_JOB.includes(a.analysis.status));
    const scenes = f.assets.reduce((n: number, a: any) => n + a.scenes.length, 0);
    const v = f.variants as Record<string, number>;
    return [
      f.assets.length > 0 && !analyzing && scenes > 0,
      f.approved_claims > 0,
      count(v, PAST_SCRIPT) > 0,
      count(v, APPROVED_UP) > 0,
      (v.COMPLETED || 0) > 0,
    ];
  }, [f]);
  const auto = Math.max(0, done.findIndex((d) => !d)) || (done.every(Boolean) ? 4 : 0);
  const step = fresh ? 0 : picked ?? (done.every(Boolean) ? 4 : auto);

  // Chỉ tự chuyển bước khi bước đang xem là bước chờ máy (phân tích video); bước người dùng tự nhập thì giữ nguyên
  // để họ nhập xong rồi tự bấm "Tiếp". Màn đang ở chế độ tự động thì khoá lại bước hiện tại khi người dùng bắt đầu nhập.
  const lastAuto = useRef(auto);
  useEffect(() => {
    const prev = lastAuto.current;
    lastAuto.current = auto;
    if (auto <= prev) return;
    if (picked === null && prev >= 1) setPicked(prev);
    else if (picked === 0 && !userPicked.current) setPicked(null);
  }, [auto, picked]);

  const userPicked = useRef(false);     // người tự bấm sang bước nào thì ở yên bước đó, máy không tự đẩy đi
  const go = (i: number) => { userPicked.current = true; setPicked(i); };
  const mode: Mode = fresh ? (sp.get("mode") === "ai" ? "ai" : "manual") : f?.project?.settings_json?.mode === "ai" ? "ai" : "manual";
  const startNew = () => { setPicked(null); setSp({ new: "1", mode }); };
  const onCreated = (pid: string) => { setProjectId(pid); setSp({}); setPicked(null); };
  const switchMode = async (to: Mode) => {
    if (fresh) return setSp({ new: "1", mode: to });
    try { await api.patch(`/projects/${projectId}`, { settings_json: { ...(f?.project?.settings_json || {}), mode: to } }); q.reload(); }
    catch (e) { toastError(e); }
  };
  const actions = (
    <div className="row" style={{ gap: 8 }}>
      <Btn kind="ghost" size="sm" icon={mode === "ai" ? <FileText size={15} /> : <Sparkles size={15} />} onClick={() => switchMode(mode === "ai" ? "manual" : "ai")}>
        Chuyển sang {mode === "ai" ? "Manual" : "chế độ AI"}
      </Btn>
      {!fresh && <Btn kind="ghost" size="sm" icon={<Plus size={15} />} onClick={startNew}>Sản phẩm mới</Btn>}
    </div>
  );

  if (!fresh && !f) return q.error
    ? <Warn title="Không tải được dự án">{q.error.body?.message || "Mất kết nối với app."} <button className="btn ghost sm" onClick={() => q.reload()}>Thử lại</button></Warn>
    : <Loading rows={5} h={22} />;
  if (mode === "ai" && fresh)
    return (
      <>
        <PageHead title="Tạo video · Chế độ AI" sub="Thả video vào, AI tự làm hết. Bạn chỉ chọn video nào dùng; nội dung nào cũng sửa tay được." icon={<Sparkles size={22} />} actions={actions} />
        <StepVideo f={null} mode="ai" onCreated={onCreated} />
      </>
    );
  if (mode === "ai") return <AutoFlow f={f} reload={q.reload} actions={actions} />;

  return (
    <>
      <PageHead
        title="Tạo video · Chế độ Manual"
        sub="Bạn tự làm từng bước: đưa video, nhập thông tin, chọn kiểu video, duyệt kịch bản, chọn video. Bước nào xong bấm “Tiếp”."
        icon={<FileText size={22} />}
        actions={actions}
      />
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="stepper flow-stepper">
          {STEPS.map((s, i) => {
            const reachable = !fresh && (i <= auto || done[i] || done[i - 1]);
            return (
              <div key={s.label} className={`step ${i === step ? "on" : done[i] ? "done" : ""}`}
                style={{ cursor: reachable ? "pointer" : "default", opacity: reachable || i === step ? 1 : 0.55 }}
                onClick={() => reachable && go(i)}>
                <span className="n">{done[i] && i !== step ? <Check size={13} /> : i + 1}</span>
                <span className="col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="ellipsis">{s.label}</span>
                  <span className="xs muted ellipsis" style={{ fontWeight: 400 }}>{s.sub}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {fresh ? (
        <StepVideo f={null} mode="manual" onCreated={onCreated} />
      ) : (
        <>
          <div className="row between mb12">
            <div className="small t2">Sản phẩm đang làm: <b>{f.project.product?.name || f.project.name}</b></div>
            {f.active_jobs > 0 && <Badge tone="purple" icon={<Loader2 size={12} className="spin" />}>Máy đang xử lý {f.active_jobs} việc</Badge>}
          </div>
          <AsrNote f={f} reload={q.reload} />
          {step === 0 && <StepVideo f={f} reload={q.reload} next={done[0] ? () => go(1) : undefined} />}
          {step === 1 && <StepProduct f={f} lock="manual" reload={q.reload} back={() => go(0)} next={() => go(2)} />}
          {step === 2 && <StepScripts f={f} reload={q.reload} back={() => go(1)} next={() => go(3)} />}
          {step === 3 && <StepReview f={f} reload={q.reload} back={() => go(2)} next={() => go(4)} />}
          {step === 4 && <StepExport f={f} back={() => go(3)} more={() => go(2)} />}
        </>
      )}
    </>
  );
}

function NavRow({ back, next, nextLabel, nextDisabled, hint }: { back?: () => void; next?: () => unknown; nextLabel: string; nextDisabled?: boolean; hint?: string }) {
  if (!back && !next && !hint) return null;
  return (
    <div className="row between mt16" style={{ flexWrap: "wrap", gap: 10 }}>
      {back ? <Btn kind="ghost" icon={<ArrowLeft size={16} />} onClick={back}>Quay lại</Btn> : <span />}
      <div className="row" style={{ gap: 10 }}>
        {hint && <span className="small muted">{hint}</span>}
        {next && <Btn kind="primary" size="lg" disabled={nextDisabled} onClick={next}>{nextLabel} <ArrowRight size={16} /></Btn>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Bước 1: video */
function StepVideo({ f, reload, next, onCreated, mode = "manual", embedded }: { f: any; reload?: () => void; next?: () => void; onCreated?: (pid: string) => void; mode?: Mode; embedded?: boolean }) {
  const { toast, toastError, reloadProjects } = useApp();
  const [name, setName] = useState("");
  const [target, setTarget] = useState(6);
  const [vpref, setVpref] = useState<VoiceMode>("os");
  const [vname, setVname] = useState(PRESET_DEFAULT);
  const [vok, setVok] = useState(false);
  const vtouched = useRef(false);
  const vp = useApi<any>(!f && mode === "ai" ? "/voice/providers" : null);
  const ready = (id: string) => !!vp.data?.providers?.find((p: any) => p.id === id)?.ready;
  const vpresets: Preset[] = vp.data?.presets || [];
  const vconsent = vpref === "clone";
  useEffect(() => {      // máy có bộ giọng sẵn thì chế độ AI mặc định dùng giọng người thay cho giọng máy
    if (vtouched.current || !vpresets.length) return;
    setVpref("preset");
    setVname(vpresets.find((x) => x.name === PRESET_DEFAULT)?.name || vpresets[0].name);
  }, [vpresets.length]);
  const [over, setOver] = useState(false);
  const [ups, setUps] = useState<Array<{ id: number; name: string; p: number; err?: string }>>([]);
  const input = useRef<HTMLInputElement>(null);
  const creating = useRef<Promise<string> | null>(null);   // thả thêm file khi đang tải vẫn vào cùng một dự án
  const seq = useRef(0);

  async function addFiles(list: FileList | null) {
    const all = Array.from(list || []);
    const files = all.filter((x) => /\.(mp4|mov|m4v|mkv|webm)$/i.test(x.name));
    if (all.length > files.length)
      toast({ kind: "warn", title: `Bỏ qua ${all.length - files.length} file không phải video`, body: "App nhận MP4, MOV, M4V, MKV, WEBM. File khác hãy đổi sang MP4 rồi thả lại." });
    if (!files.length) return;
    let pid = f?.project?.id as string | undefined;
    try {
      if (!pid) {
        if (mode === "ai" && vconsent && !vok) { toastError(new ApiError({ code: "CONSENT_REQUIRED", message: "Tick ô xác nhận đồng ý dùng giọng trước khi thả video" }, 422)); return; }
        if (!creating.current) {
          const pname = name.trim() || files[0].name.replace(/\.[^.]+$/, "");
          creating.current = api.post("/projects", { name: pname, product_name: pname, target_count: target, description: "", mode,
            voice_pref: mode === "ai" ? { mode: vpref, consent: vconsent && vok, name: vpref === "preset" ? vname : undefined } : undefined }).then((p: any) => p.id as string);
        }
        pid = await creating.current;
      }
    } catch (e) {
      creating.current = null;
      toastError(e, "Không tạo được dự án");
      return;
    }
    const rows = files.map((x) => ({ id: ++seq.current, name: x.name, p: 0 }));
    setUps((u) => [...u, ...rows]);
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i], id = rows[i].id;
      const fd = new FormData();
      fd.append("project_id", pid!);
      fd.append("file", file);
      try {
        const a = await uploadWithProgress("/assets/import", fd, (p) => setUps((u) => u.map((x) => (x.id === id ? { ...x, p } : x))));
        await api.post("/analysis/jobs", { asset_id: a.id });
        setUps((u) => u.filter((x) => x.id !== id));
        ok++;
      } catch (e) {
        const msg = e instanceof ApiError ? e.body.message : String(e);
        setUps((u) => u.map((x) => (x.id === id ? { ...x, err: msg } : x)));
        toast({ kind: "error", title: `Không nhận được ${file.name}`, body: msg });   // màn có thể đổi ngay sau đó, lỗi vẫn phải thấy
      }
    }
    reloadProjects();
    if (onCreated && pid && ok > 0) onCreated(pid);
    reload?.();
  }

  const assets: any[] = f?.assets || [];
  return (
    <div className="grid" style={{ gridTemplateColumns: assets.length ? "minmax(0,1fr) minmax(0,1.6fr)" : "1fr", alignItems: "start" }}>
      <Card title={assets.length ? "Thêm video" : "Bắt đầu: đưa video quay thật vào"} icon={<Upload size={16} className="c-primary" />}>
        {!f && (
          <Field label="Tên sản phẩm (không bắt buộc)" hint={mode === "ai" ? "Để trống thì AI tự đặt tên theo nội dung clip." : "Để trống thì lấy theo tên file video."}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Khoá học AI cho chủ doanh nghiệp" />
          </Field>
        )}
        {!f && mode === "ai" && (
          <Field label="Muốn bao nhiêu video?" hint="Ít video nguồn thì AI tự giảm số bản để các bản không trùng nhau.">
            <div className="row" style={{ gap: 8 }}>
              {[3, 6, 10, 20].map((x) => <span key={x} className={`chip ${target === x ? "on" : ""}`} onClick={() => setTarget(x)}>{x} video</span>)}
            </div>
          </Field>
        )}
        {!f && mode === "ai" && (
          <Field label="Giọng đọc" hint={!vp.data || ready("vieneu_clone") ? undefined : "Máy này chưa cài bộ giọng nhái nên chỉ dùng được giọng máy. Liên hệ người cài đặt nếu cần."}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {VOICE_OPTS.map((o) => {
                const off = o.id === "clone" ? !ready("vieneu_clone") : o.id === "preset" ? !vpresets.length : false;
                return <span key={o.id} className={`chip ${vpref === o.id ? "on" : ""}`} style={{ opacity: off ? 0.4 : 1, cursor: off ? "not-allowed" : "pointer" }}
                  onClick={() => { if (!off) { vtouched.current = true; setVpref(o.id); setVok(false); } }}>{o.label}</span>;
              })}
            </div>
            {vpref === "preset" && <div className="mt8"><PresetGrid presets={vpresets} value={vname} onPick={(n) => { vtouched.current = true; setVname(n); }} /></div>}
            {vconsent && (
              <label className="row small mt8" style={{ gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" checked={vok} onChange={(e) => setVok(e.target.checked)} style={{ marginTop: 3 }} />
                <span><b>Xác nhận:</b> Người nói trong clip đã đồng ý cho dùng giọng của họ để tạo giọng AI; video sẽ ghi rõ có dùng giọng AI.</span>
              </label>
            )}
          </Field>
        )}
        <div
          className={`dropzone ${over ? "over" : ""}`}
          style={{ minHeight: assets.length ? 150 : 240, marginTop: 12 }}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
        >
          <Upload size={30} className="c-primary" />
          <div className="bold">Kéo thả video vào đây hoặc bấm để chọn</div>
          <div className="small muted">MP4, MOV… Nhiều video khác góc máy thì ra nhiều bản khác nhau hơn.</div>
          <input ref={input} type="file" accept="video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
        {ups.map((u) => (
          <div key={u.id} className="mt12">
            <div className="row between small"><span className="ellipsis">{u.name}</span><b>{u.err ? "Lỗi" : `${Math.round(u.p * 100)}%`}</b></div>
            {u.err ? <div className="xs c-red">{u.err}</div> : <Bar value={u.p * 100} thin style={{ marginTop: 6 }} />}
          </div>
        ))}
        {!assets.length && (
          <InfoNote>{mode === "ai"
            ? "Thả video xong là AI tự làm hết: phân tích, đọc lời thoại lập hồ sơ, viết kịch bản, dựng bản xem thử. Bạn chỉ cần chọn video nào dùng."
            : "Sau khi thả video, máy tự: tạo dự án, cắt cảnh, đọc chữ trên hình, nghe lời thoại. Xong thì bạn sang bước nhập thông tin."}</InfoNote>
        )}
      </Card>
      {assets.length > 0 && (
        <Card title={`Video đã đưa vào (${assets.length})`} icon={<Clapperboard size={16} className="c-primary" />}
          sub="Bấm nhãn để sửa nếu máy đoán sai. Nhãn đúng giúp AI chọn kiểu video phù hợp; không bắt buộc.">
          <div className="col" style={{ gap: 16 }}>
            {assets.map((a) => <AssetRow key={a.id} a={a} reload={reload!} />)}
          </div>
        </Card>
      )}
      {assets.length > 0 && !embedded && (
        <div style={{ gridColumn: "1 / -1" }}>
          <NavRow next={next} nextDisabled={!next} nextLabel="Tiếp: Sản phẩm & căn cứ" hint={next ? undefined : "Đợi máy phân tích xong…"} />
        </div>
      )}
    </div>
  );
}

function AssetRow({ a, reload }: { a: any; reload: () => void }) {
  const { toastError } = useApp();
  const job = a.analysis;
  const running = !job || ACTIVE_JOB.includes(job.status);
  const failed = job && job.status === "FAILED";
  // Giữ nhãn tại chỗ: bấm liên tiếp nhiều nhãn không bị lần sau ghi đè bằng dữ liệu cũ chưa tải lại
  const [local, setLocal] = useState<Record<string, string[]>>({});
  const tagsOf = (s: any): string[] => local[s.id] ?? s.tags_json;
  async function toggle(s: any, tag: string) {
    const cur = tagsOf(s);
    const tags = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
    setLocal((m) => ({ ...m, [s.id]: tags }));
    try { await api.patch(`/scenes/${s.id}`, { tags_json: tags }); reload(); } catch (e) { toastError(e); }
  }
  async function drop(s: any) {
    try { await api.patch(`/scenes/${s.id}`, { review: s.review === "rejected" ? "pending" : "rejected" }); reload(); } catch (e) { toastError(e); }
  }
  return (
    <div className="inner" style={{ padding: 12 }}>
      <div className="row between">
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          {a.thumbnail && <img src={fileUrl(a.thumbnail)} alt="" style={{ width: 34, height: 60, objectFit: "cover", borderRadius: 6 }} />}
          <div style={{ minWidth: 0 }}>
            <div className="bold ellipsis">{a.file_name}</div>
            <div className="xs muted">{ms(a.duration_ms)} · {a.scenes.length} cảnh</div>
          </div>
        </div>
        {running ? <Badge tone="purple" icon={<Loader2 size={12} className="spin" />}>Đang phân tích {job ? Math.round((job.progress || 0) * 100) : 0}%</Badge>
          : failed ? <Btn size="sm" kind="orange" icon={<RefreshCw size={14} />} onClick={async () => { try { await api.post("/analysis/jobs", { asset_id: a.id }); reload(); return true; } catch (e) { toastError(e, "Chưa phân tích lại được"); return undefined; } }}>Phân tích lại</Btn>
          : <Badge tone="teal" icon={<CheckCircle2 size={12} />}>Đã phân tích</Badge>}
      </div>
      {failed && <div className="xs c-red mt8">{job.error_message}</div>}
      {a.scenes.length > 0 && (
        <div className="flow-scenes mt12">
          {a.scenes.map((s: any) => (
            <div key={s.id} className="flow-scene" style={{ opacity: s.review === "rejected" ? 0.4 : 1 }}>
              <div style={{ position: "relative" }}>
                <img src={fileUrl(s.keyframe)} alt="" />
                <button className="flow-x" title={s.review === "rejected" ? "Dùng lại cảnh này" : "Không dùng cảnh này"} onClick={() => drop(s)}>
                  {s.review === "rejected" ? <RefreshCw size={12} /> : <X size={12} />}
                </button>
                <span className="flow-time">{ms(s.start_ms)}</span>
              </div>
              <div className="flow-tags">
                {KEY_TAGS.map(([t, l]) => (
                  <span key={t} className={`chip ${tagsOf(s).includes(t) ? "on" : ""}`} onClick={() => toggle(s, t)}>{l}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Bước 2: sản phẩm */
const FIELDS: Array<[string, string, string]> = [
  ["short_description", "Mô tả ngắn", "Sản phẩm là gì, dùng để làm gì"],
  ["usp", "Điểm khác biệt", "Điều chỉ sản phẩm này có"],
  ["price", "Giá / ưu đãi", "VD: 2.990.000đ"],
  ["usage", "Cách dùng / cách tham gia", "Các bước sử dụng"],
  ["audience", "Dành cho ai", "Chân dung khách hàng"],
  ["allowed_cta", "Lời kêu gọi được phép", "VD: Đăng ký tư vấn · Xem chi tiết"],
];

function StepProduct({ f, reload, back, next, lock, embedded }: { f: any; reload: () => void; back?: () => void; next?: () => void; lock?: Mode; embedded?: boolean }) {
  const { toastError, toast } = useApp();
  const pq = useApi<any>(f.product_id ? `/products/${f.product_id}` : null);
  const b = pq.data;
  const [attrs, setAttrs] = useState<Record<string, any>>({});
  const [notes, setNotes] = useState("");
  const [newClaim, setNewClaim] = useState("");
  const [evTitle, setEvTitle] = useState("");
  const [evId, setEvId] = useState<string>("");
  const [mode, setMode] = useState<Mode | null>(lock ?? null);
  const [aiRes, setAiRes] = useState<any>(null);
  const [reading, setReading] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);

  const dirty = useRef<Set<string>>(new Set());     // mục người đang gõ mà chưa lưu: không để dữ liệu tải lại đè lên
  const edit = (k: string, v: any) => { dirty.current.add(k); setAttrs((a) => ({ ...a, [k]: v })); };
  // AI vừa đọc clip xong (số câu đổi) thì tải lại hồ sơ để thấy phần AI điền
  useEffect(() => { pq.reload(); }, [f.approved_claims, f.claims?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!b) return;
    const a = b.product.attributes_json || {};
    setAttrs((prev) => ({ ...a, ...Object.fromEntries([...dirty.current].map((k) => [k, prev[k]])) }));
    if (!evId && b.evidence[0]) setEvId(b.evidence[0].id);
    // Lần đầu vào bước: đoán cách đang dùng từ dữ liệu đã có; chưa có gì thì cho chọn
    setMode((m) => lock ?? m ?? (a.source === "clip" ? "ai" : FIELDS.some(([k]) => a[k]) || b.claims.length ? "manual" : null));
  }, [b]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!f.product_id) return <Warn title="Dự án chưa có hồ sơ sản phẩm">Bấm nút “Sản phẩm mới” ở góc trên bên phải để bắt đầu lại.</Warn>;
  if (!b) return <Loading rows={6} h={22} />;
  const refresh = () => { pq.reload(); reload(); };

  async function saveAttrs() {
    if (!dirty.current.size) return true;            // không đổi gì thì không ghi (ghi thừa làm các bản đã duyệt phải rà lại)
    const patch: Record<string, any> = {};
    for (const k of dirty.current)
      patch[k] = k === "blocked_phrases" && typeof attrs[k] === "string"
        ? attrs[k].split(/[,;\n]/).map((x: string) => x.trim()).filter(Boolean) : attrs[k] ?? "";
    try {
      await api.put(`/products/${f.product_id}`, { attributes_patch: patch });
      dirty.current.clear();
      return true;
    } catch (e) { toastError(e, "Không lưu được hồ sơ"); return undefined; }
  }
  async function aiDraft() {
    try {
      await saveAttrs();
      const r = await api.post(`/products/${f.product_id}/ai-draft`, { notes: notes || FIELDS.map(([k, l]) => `${l}: ${attrs[k] || ""}`).join("\n") });
      const d = r.draft || {};
      for (const k of ["short_description", "usp", "usage"]) if (!attrs[k] && d[k]) edit(k, d[k]);
      await saveAttrs();
      toast({ kind: "success", title: `AI đề xuất ${(d.claims || []).length} câu`, body: "Đọc kỹ và chỉ xác nhận câu đúng sự thật." });
      refresh();
      return true;
    } catch (e) { toastError(e, "AI chưa gợi ý được"); return undefined; }
  }
  async function addEvidence() {
    try {
      const ev = await api.post(`/products/${f.product_id}/evidence`, { title: evTitle.trim(), kind: "DOC", source_uri: "Chủ sản phẩm cung cấp" });
      setEvId(ev.id); setEvTitle(""); refresh(); return true;
    } catch (e) { toastError(e); return undefined; }
  }
  async function uploadEvidence(file?: File) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try { const ev = await uploadWithProgress(`/products/${f.product_id}/evidence/upload`, fd, () => {}); setEvId(ev.id); refresh(); }
    catch (e) { toastError(e, "Không tải được tài liệu"); }
  }
  async function setClaim(c: any, status: string) {
    try {
      await api.put(`/claims/${c.id}`, { text: c.text, status, risk_level: c.risk_level || "low", evidence_id: status === "approved" ? c.evidence_id || evId : c.evidence_id });
      refresh();
    } catch (e) { toastError(e); }
  }
  async function addClaim() {
    try {
      await api.post(`/products/${f.product_id}/claims`, { text: newClaim.trim(), status: evId ? "approved" : "needs_review", evidence_id: evId || null });
      setNewClaim(""); refresh(); return true;
    } catch (e) { toastError(e); return undefined; }
  }

  async function fromClips() {
    setMode("ai");
    setReading(true);
    try {
      await saveAttrs();
      const r = await api.post(`/products/${f.product_id}/from-clips`);
      setAiRes(r);
      toast({ kind: "success", title: `AI đã đọc ${r.videos} clip`, body: `${r.approved} câu tự xác nhận, ${r.needs_review} câu chờ bạn xem.` });
      refresh();
      return true;
    } catch (e) { toastError(e, "AI chưa đọc được clip"); return undefined; }
    finally { setReading(false); }
  }

  const claims: any[] = b.claims.filter((c: any) => c.status !== "prohibited");
  const approved = claims.filter((c) => c.status === "approved").length;
  const evTitleOf = (id?: string) => b.evidence.find((e: any) => e.id === id)?.title;
  const withSpeech = f.assets.filter((a: any) => (a.speech || "").trim());

  if (mode === null)
    return (
      <>
        <div className="small t2 mb12">Chọn cách lập hồ sơ sản phẩm. Đổi cách lúc nào cũng được.</div>
        <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <div className="card flow-choice" onClick={() => setMode("manual")}>
            <FileText size={26} className="c-primary" />
            <div className="bold mt8" style={{ fontSize: 16 }}>1. Điền tay</div>
            <div className="small t2 mt4">Bạn tự gõ thông tin sản phẩm và các câu được phép nói, kèm tài liệu căn cứ. Hợp khi clip không có lời thoại hoặc bạn muốn kiểm soát từng chữ.</div>
          </div>
          <div className="card flow-choice" onClick={() => fromClips()}>
            <Sparkles size={26} className="c-primary" />
            <div className="bold mt8" style={{ fontSize: 16 }}>2. AI đọc clip, tự làm</div>
            <div className="small t2 mt4">AI nghe lời thoại và đọc chữ trên hình trong clip, tự điền hồ sơ. Câu nào trích đúng lời trong clip thì tự xác nhận, căn cứ là chính clip đó.</div>
            <div className={`xs mt8 ${withSpeech.length ? "c-teal" : "c-orange"}`}>
              {withSpeech.length ? `Có lời thoại ở ${withSpeech.length}/${f.assets.length} clip` : "Chưa nghe thấy lời thoại trong clip nào, AI chỉ còn chữ trên hình để đọc"}
              {!f.llm && " · AI chưa bật: dùng nguyên văn câu nói"}
            </div>
          </div>
        </div>
        <NavRow back={back} nextLabel="Tiếp: Viết kịch bản" nextDisabled hint="Chọn một cách để bắt đầu" />
      </>
    );

  return (
    <>
      {!lock && <div className="row between mb12" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className={`chip ${mode === "manual" ? "on" : ""}`} onClick={() => setMode("manual")}><FileText size={13} /> Điền tay</span>
          <span className={`chip ${mode === "ai" ? "on" : ""}`} onClick={() => setMode("ai")}><Sparkles size={13} /> AI đọc clip, tự làm</span>
        </div>
      </div>}
      {mode === "ai" && (
        <Card title="AI đọc clip" icon={<Sparkles size={16} className="c-primary" />} className="mb12"
          sub="AI chỉ lấy thông tin có trong lời thoại và chữ trên hình. Bên dưới là kết quả, bạn xem lại hoặc sửa nếu cần."
          right={<Btn size="sm" icon={<RefreshCw size={14} />} loading={reading} onClick={fromClips}>{aiRes || attrs.source === "clip" ? "Đọc lại clip" : "Để AI đọc clip"}</Btn>}>
          {reading && <div className="row small c-primary mb12" style={{ gap: 8 }}><Loader2 size={14} className="spin" /> AI đang đọc lời thoại và chữ trên hình, khoảng 10–40 giây…</div>}
          {aiRes && !reading && (
            <div className="row mb12" style={{ gap: 8, flexWrap: "wrap" }}>
              <Badge tone="teal" icon={<Check size={12} />}>{aiRes.approved} câu tự xác nhận</Badge>
              {aiRes.needs_review > 0 && <Badge tone="orange">{aiRes.needs_review} câu chờ bạn xem</Badge>}
              {aiRes.filled.length > 0 && <Badge tone="purple">Điền {aiRes.filled.length} mục thông tin</Badge>}
            </div>
          )}
          <div className="col" style={{ gap: 6 }}>
            {f.assets.map((a: any) => (
              <div key={a.id} className="xs t2"><b>{a.file_name}:</b> {(a.speech || "").trim() ? `“${a.speech.slice(0, 220)}${a.speech.length > 220 ? "…" : ""}”` : <span className="muted">không có lời thoại</span>}</div>
            ))}
          </div>
        </Card>
      )}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", alignItems: "start" }}>
        <Card title="Thông tin sản phẩm" icon={<FileText size={16} className="c-primary" />} sub="Điền nhanh những gì bạn biết. AI chỉ dùng đúng các thông tin này.">
          <div className="col" style={{ gap: 10 }}>
            {FIELDS.map(([k, l, ph]) => (
              <Field key={k} label={l}>
                <input className="input" value={attrs[k] || ""} placeholder={ph} onChange={(e) => edit(k, e.target.value)} onBlur={saveAttrs} />
              </Field>
            ))}
            <Field label="Từ cấm nói" hint="Cách nhau bằng dấu phẩy. Kịch bản có từ này sẽ bị chặn.">
              <input className="input" value={Array.isArray(attrs.blocked_phrases) ? attrs.blocked_phrases.join(", ") : attrs.blocked_phrases || ""}
                placeholder="VD: cam kết thu nhập, đảm bảo 100%" onChange={(e) => edit("blocked_phrases", e.target.value)} onBlur={saveAttrs} />
            </Field>
            {f.llm && mode === "ai" && (
              <>
                <div className="divider" />
                <Field label="Ghi chú thô (tuỳ chọn)" hint="Dán mô tả, tin nhắn tư vấn… AI tách thành các câu được phép nói để bạn xác nhận.">
                  <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
                <Btn icon={<Sparkles size={15} />} onClick={aiDraft}>AI gợi ý các câu được phép nói</Btn>
              </>
            )}
          </div>
        </Card>
        <Card title={`Câu được phép nói trong video (${approved} đã xác nhận)`} icon={<ShieldCheck size={16} className="c-primary" />}
          sub="Video chỉ được nói những câu bạn đã xác nhận đúng và có căn cứ. Đây là chốt chặn để không nói sai sự thật.">
          <div className="inner" style={{ padding: 12 }}>
            <div className="small bold mb8">1. Căn cứ (tài liệu chứng minh)</div>
            {b.evidence.length > 0 && (
              <select className="select" value={evId} onChange={(e) => setEvId(e.target.value)}>
                {b.evidence.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            )}
            <div className="row mt8" style={{ gap: 8 }}>
              <input className="input" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder="Tên tài liệu: hồ sơ công bố, giáo trình, hợp đồng…" />
              <Btn size="sm" disabled={!evTitle.trim()} onClick={addEvidence}>Thêm</Btn>
              <Btn size="sm" kind="ghost" icon={<Upload size={14} />} onClick={() => fileIn.current?.click()}>Tải file</Btn>
              <input ref={fileIn} type="file" hidden onChange={(e) => { uploadEvidence(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          </div>
          <div className="small bold mt12 mb8">2. Xác nhận từng câu</div>
          {!claims.length && <div className="small muted mb8">Chưa có câu nào. Thêm tay bên dưới{f.llm ? " hoặc bấm “AI gợi ý”" : ""}.</div>}
          <div className="col" style={{ gap: 8 }}>
            {claims.map((c) => (
              <div key={c.id} className="row between inner" style={{ padding: "8px 10px", gap: 8 }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small">{c.text}</div>
                  {c.evidence_id && <div className="xs muted mt4">Căn cứ: {evTitleOf(c.evidence_id)}</div>}
                  {c.status !== "approved" && c.risk_level === "high" && <div className="xs c-orange mt4">Có cụm từ rủi ro, kiểm tra kỹ trước khi xác nhận</div>}
                  {c.status !== "approved" && c.risk_level === "medium" && !c.evidence_id && <div className="xs c-orange mt4">AI suy ra, không thấy nguyên văn trong clip</div>}
                  {c.status !== "approved" && c.risk_level === "medium" && c.evidence_id && <div className="xs c-orange mt4">AI đã sửa con số so với lời trong clip (máy có thể nghe nhầm), nghe lại clip rồi bấm Đúng</div>}
                </div>
                {c.status === "approved" ? (
                  <Badge tone="teal" icon={<Check size={12} />}>Đã xác nhận</Badge>
                ) : (
                  <Btn size="xs" kind="teal" disabled={!c.evidence_id && !evId} title={c.evidence_id || evId ? undefined : "Thêm căn cứ trước"} onClick={() => setClaim(c, "approved")}>Đúng</Btn>
                )}
                <button className="btn ghost xs" title={c.status === "approved" ? "Bỏ xác nhận" : "Xoá câu này"}
                  onClick={async () => { try { if (c.status === "approved") await setClaim(c, "needs_review"); else { await api.del(`/claims/${c.id}`); refresh(); } } catch (e) { toastError(e, "Chưa xoá được câu này"); } }}>
                  {c.status === "approved" ? <X size={13} /> : <Trash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
          <div className="row mt12" style={{ gap: 8 }}>
            <input className="input" value={newClaim} onChange={(e) => setNewClaim(e.target.value)} placeholder="Thêm câu, VD: Lớp học 3 buổi, có bài tập thực hành" />
            <Btn size="sm" disabled={!newClaim.trim()} onClick={addClaim}>Thêm</Btn>
          </div>
          {!evId && <div className="xs muted mt8">Cần ít nhất 1 căn cứ thì mới xác nhận được câu.</div>}
        </Card>
      </div>
      {!embedded && <NavRow back={back} nextLabel="Tiếp: Viết kịch bản" nextDisabled={!approved} hint={approved ? undefined : "Xác nhận ít nhất 1 câu để tiếp tục"}
        next={async () => { if (await saveAttrs()) next?.(); }} />}
    </>
  );
}

/* ------------------------------------------------------------------ Bước 3: kịch bản */
function StepScripts({ f, reload, back, next }: { f: any; reload: () => void; back: () => void; next: () => void }) {
  const { toastError, toast } = useApp();
  const cid = f.campaign_id;
  const cq = useApi<any>(cid ? `/campaigns/${cid}` : null);
  const vq = useApi<any>(cid ? `/campaigns/${cid}/variants` : null, { size: 200 }, 3000);
  const c = cq.data;
  const [n, setN] = useState<number>([3, 6, 10, 20].includes(f.project?.target) ? f.project.target : 6);
  const [durs, setDurs] = useState<number[]>([15, 30]);
  const [angles, setAngles] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const total = Object.values(f.variants as Record<string, number>).reduce((a, x) => a + x, 0);

  const feasible = useMemo(() => (c ? Object.entries<any>(c.angle_coverage).filter(([, a]) => a.feasible).map(([k]) => k) : []), [c]);
  const chosen = angles ?? feasible;
  if (!cid) return <Warn title="Dự án chưa có chiến dịch">Bấm nút “Sản phẩm mới” ở góc trên bên phải để bắt đầu lại.</Warn>;
  if (!c) return <Loading rows={5} h={22} />;

  async function generate() {
    setBusy(true);
    try {
      await api.put(`/campaigns/${cid}`, { target_count: n, brief_json: { ...c.brief_json, product_id: f.product_id, creative_angles: chosen,
        durations_sec: durs, formats: c.brief_json.formats || ["full", "packshot_text", "split", "pip"],
        audiences: c.brief_json.audiences || Object.keys(c.options.audiences).slice(0, 3) } });
      const r = await api.post(`/campaigns/${cid}/variants/generate`, { target: n, new_batch: total > 0 });
      (r.warnings || []).forEach((w: any) => toast({ kind: "warn", title: w.message, hint: w.hint }));
      await api.post(`/campaigns/${cid}/scripts/generate`, { use_llm: f.llm });
      toast({ kind: "success", title: `Đang viết ${r.created} kịch bản`, body: f.llm ? "AI viết trên máy, mỗi bản mất khoảng 10–40 giây." : "AI viết kịch bản chưa bật: dùng mẫu ghép từ câu đã xác nhận." });
      vq.reload(); reload();
    } catch (e) { toastError(e, "Không tạo được kịch bản"); }
    setBusy(false);
  }

  const items: any[] = (vq.data?.items || []).filter((v: any) => v.status !== "REJECTED");
  const ready = items.filter((v) => v.status === "SCRIPT_READY");
  const clean = ready.filter((v) => !v.script?.flags);
  const writing = items.filter((v) => v.status === "DRAFT" || v.status === "NEEDS_REVISION").length;
  const passed = items.filter((v) => PAST_SCRIPT.includes(v.status)).length;

  async function approve(ids: string[]) {
    let ok = 0;
    for (const id of ids) {
      try {
        await api.post(`/variants/${id}/script/approve`);
        await api.post(`/variants/${id}/storyboard`);
        await api.post(`/variants/${id}/preview`);
        ok++;
      } catch (e) { toastError(e); }
    }
    if (ok) toast({ kind: "success", title: `Đã duyệt ${ok} kịch bản`, body: "Máy đang dựng bản xem thử." });
    vq.reload(); reload();
  }

  return (
    <>
      {total === 0 || busy ? (
        <Card title="Bạn muốn bao nhiêu video?" icon={<Sparkles size={16} className="c-primary" />} sub="Mỗi video là một cách kể khác nhau từ cùng bộ video nguồn.">
          <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 18 }}>
            <Field label="Số video">
              <div className="row" style={{ gap: 8 }}>
                {[3, 6, 10, 20].map((x) => <span key={x} className={`chip ${n === x ? "on" : ""}`} onClick={() => setN(x)}>{x} video</span>)}
              </div>
            </Field>
            <Field label="Độ dài">
              <div className="row" style={{ gap: 8 }}>
                {[15, 30, 45].map((x) => (
                  <span key={x} className={`chip ${durs.includes(x) ? "on" : ""}`}
                    onClick={() => setDurs((d) => (d.includes(x) ? (d.length > 1 ? d.filter((y) => y !== x) : d) : [...d, x]))}>{x} giây</span>
                ))}
              </div>
            </Field>
          </div>
          <Field label="Kiểu video" hint="Kiểu bị mờ là thiếu cảnh phù hợp trong video nguồn (sửa nhãn cảnh ở bước 1 hoặc quay thêm).">
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {Object.entries<any>(c.angle_coverage).map(([k, a]) => (
                <span key={k} className={`chip ${chosen.includes(k) ? "on" : ""}`} style={{ opacity: a.feasible ? 1 : 0.4, cursor: a.feasible ? "pointer" : "not-allowed" }}
                  title={a.feasible ? undefined : `Thiếu cảnh: ${a.missing.join(", ")}`}
                  onClick={() => a.feasible && setAngles(chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k])}>{a.label}</span>
              ))}
            </div>
          </Field>
          <div className="row mt16" style={{ gap: 10 }}>
            <Btn kind="primary" size="lg" icon={<Wand2 size={17} />} loading={busy} disabled={!chosen.length} onClick={generate}>Viết {n} kịch bản</Btn>
            <span className="small muted">{f.llm ? "AI viết ngay trên máy." : "AI viết kịch bản chưa bật: dùng mẫu có sẵn."} Chỉ dùng {f.approved_claims} câu bạn đã xác nhận.</span>
          </div>
        </Card>
      ) : (
        <Card title={`Kịch bản (${items.length})`} icon={<FileText size={16} className="c-primary" />}
          sub="Đọc nhanh câu mở đầu. Duyệt bản nào thì máy dựng ngay bản xem thử bản đó."
          right={
            <div className="row" style={{ gap: 8 }}>
              {writing > 0 && <Badge tone="purple" icon={<Loader2 size={12} className="spin" />}>Đang viết {writing}</Badge>}
              <Btn size="sm" kind="ghost" icon={<Plus size={14} />} onClick={() => generate()}>Viết thêm {n} bản</Btn>
              {clean.length > 0 && <Btn size="sm" kind="teal" icon={<Check size={14} />} onClick={() => approve(clean.map((v) => v.id))}>Duyệt tất cả bản không cảnh báo ({clean.length})</Btn>}
            </div>
          }>
          <div className="col" style={{ gap: 8 }}>
            {items.map((v) => <ScriptRow key={v.id} v={v} onApprove={() => approve([v.id])} reload={vq.reload} />)}
          </div>
        </Card>
      )}
      <Card title="Giọng đọc" icon={<Sparkles size={16} className="c-primary" />} className="mt16" sub="Chọn giọng trước khi duyệt kịch bản. Đổi sau cũng được, video chưa xuất sẽ được dựng lại.">
        <VoicePicker f={f} />
      </Card>
      <NavRow back={back} next={next} nextLabel="Tiếp: Xem & duyệt video" nextDisabled={!passed} hint={passed ? undefined : "Duyệt ít nhất 1 kịch bản"} />
    </>
  );
}

function ScriptRow({ v, onApprove, reload, auto }: { v: any; onApprove: () => Promise<void>; reload: () => void; auto?: boolean }) {
  const { toastError, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<string[] | null>(null);
  const dq = useApi<any>(open ? `/variants/${v.id}` : null);
  const beats: any[] = dq.data?.script_full?.beats_json?.beats || [];
  const flags: any[] = dq.data?.script_full?.beats_json?.flags || [];
  const st = v.status;
  const canEdit = v.script && !["DRAFT", "RENDERING", "COMPLETED"].includes(st);
  async function save() {
    try {
      await api.put(`/variants/${v.id}/script`, { beats: beats.map((b, i) => ({ ...b, text: edit?.[i] ?? b.text })) });
      toast({ kind: "success", title: `Đã lưu kịch bản ${v.code}`, body: auto ? "AI sẽ tự kiểm tra, duyệt và dựng lại bản xem thử." : "Bấm Duyệt để dựng lại bản xem thử." });
      setEdit(null); dq.reload(); reload();
      return true;
    } catch (e) { toastError(e, "Không lưu được kịch bản"); return undefined; }
  }
  return (
    <div className="inner" style={{ padding: "10px 12px" }}>
      <div className="row between" style={{ gap: 10 }}>
        <div className="grow" style={{ minWidth: 0, cursor: v.script ? "pointer" : "default" }} onClick={() => v.script && setOpen(!open)}>
          <div className="xs muted">{v.code} · {v.angle_label} · {v.audience_label} · {v.concept_json?.duration}s</div>
          <div className="small bold mt4">{v.script?.hook ? `“${v.script.hook}”` : <span className="muted">Đang viết…</span>}</div>
        </div>
        {v.script?.flags > 0 && <Badge tone="orange" icon={<AlertTriangle size={12} />}>{v.script.flags} cảnh báo</Badge>}
        {canEdit && <Btn size="xs" kind="ghost" icon={<FileText size={13} />} onClick={() => { setOpen(true); setEdit([]); }}>Sửa</Btn>}
        {st === "SCRIPT_READY" ? (
          <>
            <Btn size="xs" kind="ghost" icon={<RefreshCw size={13} />} title="Viết lại bản khác"
              onClick={async () => { try { await api.post(`/variants/${v.id}/script`, undefined, { sync: false }); reload(); } catch (e) { toastError(e); } }}>Viết lại</Btn>
            <Btn size="xs" kind="teal" icon={<Check size={13} />} onClick={onApprove}>Duyệt</Btn>
          </>
        ) : PAST_SCRIPT.includes(st) ? <Badge tone="teal" icon={<Check size={12} />}>Đã duyệt</Badge>
          : <Badge tone="purple" icon={<Loader2 size={12} className="spin" />}>Đang viết</Badge>}
      </div>
      {open && (
        <div className="mt8 small t2 col" style={{ gap: 6 }}>
          {!dq.data && <Loading rows={2} />}
          {edit && beats.length > 0 ? (
            <>
              {beats.map((b, i) => (
                <div key={i} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span className="xs muted" style={{ width: 70, paddingTop: 8, flexShrink: 0 }}>{BEAT_VI[b.type] || b.type}</span>
                  <textarea className="textarea" style={{ minHeight: 44 }} value={edit[i] ?? b.text}
                    onChange={(e) => setEdit((x) => { const y = [...(x || [])]; beats.forEach((bb, j) => { if (y[j] === undefined) y[j] = bb.text; }); y[i] = e.target.value; return y; })} />
                </div>
              ))}
              <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <button className="btn ghost sm" onClick={() => setEdit(null)}>Huỷ</button>
                <Btn size="sm" kind="primary" icon={<Check size={14} />} onClick={save}>Lưu kịch bản</Btn>
              </div>
              <div className="xs muted">Sửa xong máy vẫn kiểm tra lại: câu nói phải có căn cứ và không phạm chính sách.</div>
            </>
          ) : (
            beats.map((b, i) => <div key={i}><span className="xs muted" style={{ display: "inline-block", width: 70 }}>{BEAT_VI[b.type] || b.type}</span>{b.text}</div>)
          )}
          {flags.map((x, i) => <div key={i} className="xs c-orange">⚠ {plain(x.message || x.text || "Câu này cần xem lại")}</div>)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Bước 4: xem & duyệt */
function StepReview({ f, reload, back, next, auto }: { f: any; reload: () => void; back?: () => void; next: () => void; auto?: boolean }) {
  const { toast, toastError } = useApp();
  const cid = f.campaign_id;
  const vq = useApi<any>(cid ? `/campaigns/${cid}/variants` : null, { size: 200 }, 3000);
  const [waive, setWaive] = useState<string | null>(null);
  const refresh = () => { vq.reload(); reload(); };
  const { decide } = useDecide(refresh);
  const items: any[] = (vq.data?.items || []).filter((v: any) => PAST_SCRIPT.includes(v.status) || v.status === "NEEDS_REVISION");
  const approved = items.filter((v) => APPROVED_UP.includes(v.status));
  const usable = items.filter((v) => v.status === "QC_PENDING" && qcChecks(v)?.originality?.status !== "fail");
  const waiting = items.filter((v) => v.status === "APPROVED" || v.status === "FAILED");

  const pid = f.project.id;
  /** Báo kết quả chọn/xuất bằng lời: bao nhiêu bản đi tiếp, bản nào bị giữ lại và vì sao. */
  function report(r: any, exporting: boolean) {
    if (exporting && r.queued > 0) toast({ kind: "success", title: `Đang xuất ${r.queued} video`, body: "Xong sẽ tự đóng gói cho Meta và TikTok." });
    if (r.blocked_originality?.length)
      toast({ kind: "warn", title: `${r.blocked_originality.length} bản quá giống bản khác nên không xuất`, body: "Thêm video quay góc khác vào mục Video nguồn để có bản khác biệt hơn." });
    if (r.refused?.length)
      toast({ kind: "warn", title: `${r.refused.length} bản chưa dùng được`, body: plain(r.refused[0].reason) });
  }
  async function accept(v: any, exportNow = !!auto) {
    try {
      const r = await api.post(`/flow/${pid}/finish`, { variant_ids: [v.id], render: exportNow });
      if (r.refused?.some((x: any) => x.error === "QC_CRITICAL")) setWaive(v.id);
      else { report(r, exportNow); if (!exportNow && r.approved) toast({ kind: "success", title: `Đã chọn ${v.code}` }); }
      refresh();
      if (exportNow && r.queued > 0) next();
      return true;
    } catch (e) { toastError(e); return undefined; }
  }
  async function finishAll() {
    try {
      const r = await api.post(`/flow/${pid}/finish`, {});
      report(r, true);
      refresh();
      if (r.queued > 0) next();
      return true;
    } catch (e) { toastError(e); return undefined; }
  }

  if (!vq.data) return <Loading rows={5} h={22} />;
  if (!items.length) return <Empty title="Chưa có video nào để xem">Duyệt ít nhất 1 kịch bản ở bước trước.</Empty>;
  return (
    <>
      <div className="row between" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="small t2 grow" style={{ minWidth: 260 }}>Bản xem thử có chữ mờ “DRAFT”, bản xuất chính thức không có. Dòng màu cam dưới mỗi video là điều máy nhắc bạn lưu ý.</div>
        {usable.length > 0 && <Btn kind="primary" icon={<Download size={16} />} onClick={finishAll}>Dùng tất cả và xuất luôn ({usable.length + waiting.length} video)</Btn>}
      </div>
      <div className="flow-videos mt12">
        {items.map((v) => {
          const vid = videoOf(v);
          const c = qcChecks(v);
          const og = c?.originality;
          const warns = c ? qcWarnings(c).slice(0, 3) : [];
          const rendering = ["SCRIPT_APPROVED", "STORYBOARD_READY", "PREVIEW_READY"].includes(v.status) || !vid.src;
          const failedJob = v.last_job?.kind === "preview" && v.last_job.status === "FAILED" && rendering ? v.last_job : null;
          return (
            <div key={v.id} className="card" style={{ padding: 10 }}>
              <div className="flow-video">
                {failedJob ? (
                  <div className="center col" style={{ gap: 8, padding: 12 }}>
                    <AlertTriangle className="c-red" />
                    <span className="xs c-red">Dựng bản xem thử bị lỗi</span>
                    <span className="xs muted" style={{ wordBreak: "break-word" }}>{failedJob.error_message}</span>
                    <Btn size="xs" icon={<RefreshCw size={13} />} onClick={async () => { try { await api.post(`/variants/${v.id}/preview`, {}); refresh(); return true; } catch (e) { toastError(e); return undefined; } }}>Dựng lại</Btn>
                  </div>
                ) : vid.src && !rendering ? <video src={fileUrl(vid.src)} controls preload="metadata" /> :
                  <div className="center col" style={{ gap: 8 }}><Loader2 className="spin c-primary" /><span className="xs muted">Đang dựng bản xem thử…</span></div>}
              </div>
              <div className="row between mt8">
                <b className="small">{v.code}</b>
                <span className="xs muted">{v.angle_label} · {v.concept_json?.duration}s</span>
              </div>
              <div className="xs t2 mt4 ellipsis" title={v.script?.hook}>{v.script?.hook}</div>
              {og?.status === "fail" && <div className="xs c-red mt8">Bản này quá giống một bản khác nên không xuất được. Thêm video quay góc khác vào {auto ? "mục “Video nguồn”" : "bước 1"} để có bản khác biệt hơn.</div>}
              {og?.status !== "fail" && warns.map((w, i) => <div key={i} className="xs mt4 c-orange">• {plain(w.text)}</div>)}
              <div className="row mt8" style={{ gap: 6, flexWrap: "wrap" }}>
                {v.status === "COMPLETED" ? <Badge tone="teal" icon={<Check size={12} />}>Đã xuất</Badge>
                  : v.status === "RENDERING" ? <Badge tone="purple" icon={<Loader2 size={12} className="spin" />}>Đang xuất</Badge>
                  : v.status === "APPROVED" ? (
                    <>
                      <Badge tone="teal" icon={<Check size={12} />}>Đã chọn</Badge>
                      <Btn size="sm" kind="teal" onClick={() => accept(v, true)}>Xuất bản này</Btn>
                    </>
                  ) : v.status === "FAILED" ? <Btn size="sm" kind="orange" icon={<RefreshCw size={14} />} onClick={() => accept(v, true)}>Xuất lại</Btn>
                  : v.status === "QC_PENDING" ? (
                    <>
                      <Btn size="sm" kind="teal" disabled={og?.status === "fail"} onClick={() => accept(v)}>{auto ? "Xuất bản này" : "Dùng bản này"}</Btn>
                      <Btn size="sm" kind="ghost" title="Bỏ bản này khỏi danh sách" onClick={() => { if (window.confirm(`Loại bản ${v.code}? Bản bị loại sẽ không hiện ở đây nữa.`)) decide(v.id, "reject", "Loại ở luồng Tạo video"); }}>Loại</Btn>
                    </>
                  ) : v.status === "NEEDS_REVISION" ? <span className="xs c-orange">Kịch bản vừa đổi, {auto ? "AI đang làm lại bản này" : "quay lại bước Kịch bản để duyệt lại"}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
      <ReasonModal open={!!waive} decision="waive" count={1} onClose={() => setWaive(null)}
        onSubmit={async (reason) => { if (waive) await decide(waive, "waive", reason); }} />
      {!auto && <NavRow back={back} nextLabel={waiting.length ? `Xuất ${waiting.length} video đã chọn` : "Tiếp: Video thành phẩm"}
        nextDisabled={!approved.length && !waiting.length} hint={approved.length || waiting.length ? undefined : "Chọn ít nhất 1 bản “Dùng bản này”"}
        next={waiting.length ? finishAll : approved.length ? next : undefined} />}
    </>
  );
}

/* ------------------------------------------------------------------ Bước 5: xuất */
function StepExport({ f, back, more }: { f: any; back?: () => void; more?: () => void }) {
  const { toast, toastError } = useApp();
  const nav = useNavigate();
  const cid = f.campaign_id;
  const vq = useApi<any>(cid ? `/campaigns/${cid}/variants` : null, { status: "APPROVED,RENDERING,COMPLETED,FAILED", size: 200 }, 3000);
  const [folder, setFolder] = useState<string | null>(null);
  const packs: Record<string, string> = f.packages?.folders || {};
  const items: any[] = vq.data?.items || [];
  const doneIds = items.filter((v) => v.status === "COMPLETED").map((v) => v.id);

  async function pack(preset: string) {
    try {
      const r = await api.post("/exports", { preset, variant_ids: doneIds });
      setFolder(r.folder);
      toast({ kind: "success", title: `Đã đóng gói ${r.count} video`, body: r.spec_issues ? `${r.spec_issues} video lệch thông số nền tảng, xem manifest.csv` : undefined });
    } catch (e) { toastError(e); }
  }
  const open = (path?: string) => api.post("/system/open-folder", { path }).catch(toastError);

  if (!vq.data) return <Loading rows={4} h={22} />;
  return (
    <>
      <Card title={`Video thành phẩm (${doneIds.length}/${items.length})`} icon={<Download size={16} className="c-primary" />}
        right={doneIds.length > 0 && (
          <div className="row" style={{ gap: 8 }}>
            <Btn size="sm" kind="ghost" icon={<FolderOpen size={14} />} onClick={() => open(items.find((v) => v.export)?.export?.output_uri)}>Mở thư mục video</Btn>
            <Btn size="sm" kind="ghost" onClick={() => pack("meta_ads")}>Đóng lại gói Meta</Btn>
            <Btn size="sm" kind="ghost" onClick={() => pack("tiktok_ads")}>Đóng lại gói TikTok</Btn>
          </div>
        )}>
        {(folder || Object.keys(packs).length > 0) && (
          <div className="inner small row between mb12" style={{ padding: "8px 12px", gap: 8, flexWrap: "wrap" }}>
            <span className="grow">Gói quảng cáo đã đóng sẵn, mở thư mục rồi tải lên trình quản lý quảng cáo:</span>
            {packs.meta_ads && <Btn size="sm" kind="teal" icon={<FolderOpen size={14} />} onClick={() => open(packs.meta_ads)}>Mở gói Meta</Btn>}
            {packs.tiktok_ads && <Btn size="sm" kind="teal" icon={<FolderOpen size={14} />} onClick={() => open(packs.tiktok_ads)}>Mở gói TikTok</Btn>}
            {folder && <Btn size="sm" kind="ghost" icon={<FolderOpen size={14} />} onClick={() => open(folder)}>Mở gói vừa đóng</Btn>}
          </div>
        )}
        {!items.length && <Empty title="Chưa có video nào được duyệt">Quay lại bước 4 để chọn bản dùng.</Empty>}
        <div className="flow-videos">
          {items.map((v) => {
            const vid = videoOf(v);
            return (
              <div key={v.id} className="inner" style={{ padding: 10 }}>
                <div className="flow-video">
                  {v.status === "COMPLETED" && vid.kind === "final" ? <video src={fileUrl(vid.src)} controls preload="metadata" /> :
                    v.status === "FAILED" ? (
                      <div className="center col" style={{ gap: 8, padding: 12 }}>
                        <AlertTriangle className="c-red" />
                        <span className="xs c-red">Xuất bản final bị lỗi</span>
                        <span className="xs muted" style={{ wordBreak: "break-word" }}>{v.last_job?.error_message}</span>
                        <Btn size="xs" icon={<RefreshCw size={13} />} onClick={async () => { try { await api.post("/render/batches", { campaign_id: cid, kind: "final", variant_ids: [v.id] }); vq.reload(); return true; } catch (e) { toastError(e); return undefined; } }}>Xuất lại</Btn>
                      </div>
                    ) :
                    <div className="center col" style={{ gap: 8 }}><Loader2 className="spin c-primary" /><span className="xs muted">Đang xuất bản final…</span></div>}
                </div>
                <div className="row between mt8"><b className="small">{v.code}</b><span className="xs muted">{v.angle_label} · {v.concept_json?.duration}s</span></div>
              </div>
            );
          })}
        </div>
        <div className="xs muted mt12">Mỗi video kèm file phụ đề và ảnh bìa. Trong gói quảng cáo có sẵn bảng tên quảng cáo, tiêu đề, lời kêu gọi cho từng video; bạn tự tải lên Meta/TikTok, app không tự đăng.</div>
      </Card>
      <NavRow back={back} next={more} nextLabel="Làm thêm lô video khác" />
      <div className="row mt8" style={{ justifyContent: "flex-end" }}>
        <button className="btn ghost sm" onClick={() => nav("/analytics")}>Nhập kết quả quảng cáo để AI học bản thắng →</button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Chế độ AI */
const AUTO_STAGES: Array<{ k: string[]; label: string }> = [
  { k: ["need_video", "analyzing", "analysis_failed", "error"], label: "Phân tích video" },
  { k: ["reading", "need_claims"], label: "AI đọc clip, lập hồ sơ" },
  { k: ["writing"], label: "AI viết & duyệt kịch bản" },
  { k: ["rendering"], label: "Dựng bản xem thử" },
  { k: ["review"], label: "Bạn chọn video" },
  { k: ["exporting", "done"], label: "Xuất video" },
];

function Section({ id, open, toggle, title, sub, badge, children }: { id: string; open: boolean; toggle: (id: string) => void; title: string; sub?: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="card mb12" style={{ padding: 0 }}>
      <div className="row between" style={{ padding: "14px 16px", cursor: "pointer" }} onClick={() => toggle(id)}>
        <div>
          <div className="bold">{title}</div>
          {sub && <div className="xs muted mt4">{sub}</div>}
        </div>
        <div className="row" style={{ gap: 8 }}>{badge}<ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} /></div>
      </div>
      {open && <div style={{ padding: "0 16px 16px" }}>{children}</div>}
    </div>
  );
}

/** Chất lượng nghe lời thoại quyết định chất lượng mọi bước sau → nhắc tải bản nghe chính xác, và làm lại khi đã có. */
function AsrNote({ f, reload, onRedo }: { f: any; reload: () => void; onRedo?: () => void }) {
  const { toast, toastError } = useApp();
  const [poll, setPoll] = useState(false);
  const dl = useApi<any>(poll ? "/models/whisper/download" : null, undefined, 1000);
  const asr = f?.asr;
  useEffect(() => {
    if (!poll || !dl.data || dl.data.running) return;
    setPoll(false);
    if (dl.data.error) toast({ kind: "error", title: "Chưa tải được bản nghe chính xác", body: "Kiểm tra mạng rồi bấm tải lại." });
    else { toast({ kind: "success", title: "Đã tải xong bản nghe chính xác" }); reload(); }
  }, [dl.data, poll]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!asr || !f.assets?.length) return null;
  const isAi = f.project?.settings_json?.mode === "ai";
  if (!asr.accurate)
    return (
      <div className="mb12"><Warn title={asr.installed ? "Máy đang nghe lời thoại bằng bản nhẹ, dễ sai chữ" : "Máy chưa có bộ nghe lời thoại"}>
        Tải bản nghe chính xác một lần (574 MB) để AI hiểu đúng lời trong clip.{" "}
        {poll ? <b>Đang tải {Math.round((dl.data?.progress || 0) * 100)}%…</b>
          : <Btn size="sm" kind="orange" icon={<Download size={14} />} onClick={async () => { try { await api.post("/models/whisper/download"); setPoll(true); return true; } catch (e) { toastError(e); return undefined; } }}>Tải bản nghe chính xác</Btn>}
      </Warn></div>
    );
  if (!asr.stale) return null;
  const redo = async () => {
    const done = (f.variants?.COMPLETED || 0) > 0;
    if (!window.confirm(isAi ? `AI sẽ nghe lại clip, lập lại hồ sơ và làm lại các video chưa xuất.${done ? " Video đã xuất được giữ nguyên." : ""} Tiếp tục?` : "Máy sẽ nghe lại lời thoại của các clip. Tiếp tục?")) return undefined;
    try {
      if (isAi) await api.post(`/flow/${f.project.id}/redo`);
      else for (const a of f.assets) await api.post("/analysis/jobs", { asset_id: a.id });
      toast({ kind: "success", title: "Đang nghe lại clip bằng bản chính xác" });
      onRedo?.(); reload();
      return true;
    } catch (e) { toastError(e, "Chưa làm lại được"); return undefined; }
  };
  return (
    <div className="mb12"><InfoNote>
      Máy đã có bản nghe chính xác hơn, nhưng {asr.stale} clip của dự án này được nghe bằng bản cũ nên lời có thể sai.{" "}
      <Btn size="sm" kind="primary" icon={<RefreshCw size={14} />} onClick={redo}>{isAi ? "Nghe lại và làm lại bằng AI" : "Nghe lại clip"}</Btn>
    </InfoNote></div>
  );
}

function AutoFlow({ f, reload, actions }: { f: any; reload: () => void; actions: ReactNode }) {
  const { toast } = useApp();
  const pid = f?.project?.id as string | undefined;
  const [st, setSt] = useState<any>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const vq = useApi<any>(f?.campaign_id ? `/campaigns/${f.campaign_id}/variants` : null, { size: 200 });
  const { toastError } = useApp();

  // Gọi lần lượt (không chồng) để máy làm bước kế tiếp; mở trang là chạy tiếp từ chỗ dừng
  useEffect(() => {
    if (!pid) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (document.hidden) { timer = setTimeout(tick, 4000); return; }   // cửa sổ đang ẩn: không gọi, mở lại là chạy tiếp
      setPending(true);
      let wait = 2500;
      try {
        const r = await api.post(`/flow/${pid}/auto`);
        if (!alive) return;
        if (r.stage !== "busy") setSt(r);
        setErr(null);
        // tới khâu chờ người quyết thì hỏi thưa lại cho nhẹ máy
        if (["review", "done", "need_claims", "analysis_failed", "error"].includes(r.stage)) wait = 7000;
      } catch (e) {
        if (!alive) return;
        setErr(e as ApiError);
        wait = 10000;
      }
      setPending(false);
      reload(); vq.reload();
      if (alive) timer = setTimeout(tick, wait);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevStage = useRef<string | null>(null);
  useEffect(() => {
    if (!st?.stage || st.stage === prevStage.current) return;
    if (st.stage === "review" && prevStage.current && prevStage.current !== "review")
      toast({ kind: "success", title: "AI đã dựng xong bản xem thử", body: "Xem và chọn video nào dùng." });
    prevStage.current = st.stage;
  }, [st, toast]);

  // Bước đang hiển thị: lấy theo kết quả máy trả về; đang chờ đọc clip thì hiện bước đọc
  const analysisDone = f.assets.length > 0 && f.assets.every((a: any) => a.analysis && !ACTIVE_JOB.includes(a.analysis.status));
  let idx = Math.max(0, AUTO_STAGES.findIndex((s) => s.k.includes(st?.stage)));
  if (pending && analysisDone && f.approved_claims === 0 && idx === 0) idx = 1;
  const items: any[] = (vq.data?.items || []).filter((v: any) => v.status !== "REJECTED");
  const v = f.variants as Record<string, number>;
  const anyPreview = count(v, ["QC_PENDING", ...APPROVED_UP]) > 0;
  // Mục nào máy đã tự mở thì giữ mở cho tới khi người dùng tự đóng: không gập mất nội dung đang gõ dở
  const dflt: Record<string, boolean> = { video: anyPreview, export: (v.COMPLETED || 0) > 0 || (v.RENDERING || 0) > 0, voice: false,
    scripts: !anyPreview && items.length > 0, product: st?.stage === "need_claims", source: f.assets.length === 0 || st?.stage === "analysis_failed" };
  const dfltKey = Object.entries(dflt).filter(([, on]) => on).map(([k]) => k).join(",");
  useEffect(() => {
    setOpen((o) => { const n = { ...o }; let ch = false; for (const k of dfltKey.split(",")) if (k && n[k] === undefined) { n[k] = true; ch = true; } return ch ? n : o; });
  }, [dfltKey]);
  const isOpen = (k: string, _d?: boolean) => open[k] ?? dflt[k] ?? false;
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !isOpen(k) }));

  const total = Object.entries(v).filter(([k]) => k !== "REJECTED").reduce((a, [, x]) => a + x, 0);
  const written = total - (v.DRAFT || 0);
  const previews = count(v, ["QC_PENDING", ...APPROVED_UP, "FAILED"]);
  const progress = st?.stage === "analyzing" ? `Máy đang cắt cảnh và nghe lời thoại của ${f.assets.length} clip. Clip 1 phút mất khoảng nửa phút.`
    : st?.stage === "reading" || (pending && idx === 1) ? "AI đang đọc lời thoại để lập hồ sơ sản phẩm, khoảng 1 phút."
    : st?.stage === "writing" ? `AI đang viết kịch bản: xong ${written}/${total} bản. Mỗi bản mất khoảng 1 phút.`
    : st?.stage === "rendering" ? `Đang dựng bản xem thử: xong ${previews}/${total} bản.`
    : st?.stage === "exporting" ? `Đang xuất video chính thức: xong ${v.COMPLETED || 0}/${count(v, APPROVED_UP)} bản. Xong sẽ tự đóng gói cho Meta và TikTok.` : null;

  const redoAll = async () => {
    if (!window.confirm("AI sẽ nghe lại clip, lập lại hồ sơ và làm lại các video chưa xuất. Video đã xuất và nội dung bạn tự nhập được giữ nguyên. Tiếp tục?")) return undefined;
    try { await api.post(`/flow/${pid}/redo`); setSt(null); reload(); vq.reload(); toast({ kind: "success", title: "AI đang làm lại từ đầu" }); return true; }
    catch (e) { toastError(e, "Chưa làm lại được"); return undefined; }
  };
  const openDir = (path?: string) => api.post("/system/open-folder", { path }).catch(toastError);
  const packs: Record<string, string> = st?.packages?.folders || f.packages?.folders || {};

  let banner: ReactNode = null;
  if (st?.stage === "error")
    banner = <Warn title="Dự án này chưa chạy được bằng AI">{st.message}</Warn>;
  else if (st?.stage === "analysis_failed")
    banner = (
      <Warn title="Máy chưa đọc được video">
        {plain(st.message || "")} Thử bấm phân tích lại; nếu vẫn lỗi, đổi video sang MP4 rồi thả lại vào mục “Video nguồn”.{" "}
        <Btn size="sm" kind="orange" icon={<RefreshCw size={14} />} onClick={async () => {
          try { for (const a of f.assets.filter((x: any) => x.analysis?.status === "FAILED")) await api.post("/analysis/jobs", { asset_id: a.id }); setSt(null); reload(); return true; }
          catch (e) { toastError(e); return undefined; }
        }}>Phân tích lại</Btn>
      </Warn>
    );
  else if (st?.stage === "need_claims")
    banner = <Warn title="Cần bạn bổ sung một chút">Clip không có đủ lời thoại để AI tự lập hồ sơ chắc chắn. Mở mục “Hồ sơ sản phẩm” bên dưới, thêm vài câu được phép nói và bấm “Đúng”; AI sẽ tự chạy tiếp.</Warn>;
  else if (st?.need_you > 0)
    banner = <Warn title={`${st.need_you} kịch bản AI không tự duyệt được`}>Kịch bản còn câu chưa có căn cứ hoặc phạm chính sách. Mở mục “Kịch bản”, bấm “Sửa” để chỉnh câu bị cảnh báo; các bản khác vẫn chạy bình thường.</Warn>;
  else if (st?.stage === "review")
    banner = <InfoNote>AI đã dựng xong. Xem thử các video bên dưới rồi bấm “Dùng tất cả và xuất luôn”, hoặc “Xuất bản này” cho từng video bạn ưng.</InfoNote>;
  else if (st?.stage === "done")
    banner = (
      <InfoNote>
        Xong. Video chính thức và gói quảng cáo đã nằm sẵn trong thư mục.{" "}
        {packs.meta_ads && <Btn size="sm" kind="teal" icon={<FolderOpen size={14} />} onClick={() => openDir(packs.meta_ads)}>Mở gói Meta</Btn>}{" "}
        {packs.tiktok_ads && <Btn size="sm" kind="teal" icon={<FolderOpen size={14} />} onClick={() => openDir(packs.tiktok_ads)}>Mở gói TikTok</Btn>}
      </InfoNote>
    );

  return (
    <>
      <PageHead title="Tạo video · Chế độ AI" sub={`Sản phẩm: ${f.project.product?.name || f.project.name}. AI tự làm từng bước; bạn mở mục nào cũng sửa tay được.`} icon={<Sparkles size={22} />} actions={actions} />
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="stepper flow-stepper">
          {AUTO_STAGES.map((s, i) => (
            <div key={s.label} className={`step ${i === idx ? "on" : i < idx ? "done" : ""}`} style={{ cursor: "default" }}>
              <span className="n">{i < idx ? <Check size={13} /> : i === idx && !["review", "done", "need_claims"].includes(st?.stage) ? <Loader2 size={13} className="spin" /> : i + 1}</span>
              <span className="ellipsis">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
      {err && <Warn title="AI gặp lỗi, đang thử lại">{err.body?.message || "Mất kết nối với app"}{err.body?.hint ? ` · ${err.body.hint}` : ""}</Warn>}
      {progress && <div className="row small c-primary mb12" style={{ gap: 8 }}><Loader2 size={14} className="spin" /> {progress} Bạn có thể làm việc khác, mở lại app là thấy kết quả.</div>}
      <AsrNote f={f} reload={reload} onRedo={() => { setSt(null); vq.reload(); }} />
      {banner && <div className="mb12">{banner}</div>}

      <Section id="video" open={isOpen("video", anyPreview)} toggle={toggle} title="Video"
        sub="Bản xem thử AI dựng. Chọn bản dùng, loại bản không ưng."
        badge={anyPreview ? <Badge tone="teal">{count(v, ["QC_PENDING", ...APPROVED_UP])} bản</Badge> : <Badge>Chưa có</Badge>}>
        {anyPreview ? <StepReview f={f} auto reload={() => { reload(); vq.reload(); }} next={() => setOpen((o) => ({ ...o, export: true }))} />
          : <div className="small muted">AI đang làm, video sẽ hiện ở đây.</div>}
      </Section>
      {count(v, APPROVED_UP) > 0 && (
        <Section id="export" open={isOpen("export", (v.COMPLETED || 0) > 0)} toggle={toggle} title="Video thành phẩm" sub="Bản final kèm phụ đề, ảnh bìa và gói quảng cáo"
          badge={<Badge tone="teal">{v.COMPLETED || 0} đã xuất</Badge>}>
          <StepExport f={f} />
        </Section>
      )}
      <Section id="voice" open={isOpen("voice", false)} toggle={toggle} title="Giọng đọc"
        sub="Giọng máy, 10 giọng có sẵn hoặc giọng người nói trong clip. Đổi giọng thì các video chưa xuất được dựng lại."
        badge={st?.voice_warning ? <Badge tone="orange">Chưa áp được giọng đã chọn</Badge> : undefined}>
        {st?.voice_warning && <div className="xs c-orange mb8">{st.voice_warning}</div>}
        <VoicePicker f={f} />
      </Section>
      <Section id="scripts" open={isOpen("scripts", !anyPreview && items.length > 0)} toggle={toggle} title="Kịch bản"
        sub="AI viết và tự duyệt bản sạch. Bấm “Sửa” để chỉnh từng câu; lưu xong AI tự dựng lại."
        badge={<Badge tone={st?.need_you ? "orange" : "gray"}>{items.length} kịch bản</Badge>}>
        {items.length ? (
          <div className="col" style={{ gap: 8 }}>
            {items.map((x) => (
              <ScriptRow key={x.id} v={x} auto reload={vq.reload}
                onApprove={async () => { try { await api.post(`/variants/${x.id}/script/approve`); await api.post(`/variants/${x.id}/storyboard`); await api.post(`/variants/${x.id}/preview`); vq.reload(); } catch (e) { setErr(e as ApiError); } }} />
            ))}
          </div>
        ) : <div className="small muted">Chưa có kịch bản.</div>}
      </Section>
      <Section id="product" open={isOpen("product", st?.stage === "need_claims")} toggle={toggle} title="Hồ sơ sản phẩm"
        sub="AI lập từ lời thoại và chữ trên hình. Sửa thông tin hoặc thêm, bỏ câu được phép nói tại đây."
        badge={<Badge tone={f.approved_claims ? "teal" : "orange"}>{f.approved_claims} câu đã xác nhận</Badge>}>
        <StepProduct f={f} lock="ai" embedded reload={reload} />
      </Section>
      <Section id="source" open={isOpen("source", f.assets.length === 0)} toggle={toggle} title="Video nguồn"
        sub="Thêm video khác góc máy để có nhiều bản khác nhau hơn; sửa nhãn cảnh nếu AI đoán sai."
        badge={<Badge>{f.assets.length} video</Badge>}>
        <StepVideo f={f} reload={reload} mode="ai" embedded />
      </Section>
      <div className="row mt8" style={{ justifyContent: "flex-end" }}>
        <Btn size="sm" kind="ghost" icon={<RefreshCw size={14} />} title="AI nghe lại clip và làm lại các video chưa xuất" onClick={redoAll}>Làm lại từ đầu bằng AI</Btn>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Giọng đọc (dùng chung 2 chế độ) */
type VoiceMode = "os" | "preset" | "clone";
type Preset = { name: string; gender?: string; region?: string; style?: string };
const PRESET_DEFAULT = "Hải Đăng";
const VOICE_OPTS: Array<{ id: VoiceMode; label: string; sub: string }> = [
  { id: "os", label: "Giọng máy", sub: "Giọng Linh có sẵn của máy. Nhanh, không cần cài thêm." },
  { id: "preset", label: "Giọng có sẵn", sub: "10 giọng nam nữ ba miền. Bấm nghe thử rồi chọn, không cần mẫu giọng." },
  { id: "clone", label: "Giọng người nói trong clip", sub: "AI tự cắt đoạn mẫu sạch nhất trong clip rồi đọc kịch bản bằng đúng giọng đó." },
];

let presetAudio: HTMLAudioElement | null = null;

/** Lưới giọng dựng sẵn: bấm tên để chọn, bấm loa để nghe thử. */
function PresetGrid({ presets, value, onPick, current }: { presets: Preset[]; value: string; onPick: (name: string) => void; current?: string }) {
  const { toastError } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => { presetAudio?.pause(); }, []);
  async function listen(name: string) {
    presetAudio?.pause();
    if (playing === name) { setPlaying(null); return; }
    setBusy(name);
    try {
      const r = await api.post("/voice/sample", { name });
      presetAudio = new Audio(fileUrl(r.path));
      presetAudio.onended = () => setPlaying((p) => (p === name ? null : p));
      await presetAudio.play();
      setPlaying(name);
    } catch (e) { toastError(e, "Chưa nghe thử được giọng này"); }
    finally { setBusy(null); }
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
      {presets.map((v) => (
        <div key={v.name} className={`inner flow-voice ${value === v.name ? "on" : ""}`} style={{ padding: "8px 10px", cursor: "pointer" }} onClick={() => onPick(v.name)}>
          <div className="row between" style={{ gap: 6 }}>
            <b className="small">{v.name}</b>
            <span className="row" style={{ gap: 6 }}>
              {current === v.name && <Badge tone="teal">Đang dùng</Badge>}
              <button type="button" className="chip" title="Nghe thử" style={{ padding: "3px 7px" }} onClick={(e) => { e.stopPropagation(); listen(v.name); }}>
                {busy === v.name ? <Loader2 size={13} className="spin" /> : playing === v.name ? <X size={13} /> : <Volume2 size={13} />}
              </button>
            </span>
          </div>
          <div className="xs muted mt4">{[v.gender === "female" ? "Nữ" : "Nam", v.region ? `miền ${v.region}` : "", (v.style || "").replace(/^(Phong cách|Giọng đọc)\s*/i, "")].filter(Boolean).join(" · ")}</div>
        </div>
      ))}
    </div>
  );
}

function VoicePicker({ f, compact }: { f: any; compact?: boolean }) {
  const { toast, toastError } = useApp();
  const cid = f.campaign_id;
  const q = useApi<any>(cid ? `/campaigns/${cid}/voice` : null, undefined, 15000);
  const [mode, setMode] = useState<VoiceMode | null>(null);
  const [pname, setPname] = useState<string | null>(null);
  const [asset, setAsset] = useState<string>("");
  const [ok, setOk] = useState(false);
  const [sample, setSample] = useState<string | null>(null);
  const d = q.data;
  if (!cid) return null;
  if (!d) return <Loading rows={2} />;
  const cur = d.choice?.mode || "os";
  const sel = mode ?? cur;
  const srv = d.server || {};
  const speech = f.assets.filter((a: any) => (a.speech || "").trim());
  const presets: Preset[] = srv.presets || [];
  const selName = pname ?? d.choice?.name ?? presets.find((x) => x.name === PRESET_DEFAULT)?.name ?? presets[0]?.name ?? "";
  const needOk = sel === "clone";
  const disabled = (id: string) => (id === "clone" && !srv.clone) || (id === "preset" && !presets.length);
  const why = (id: string) => (!srv.ready ? "Máy này chưa cài bộ giọng" : id === "preset" ? "Bộ giọng trên máy này chưa có giọng sẵn" : "");
  const changed = sel !== cur || (sel === "clone" && asset && asset !== d.choice?.asset_id) || (sel === "preset" && selName !== d.choice?.name);

  async function apply() {
    try {
      const r = await api.post(`/campaigns/${cid}/voice`, { mode: sel, consent: ok, asset_id: asset || undefined, name: sel === "preset" ? selName : undefined });
      toast({ kind: "success", title: "Đã đổi giọng đọc", body: r.revoiced ? `Đang dựng lại ${r.revoiced} video bằng giọng mới.` : undefined });
      setMode(null); setPname(null); setOk(false); setSample(null); q.reload();
      return true;
    } catch (e) { toastError(e, "Không đổi được giọng"); return undefined; }
  }
  async function test() {
    try { const r = await api.post(`/campaigns/${cid}/voice/test`, {}); setSample(r.path); return true; }
    catch (e) { toastError(e, "Chưa nghe thử được"); return undefined; }
  }

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="grid" style={{ gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {VOICE_OPTS.map((o) => {
          const off = disabled(o.id);
          return (
            <div key={o.id} className={`inner flow-voice ${sel === o.id ? "on" : ""}`} title={off ? why(o.id) : undefined}
              style={{ opacity: off ? 0.45 : 1, cursor: off ? "not-allowed" : "pointer" }}
              onClick={() => { if (!off) { setMode(o.id); setOk(false); } }}>
              <div className="row between"><b className="small">{o.label}</b>{cur === o.id && <Badge tone="teal">{o.id === "preset" && d.choice?.name ? d.choice.name : "Đang dùng"}</Badge>}</div>
              <div className="xs muted mt4">{off ? why(o.id) : o.sub}</div>
            </div>
          );
        })}
      </div>
      {sel === "preset" && <PresetGrid presets={presets} value={selName} onPick={setPname} current={cur === "preset" ? d.choice?.name : undefined} />}
      {sel === "clone" && changed && (
        <Field label="Lấy giọng từ clip">
          <select className="select" value={asset} onChange={(e) => setAsset(e.target.value)}>
            <option value="">Tự chọn clip có nhiều lời thoại nhất</option>
            {f.assets.map((a: any) => <option key={a.id} value={a.id}>{a.file_name}{(a.speech || "").trim() ? "" : " (không có lời thoại)"}</option>)}
          </select>
          {!speech.length && <div className="xs c-orange mt4">Chưa nghe thấy lời thoại trong clip nào; AI vẫn thử tìm đoạn có tiếng nói.</div>}
        </Field>
      )}
      {needOk && changed && (
        <label className="row inner small" style={{ gap: 10, padding: "10px 12px", alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} style={{ marginTop: 3 }} />
          <span><b>Xác nhận:</b> {d.consent_text?.[sel]}</span>
        </label>
      )}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {changed && <Btn kind="primary" size="sm" disabled={needOk && !ok} title={needOk && !ok ? "Tick ô xác nhận trước" : undefined} onClick={apply}>{sel === "preset" ? `Dùng giọng ${selName}` : "Dùng giọng này"}</Btn>}
        {!changed && <Btn size="sm" kind="ghost" icon={<Sparkles size={14} />} onClick={test}>Nghe thử giọng đang dùng</Btn>}
        {sample && <audio src={fileUrl(sample)} controls autoPlay style={{ height: 32 }} />}
      </div>
      {cur === "clone" && d.choice?.ref && !changed && (
        <div className="xs muted">
          Mẫu giọng lấy từ <b>{d.choice.file_name}</b>, giây {(d.choice.start_ms / 1000).toFixed(1)}–{(d.choice.end_ms / 1000).toFixed(1)}
          {d.choice.quality?.snr_db ? ` · độ sạch ${d.choice.quality.snr_db} dB` : ""}.{" "}
          <audio src={fileUrl(d.choice.ref)} controls style={{ height: 28, verticalAlign: "middle" }} />
        </div>
      )}
      {cur !== "os" && <div className="xs muted">Giọng AI được đóng dấu âm thanh (watermark). Khi đăng Meta/TikTok vẫn phải gắn nhãn nội dung AI.</div>}
    </div>
  );
}
