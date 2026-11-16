import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AudioLines, BookOpen, Check, Languages, ListChecks, Mic, Pause, Play, Plus, RotateCcw, Save, ShieldCheck, Square,
  Trash2, Volume2, Wand2,
} from "lucide-react";
import { api, ApiError, fileUrl, useApi } from "../lib/api";
import { ms, msPrecise } from "../lib/format";
import { useApp } from "../lib/store";
import { useVariants } from "../components/pickers";
import { Async, Badge, Bar, Btn, Card, Empty, ErrorBox, Field, JobStatus, Modal, NeedProject, PageHead, Select, VariantStatus, Warn } from "../components/ui";
import { Waveform } from "../components/charts";

/** Trạng thái biến thể đã có storyboard (đủ điều kiện tạo giọng đọc theo beat). */
const HAS_STORYBOARD = new Set(["STORYBOARD_READY", "PREVIEW_READY", "QC_PENDING", "APPROVED", "RENDERING", "COMPLETED", "FAILED", "NEEDS_REVISION"]);
const RATE_PRESETS = [
  { rate: 0.9, label: "Chậm rãi", hint: "Kể chuyện · Giáo dục", tone: "cyan" as const },
  { rate: 1.0, label: "Chuẩn", hint: "Dẫn giải · Thuyết minh", tone: "purple" as const },
  { rate: 1.15, label: "Nhanh", hint: "Quảng cáo · Short video", tone: "orange" as const },
];
const LUFS_OPTS = [
  { value: -14, label: "-14 LUFS (TikTok / Reels)" },
  { value: -16, label: "-16 LUFS (Chuẩn online)" },
  { value: -23, label: "-23 LUFS (Phát sóng EBU R128)" },
];
const DEFAULT_TEXT = "Xin chào, đây là bản nghe thử giọng đọc tiếng Việt chạy hoàn toàn trên máy của bạn.";

interface VoiceSettings { provider: string; voice: string; rate: number; lufs: number; lexicon?: Record<string, string> }
interface Preview { uri: string; duration_ms: number; waveform: number[]; words: Array<{ w: string; start_ms: number; end_ms: number }>; normalized: string }

export default function VoiceStudio() {
  const { projectId } = useApp();
  return (
    <>
      <PageHead
        title="Phòng thu giọng đọc AI"
        sub="Tạo giọng đọc tiếng Việt từ kịch bản bằng engine TTS local, chuẩn hoá loudness và đồng bộ lời thoại."
        icon={<Mic size={22} />}
      />
      <NeedProject projectId={projectId}>
        <Studio />
      </NeedProject>
    </>
  );
}

function Studio() {
  const { toast, toastError } = useApp();
  const prov = useApi<any>("/voice/providers");
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [extraLex, setExtraLex] = useState<Record<string, string>>({});
  const [lexOpen, setLexOpen] = useState(false);

  // Khởi tạo thiết lập từ voice_default của backend
  useEffect(() => {
    if (!prov.data || settings) return;
    const d = prov.data.default || {};
    const firstProv = prov.data.providers?.[0];
    setSettings({
      provider: d.provider || firstProv?.id || "os_say",
      voice: d.voice || firstProv?.voices?.[0] || "Linh",
      rate: Number(d.rate ?? 1),
      lufs: Number(d.lufs ?? -16),
    });
    if (d.lexicon && typeof d.lexicon === "object") setExtraLex(d.lexicon);
  }, [prov.data, settings]);

  const providers: any[] = prov.data?.providers || [];
  const current = providers.find((p) => p.id === settings?.provider) || providers[0];
  const allVoices = providers.flatMap((p) => (p.voices || []).map((v: string) => ({ provider: p.id, voice: v, ready: p.ready })));
  const fullSettings: VoiceSettings | null = settings ? { ...settings, lexicon: extraLex } : null;

  async function saveDefault() {
    if (!fullSettings) return;
    try {
      await api.put("/settings", { voice_default: fullSettings });
      toast({ kind: "success", title: "Đã lưu giọng mặc định", body: `${fullSettings.voice} · ${fullSettings.rate}x · ${fullSettings.lufs} LUFS` });
      prov.reload();
      return true;
    } catch (e) {
      toastError(e, "Không lưu được giọng mặc định");
    }
  }

  return (
    <Async q={prov}>
      {(d) => (
        <>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: -8, marginBottom: 12 }}>
            <Btn kind="primary" icon={<Save size={16} />} onClick={saveDefault} disabled={!settings} title="Lưu giọng, tốc độ, loudness và từ điển bổ sung làm mặc định cho mọi job tạo giọng">
              Lưu làm giọng mặc định
            </Btn>
          </div>

          {/* Thẻ tổng quan engine */}
          <div className="grid g4">
            <div className="card row" style={{ gap: 12 }}>
              <div className="kpi-icon" style={iconBox("var(--primary-soft)", "var(--primary-2)")}><AudioLines size={20} /></div>
              <div className="grow">
                <div className="row"><b>Động cơ TTS (Local)</b>{current ? <Badge tone={current.ready ? "teal" : "orange"}>{current.ready ? "Đang sẵn sàng" : "Chưa sẵn sàng"}</Badge> : <Badge tone="red">Không có</Badge>}</div>
                <div className="xs muted mt8">{current ? `Engine: ${current.name}` : "Chưa phát hiện engine TTS trên máy"}</div>
              </div>
            </div>
            <div className="card row" style={{ gap: 12 }}>
              <div className="kpi-icon" style={iconBox("var(--cyan-soft)", "var(--cyan)")}><Mic size={20} /></div>
              <div className="grow">
                <div className="row"><b>Giọng tiếng Việt đã cài</b><Badge tone="purple">{allVoices.length} giọng</Badge></div>
                <div className="xs muted mt8 ellipsis">{allVoices.map((v) => v.voice).join(", ") || "Cài giọng vi_VN trong hệ điều hành"}</div>
              </div>
            </div>
            <div className="card row" style={{ gap: 12 }}>
              <div className="kpi-icon" style={iconBox("var(--teal-soft)", "var(--teal)")}><BookOpen size={20} /></div>
              <div className="grow">
                <div className="row"><b>Từ điển phát âm</b><Badge tone="teal">{Object.keys(d.lexicon || {}).length + Object.keys(extraLex).length} mục</Badge></div>
                <div className="xs muted mt8">Viết tắt, đơn vị, thuật ngữ · <span className="link" onClick={() => setLexOpen(true)}>Chỉnh sửa ›</span></div>
              </div>
            </div>
            <div className="card row" style={{ gap: 12 }}>
              <div className="kpi-icon" style={iconBox("var(--orange-soft)", "var(--orange)")}><ShieldCheck size={20} /></div>
              <div className="grow">
                <div className="row"><b>Giấy phép mô hình</b>{current && <Badge tone="teal">Hợp lệ</Badge>}</div>
                <div className="xs muted mt8 ellipsis">{current?.license || "—"}</div>
              </div>
            </div>
          </div>

          {providers.length === 0 && (
            <div className="mt16"><Warn title="Không tìm thấy engine TTS local">Trên macOS, cài giọng tiếng Việt “Linh” trong Cài đặt hệ thống → Trợ năng → Nội dung được đọc. Hoặc cài Piper TTS.</Warn></div>
          )}

          <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0, 1fr) 340px", alignItems: "start" }}>
            <div className="col" style={{ gap: 16 }}>
              <Presets voices={allVoices} settings={settings} onPick={(s) => setSettings((x) => (x ? { ...x, ...s } : x))} />
              {fullSettings && <PreviewPanel settings={fullSettings} />}
            </div>
            <div className="col" style={{ gap: 16 }}>
              <Card title="Thiết lập giọng đọc">
                {settings ? (
                  <div className="col" style={{ gap: 14 }}>
                    <Field label="Voice ID">
                      <Select
                        value={`${settings.provider}::${settings.voice}`}
                        onChange={(v) => { const [provider, voice] = v.split("::"); setSettings({ ...settings, provider, voice }); }}
                        options={allVoices.length ? allVoices.map((v) => ({ value: `${v.provider}::${v.voice}`, label: `${v.voice} · ${providers.find((p) => p.id === v.provider)?.name || v.provider}` })) : [{ value: `${settings.provider}::${settings.voice}`, label: settings.voice }]}
                      />
                    </Field>
                    <Field label={<span className="row between" style={{ width: "100%" }}>Tốc độ (Speed) <b>{settings.rate.toFixed(2)}x</b></span>} hint={`≈ ${Math.round(175 * settings.rate)} từ/phút`}>
                      <input className="range" type="range" min={0.7} max={1.4} step={0.05} value={settings.rate} onChange={(e) => setSettings({ ...settings, rate: Number(e.target.value) })} />
                    </Field>
                    <Field label="Cao độ (Pitch)" hint="Engine hiện tại chưa hỗ trợ chỉnh cao độ">
                      <input className="range" type="range" disabled value={50} min={0} max={100} title="Engine TTS local (macOS say) không hỗ trợ chỉnh cao độ" />
                    </Field>
                    <Field label="Độ biểu cảm (Expressiveness)" hint="Chưa hỗ trợ trên engine local">
                      <input className="range" type="range" disabled value={50} min={0} max={100} title="Engine TTS local không có tham số biểu cảm" />
                    </Field>
                    <Field label="Mức âm lượng mục tiêu (Loudness)" hint="Chuẩn hoá bằng ffmpeg loudnorm, true-peak -1.5 dB">
                      <Select value={settings.lufs} onChange={(v) => setSettings({ ...settings, lufs: Number(v) })} options={LUFS_OPTS} />
                    </Field>
                    <Field label="Ngôn ngữ">
                      <div className="row"><Languages size={15} className="muted" /><Select value="vi" onChange={() => undefined} options={[{ value: "vi", label: "Tiếng Việt (vi-VN)" }]} disabled /></div>
                    </Field>
                  </div>
                ) : <div className="small muted">Đang tải thiết lập…</div>}
              </Card>
              <Warn title="Lưu ý về quyền sử dụng giọng">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Nhân bản giọng (voice cloning) đang <b>tắt</b>. Chỉ dùng giọng hệ điều hành / mô hình có giấy phép.</li>
                  <li>Bắt buộc có sự đồng ý rõ ràng, bằng văn bản của người có giọng trước khi nhân bản.</li>
                  <li>Không mạo danh giọng nói của người nổi tiếng (nghệ sĩ, KOL, MC…).</li>
                </ul>
              </Warn>
            </div>
          </div>

          {fullSettings && <BatchQueue settings={fullSettings} />}

          <LexiconModal open={lexOpen} onClose={() => setLexOpen(false)} base={d.lexicon || {}} extra={extraLex} onChange={setExtraLex} />
        </>
      )}
    </Async>
  );
}

function iconBox(bg: string, color: string): React.CSSProperties {
  return { width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", background: bg, color, flexShrink: 0 };
}

/** Preset = giọng thật × biến thể tốc độ (không bịa giọng không có trên máy). */
function Presets({ voices, settings, onPick }: { voices: Array<{ provider: string; voice: string; ready: boolean }>; settings: VoiceSettings | null; onPick: (s: Partial<VoiceSettings>) => void }) {
  const presets = voices.flatMap((v) => RATE_PRESETS.map((r) => ({ ...v, ...r })));
  return (
    <Card title="Preset giọng mẫu" sub="Tạo từ các giọng đã cài trên máy, khác nhau ở tốc độ đọc" right={<span className="small muted">{presets.length} preset</span>}>
      {presets.length === 0 ? (
        <Empty title="Chưa có giọng nào">Cài giọng tiếng Việt cho engine TTS local để dùng preset.</Empty>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
          {presets.map((p) => {
            const on = settings?.provider === p.provider && settings?.voice === p.voice && Math.abs((settings?.rate ?? 0) - p.rate) < 0.001;
            return (
              <div key={`${p.provider}-${p.voice}-${p.rate}`} className={`list-item ${on ? "on" : ""}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 14, position: "relative" }}
                onClick={() => onPick({ provider: p.provider, voice: p.voice, rate: p.rate })}>
                {on && <Check size={16} className="c-teal" style={{ position: "absolute", top: 10, right: 10 }} />}
                <div style={{ ...iconBox("var(--grad)", "#fff"), background: "var(--grad)" }}><Mic size={18} /></div>
                <div className="semi">{p.voice} – {p.label}</div>
                <div className="row wrap" style={{ gap: 6 }}><Badge tone={p.tone}>{p.rate.toFixed(2)}x</Badge><span className="xs muted">{p.hint}</span></div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PreviewPanel({ settings }: { settings: VoiceSettings }) {
  const { variants } = useFirstHook();
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [res, setRes] = useState<Preview | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [vol, setVol] = useState(0.9);
  const [showKaraoke, setShowKaraoke] = useState(true);
  const audio = useRef<HTMLAudioElement>(null);
  const raf = useRef<number>();

  useEffect(() => {
    if (!touched && variants.hook) setText(variants.hook);
    else if (!touched && !text && variants.done) setText(DEFAULT_TEXT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants.hook, variants.done]);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  useEffect(() => { if (audio.current) audio.current.volume = vol; }, [vol, res]);

  function tick() {
    const a = audio.current;
    if (a) setT(a.currentTime * 1000);
    if (a && !a.paused) raf.current = requestAnimationFrame(tick);
  }

  async function synth() {
    if (!text.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await api.post<Preview>("/voice/preview", { text, settings });
      setRes(r);
      setT(0);
      setTimeout(() => audio.current?.play().catch(() => undefined), 50);
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const a = audio.current;
    if (!a) return synth();
    if (a.paused) a.play().catch(() => undefined);
    else a.pause();
  }
  function seek(p: number) {
    const a = audio.current;
    if (!a || !res) return;
    a.currentTime = (p * res.duration_ms) / 1000;
    setT(a.currentTime * 1000);
  }
  function stop() {
    const a = audio.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setT(0);
  }

  const wf = useMemo(() => {
    const w = res?.waveform || [];
    const mx = Math.max(0.001, ...w);
    return w.map((x) => x / mx);
  }, [res]);
  const dur = res?.duration_ms || 0;
  const ticks = dur ? Array.from({ length: Math.floor(dur / 1000) + 1 }, (_, i) => i) : [];

  return (
    <Card title="Văn bản & xem trước giọng đọc" right={
      <>
        <Btn size="sm" kind="ghost" icon={<RotateCcw size={14} />} onClick={() => { setText(variants.hook || DEFAULT_TEXT); setTouched(false); }} title="Dùng lại câu hook của kịch bản đầu tiên">Lấy từ kịch bản</Btn>
        <Btn size="sm" kind="ghost" icon={<Trash2 size={14} />} onClick={() => { setText(""); setTouched(true); }}>Xoá</Btn>
      </>
    }>
      <textarea className="textarea" rows={3} maxLength={500} value={text} placeholder="Nhập văn bản cần đọc…" onChange={(e) => { setText(e.target.value); setTouched(true); }} />
      <div className="row between xs muted mt8">
        <span>{res ? <>Văn bản sau chuẩn hoá: <span className="t2">{res.normalized}</span></> : "Số, đơn vị và viết tắt sẽ được chuẩn hoá theo từ điển phát âm."}</span>
        <span>{text.length} / 500 ký tự</span>
      </div>
      {err && <div className="mt12"><ErrorBox error={err} onRetry={synth} /></div>}

      <div className="inner mt12">
        <div className="row" style={{ gap: 14, alignItems: "center" }}>
          <button className="btn primary" style={{ width: 52, height: 52, borderRadius: "50%", padding: 0 }} onClick={toggle} disabled={loading || !text.trim()} title={res ? "Phát / tạm dừng" : "Tổng hợp và nghe thử"}>
            {playing ? <Pause size={20} /> : <Play size={20} fill="#fff" />}
          </button>
          <div className="small" style={{ width: 90 }}>
            <div className="semi">{msPrecise(t)}</div>
            <div className="muted">/ {res ? msPrecise(dur) : "--:--"}</div>
          </div>
          <div className="grow">
            {res ? (
              <>
                <div style={{ position: "relative", height: 14 }}>
                  {ticks.map((i) => (
                    <span key={i} className="xs muted" style={{ position: "absolute", left: `${((i * 1000) / dur) * 100}%`, transform: "translateX(-50%)" }}>{ms(i * 1000)}</span>
                  ))}
                </div>
                <Waveform values={wf} height={64} progress={dur ? Math.min(1, t / dur) : 0} onSeek={seek} />
              </>
            ) : (
              <div className="center small muted" style={{ height: 78, display: "grid", placeItems: "center", border: "1px dashed var(--border-2)", borderRadius: 9 }}>
                {loading ? "Đang tổng hợp giọng đọc…" : "Bấm “Nghe thử” để tạo sóng âm từ giọng thật"}
              </div>
            )}
          </div>
        </div>
        <div className="row mt12 wrap" style={{ gap: 10 }}>
          <Btn kind="primary" icon={<Wand2 size={15} />} onClick={synth} loading={loading} disabled={!text.trim()}>Nghe thử</Btn>
          <Btn size="sm" icon={<RotateCcw size={14} />} onClick={() => { seek(0); audio.current?.play().catch(() => undefined); }} disabled={!res}>Phát lại</Btn>
          <Btn size="sm" icon={<Square size={13} />} onClick={stop} disabled={!res}>Dừng</Btn>
          <div className="row grow" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Volume2 size={16} className="muted" />
            <input className="range" type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => setVol(Number(e.target.value))} style={{ width: 120 }} />
          </div>
        </div>
        {res && (
          <audio ref={audio} src={fileUrl(res.uri)} preload="auto"
            onPlay={() => { setPlaying(true); raf.current = requestAnimationFrame(tick); }}
            onPause={() => { setPlaying(false); tick(); }}
            onEnded={() => { setPlaying(false); setT(dur); }}
            onTimeUpdate={() => { if (audio.current?.paused) setT(audio.current.currentTime * 1000); }} />
        )}
      </div>

      <div className="row between mt16">
        <div className="card-title" style={{ fontSize: 14 }}>Đồng bộ lời (Karaoke)</div>
        <div className="row small t2"><span>Hiển thị lời theo thời gian</span><ToggleSm on={showKaraoke} onChange={setShowKaraoke} /></div>
      </div>
      {showKaraoke && (
        res?.words?.length ? (
          <div className="mt8" style={{ position: "relative" }}>
            <div className="row wrap" style={{ gap: 6 }}>
              {res.words.map((w, i) => {
                const active = t >= w.start_ms && t < w.end_ms;
                const past = t >= w.end_ms;
                return (
                  <span key={i} onClick={() => seek(w.start_ms / dur)} title={`${msPrecise(w.start_ms)} → ${msPrecise(w.end_ms)}`}
                    style={{
                      padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                      background: active ? "var(--grad)" : past ? "rgba(25,211,181,.16)" : "var(--panel-2)",
                      color: active ? "#fff" : past ? "var(--teal)" : "var(--text-2)",
                      border: `1px solid ${active ? "transparent" : "var(--border)"}`,
                    }}>{w.w}</span>
                );
              })}
            </div>
            <div className="xs muted mt8">Mốc thời gian từng từ được ước lượng theo độ dài ký tự trên câu đã đọc (forced timing theo câu).</div>
          </div>
        ) : <div className="small muted mt8">Chưa có dữ liệu lời — nghe thử để tạo dòng thời gian từng từ.</div>
      )}
    </Card>
  );
}

function ToggleSm({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} className={`toggle ${on ? "on" : ""} purple`} onClick={() => onChange(!on)} />;
}

/** Lấy câu hook của kịch bản đầu tiên trong chiến dịch làm văn bản mặc định. */
function useFirstHook() {
  const v = useVariants(undefined, 0);
  const items = v.data?.items || [];
  const first = items.find((x) => x.script?.hook);
  return { variants: { hook: first?.script?.hook as string | undefined, done: !v.loading } };
}

function BatchQueue({ settings }: { settings: VoiceSettings }) {
  const nav = useNavigate();
  const { campaign, toast, toastError } = useApp();
  const vq = useVariants();
  const jobs = useApi<any>("/render/jobs", { kind: "voice", size: 100 }, 3000);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState<{ id: string; uri: string } | null>(null);
  const [loadingPlay, setLoadingPlay] = useState<string | null>(null);

  const items: any[] = vq.data?.items || [];
  const eligible = items.filter((v) => HAS_STORYBOARD.has(v.status));
  const jobByVariant = useMemo(() => {
    const m = new Map<string, any>();
    for (const j of jobs.data?.items || []) {
      if (!j.variant_id) continue;
      const prev = m.get(j.variant_id);
      if (!prev || (j.updated_at || j.created_at) > (prev.updated_at || prev.created_at)) m.set(j.variant_id, j);
    }
    return m;
  }, [jobs.data]);

  const selEligible = [...sel].filter((id) => eligible.some((v) => v.id === id));
  const totalSec = eligible.filter((v) => sel.has(v.id)).reduce((a, v) => a + (v.script?.est_seconds || 0), 0);

  async function runBatch() {
    let ok = 0;
    const errors: unknown[] = [];
    for (const id of selEligible) {
      try {
        await api.post(`/variants/${id}/voice`, { voice: settings });
        ok++;
      } catch (e) {
        errors.push(e);
      }
    }
    if (ok) toast({ kind: "success", title: `Đã xếp ${ok} job tạo giọng đọc`, body: `Giọng ${settings.voice} · ${settings.rate}x · ${settings.lufs} LUFS` });
    if (errors.length) toastError(errors[0], `${errors.length} biến thể không xếp hàng được`);
    jobs.reload();
    setSel(new Set());
    return ok ? true : undefined;
  }

  async function playVariant(v: any) {
    if (playing?.id === v.id) return setPlaying(null);
    setLoadingPlay(v.id);
    try {
      const d = await api.get<any>(`/variants/${v.id}`);
      const uri = d.storyboard?.timeline_json?.tracks?.voice_mix;
      if (!uri) toast({ kind: "warn", title: `${v.code} chưa có giọng đọc`, body: "Chọn biến thể và bấm “Tạo giọng đọc (Hàng loạt)”." });
      else setPlaying({ id: v.id, uri });
    } catch (e) {
      toastError(e);
    } finally {
      setLoadingPlay(null);
    }
  }

  if (!campaign) return null;
  return (
    <Card className="mt16" title={<>Hàng đợi xử lý hàng loạt <span className="muted small" style={{ fontWeight: 500 }}>(biến thể đã có storyboard)</span></>}
      icon={<ListChecks size={16} className="c-primary" />}
      right={
        <>
          <span className="small t2">Đã chọn: <b>{selEligible.length}</b> / {eligible.length}</span>
          <span className="small t2">· Ước tính lời thoại: <b>{ms(totalSec * 1000)}</b></span>
          <Btn size="sm" kind="ghost" onClick={() => nav("/production/queue")}>Mở Render Queue →</Btn>
        </>
      }>
      {vq.error && !vq.data ? <ErrorBox error={vq.error} onRetry={vq.reload} /> : vq.loading && !vq.data ? <div className="small muted">Đang tải…</div> : items.length === 0 ? (
        <Empty title="Chiến dịch chưa có biến thể" action={<Btn kind="primary" onClick={() => nav("/creative/strategy")}>Đến Chiến lược nội dung</Btn>}>
          Lập ma trận và kịch bản trước khi tạo giọng đọc.
        </Empty>
      ) : (
        <>
          <div className="row" style={{ gap: 16, alignItems: "stretch" }}>
            <div className="table-wrap grow" style={{ maxHeight: 340 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <input type="checkbox" className="check" checked={eligible.length > 0 && selEligible.length === eligible.length}
                        onChange={(e) => setSel(e.target.checked ? new Set(eligible.map((v) => v.id)) : new Set())} />
                    </th>
                    <th>Mã</th><th>Kịch bản</th><th>Giọng sử dụng</th><th>Độ dài (ước tính)</th><th>Biến thể</th><th>Job giọng đọc</th><th style={{ width: 150 }}>Tiến trình</th><th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((v) => {
                    const ok = HAS_STORYBOARD.has(v.status);
                    const j = jobByVariant.get(v.id);
                    const jVoice = j?.profile_json?.voice;
                    return (
                      <tr key={v.id} className={sel.has(v.id) ? "sel" : ""} style={{ opacity: ok ? 1 : 0.55 }}>
                        <td>
                          <input type="checkbox" className="check" disabled={!ok} title={ok ? undefined : "Cần storyboard trước khi tạo giọng đọc"} checked={sel.has(v.id)}
                            onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(v.id); else n.delete(v.id); setSel(n); }} />
                        </td>
                        <td className="semi">{v.code}</td>
                        <td><div className="ellipsis" style={{ maxWidth: 260 }}>{v.script?.title || "—"}</div><div className="xs muted">{v.angle_label} · {v.audience_label}</div></td>
                        <td className="small"><span className="row" style={{ gap: 6 }}><Mic size={13} className="muted" />{jVoice?.voice ? `${jVoice.voice} · ${jVoice.rate ?? 1}x` : ok ? `${settings.voice} · ${settings.rate}x` : "—"}</span></td>
                        <td className="small">{v.script?.est_seconds ? `~ ${ms(v.script.est_seconds * 1000)}` : "—"}</td>
                        <td><VariantStatus status={v.status} /></td>
                        <td>{j ? <JobStatus status={j.status} /> : <span className="xs muted">{ok ? "Chưa tạo" : "Cần storyboard"}</span>}
                          {j?.status === "FAILED" && j.error_message && <div className="xs c-red ellipsis" style={{ maxWidth: 180 }} title={j.error_message}>{j.error_code}: {j.error_message}</div>}</td>
                        <td>{j ? <div className="row" style={{ gap: 8 }}><Bar value={(j.progress || 0) * 100} tone={j.status === "COMPLETED" ? "teal" : ""} thin style={{ flex: 1 }} /><span className="xs">{Math.round((j.progress || 0) * 100)}%</span></div> : <span className="xs muted">—</span>}</td>
                        <td>
                          <Btn size="xs" icon={playing?.id === v.id ? <Pause size={12} /> : <Play size={12} />} loading={loadingPlay === v.id} disabled={!ok}
                            title={ok ? "Nghe giọng đọc hiện có trong timeline" : "Chưa có storyboard"} onClick={() => playVariant(v)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="col" style={{ width: 240, justifyContent: "center" }}>
              <Btn kind="primary" size="lg" icon={<Play size={16} fill="#fff" />} onClick={runBatch} disabled={!selEligible.length}
                title={selEligible.length ? `Xếp ${selEligible.length} job tạo giọng đọc` : "Chọn ít nhất một biến thể đã có storyboard"}>
                Tạo giọng đọc (Hàng loạt)
              </Btn>
              <div className="xs muted center">Dùng giọng {settings.voice} · {settings.rate.toFixed(2)}x · {settings.lufs} LUFS. Giọng đọc được ghép vào timeline của storyboard.</div>
              {eligible.length === 0 && <div className="xs c-orange center">Chưa có biến thể nào có storyboard — tạo tại <span className="link" onClick={() => nav("/creative/storyboard")}>Storyboard AI</span>.</div>}
            </div>
          </div>
          {playing && (
            <div className="inner mt12 row">
              <span className="small semi">Đang nghe: {items.find((x) => x.id === playing.id)?.code}</span>
              <audio src={fileUrl(playing.uri)} controls autoPlay style={{ flex: 1, height: 34 }} onEnded={() => setPlaying(null)} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function LexiconModal({ open, onClose, base, extra, onChange }: { open: boolean; onClose: () => void; base: Record<string, string>; extra: Record<string, string>; onChange: (x: Record<string, string>) => void }) {
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Từ điển phát âm" width={620}
      footer={<Btn kind="primary" onClick={onClose}>Xong</Btn>}>
      <div className="small t2 mb12">Mục bổ sung được gửi kèm mỗi lần nghe thử / tạo giọng, và được lưu khi bấm “Lưu làm giọng mặc định”.</div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" placeholder="Viết tắt / từ gốc (vd: SPF)" value={k} onChange={(e) => setK(e.target.value)} />
        <input className="input" placeholder="Cách đọc (vd: ét pê ép)" value={v} onChange={(e) => setV(e.target.value)} />
        <Btn icon={<Plus size={15} />} disabled={!k.trim() || !v.trim()} onClick={() => { onChange({ ...extra, [k.trim()]: v.trim() }); setK(""); setV(""); }}>Thêm</Btn>
      </div>
      <div className="table-wrap mt12" style={{ maxHeight: 340 }}>
        <table className="tbl">
          <thead><tr><th>Từ</th><th>Cách đọc</th><th>Nguồn</th><th /></tr></thead>
          <tbody>
            {Object.entries(extra).map(([a, b]) => (
              <tr key={`x-${a}`}><td className="semi">{a}</td><td>{b}</td><td><Badge tone="purple">Bổ sung</Badge></td>
                <td><button className="icon-btn" aria-label="Xoá" onClick={() => { const n = { ...extra }; delete n[a]; onChange(n); }}><Trash2 size={14} /></button></td></tr>
            ))}
            {Object.entries(base).map(([a, b]) => (
              <tr key={`b-${a}`}><td className="semi">{a}</td><td>{b}</td><td><Badge tone="gray">Mặc định</Badge></td><td /></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
