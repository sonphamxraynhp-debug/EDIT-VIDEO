/** Thư viện nhạc nền: bài đã soát giấy phép chia theo tâm trạng, tải về bằng nút bấm, nghe thử, thêm nhạc của mình. */
import { useEffect, useRef, useState } from "react";
import { Download, FolderOpen, Music2, Pause, Play, Trash2, Upload } from "lucide-react";
import { api, fileUrl, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { Badge, Bar, Btn, Card, Empty, InfoNote, Loading, PageHead } from "../components/ui";

const mb = (b: number) => `${(b / 1048576).toFixed(b > 10485760 ? 0 : 1)} MB`;
const mmss = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
let player: HTMLAudioElement | null = null;

export default function Music() {
  const { toast, toastError } = useApp();
  const [mood, setMood] = useState<string>("all");
  const [poll, setPoll] = useState(0);
  const q = useApi<any>("/music", undefined, poll);
  const [playing, setPlaying] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const d = q.data;
  const running = !!d?.state?.running;
  const wasRunning = useRef(false);
  useEffect(() => { setPoll(running ? 1500 : 0); }, [running]);
  useEffect(() => {
    if (wasRunning.current && !running && d) {
      const bad = d.state.errors?.length || 0;
      toast(bad ? { kind: "warn", title: `Tải xong, ${bad} bài không tải được`, body: "Bấm tải lại để thử các bài còn thiếu." } : { kind: "success", title: "Đã tải xong nhạc" });
    }
    wasRunning.current = running;
  }, [running]);
  useEffect(() => () => { player?.pause(); }, []);
  if (!d) return <Loading rows={5} h={22} />;

  const cat: any[] = d.catalog;
  const moods = Object.entries(d.moods as Record<string, string>).filter(([k]) => k !== "mine" && cat.some((t) => t.mood === k));
  const shown = cat.filter((t) => mood === "all" || t.mood === mood);
  const missing = shown.filter((t) => !t.installed);
  const installed = cat.filter((t) => t.installed).length;

  function play(key: string, src?: string) {
    player?.pause();
    if (playing === key || !src) { setPlaying(null); return; }
    player = new Audio(src);
    player.onended = () => setPlaying(null);
    player.play().then(() => setPlaying(key)).catch((e) => toastError(e, "Không phát được bài này"));
  }
  async function download(body: Record<string, unknown>) {
    try { await api.post("/music/download", body); q.reload(); setPoll(1500); return true; }
    catch (e) { toastError(e, "Không tải được nhạc"); return undefined; }
  }
  async function upload(list: FileList | null) {
    for (const file of Array.from(list || [])) {
      const fd = new FormData();
      fd.append("file", file);
      try { await api.post("/music/upload", fd); } catch (e) { toastError(e, `Không nhận được ${file.name}`); }
    }
    q.reload();
  }
  async function remove(file: string, name: string) {
    if (!window.confirm(`Xoá bài “${name}” khỏi máy?`)) return;
    try { await api.del(`/music/${encodeURIComponent(file)}`); q.reload(); } catch (e) { toastError(e, "Không xoá được"); }
  }

  return (
    <div>
      <PageHead icon={<Music2 size={22} />} title="Thư viện nhạc" sub="Nhạc nền đã soát giấy phép, chia theo tâm trạng. Nhạc tự nhỏ lại dưới giọng đọc."
        actions={<>
          <Btn kind="ghost" icon={<FolderOpen size={15} />} onClick={() => api.post("/system/open-folder", { path: d.dir }).then(() => true).catch((e) => { toastError(e); return undefined; })}>Mở thư mục nhạc</Btn>
          <Btn icon={<Upload size={15} />} onClick={() => input.current?.click()}>Thêm nhạc của tôi</Btn>
          <input ref={input} type="file" multiple accept="audio/*" style={{ display: "none" }} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </>} />

      {!cat.length ? <Empty title="Danh mục nhạc chưa có bài nào">Bạn vẫn có thể bấm “Thêm nhạc của tôi” để dùng nhạc mình có quyền sử dụng.</Empty> : (
        <Card title={`Nhạc có sẵn để tải: ${installed}/${cat.length} bài đã có trên máy`}
          right={missing.length > 0 && <Btn kind="primary" size="sm" icon={<Download size={14} />} loading={running} onClick={() => download(mood === "all" ? {} : { mood })}>
            Tải {missing.length} bài{mood === "all" ? "" : ` ${d.moods[mood].toLowerCase()}`} ({mb(missing.reduce((s, t) => s + (t.bytes || 0), 0))})</Btn>}>
          {running && <div className="mb12"><div className="xs muted">Đang tải {d.state.done}/{d.state.total}{d.state.current ? `: ${d.state.current}` : ""}</div><Bar value={(d.state.done / Math.max(1, d.state.total)) * 100} thin /></div>}
          <div className="row mb12" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className={`chip ${mood === "all" ? "on" : ""}`} onClick={() => setMood("all")}>Tất cả ({cat.length})</span>
            {moods.map(([k, label]) => <span key={k} className={`chip ${mood === k ? "on" : ""}`} onClick={() => setMood(k)}>{label} ({cat.filter((t) => t.mood === k).length})</span>)}
          </div>
          <div className="col" style={{ gap: 6 }}>
            {shown.map((t) => (
              <div key={t.id} className="inner row between" style={{ gap: 10, padding: "8px 10px" }}>
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  <button type="button" className="chip" title={t.installed ? "Nghe thử" : "Tải về rồi mới nghe được"} disabled={!t.installed} style={{ opacity: t.installed ? 1 : 0.4 }}
                    onClick={() => play(t.id, fileUrl(t.path))}>{playing === t.id ? <Pause size={13} /> : <Play size={13} />}</button>
                  <div style={{ minWidth: 0 }}>
                    <div className="small semi ellipsis">{t.title}</div>
                    <div className="xs muted ellipsis">{[t.artist, mmss(t.duration_s), t.licence, t.attribution ? "phải ghi công" : "không cần ghi công"].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
                <div className="row" style={{ gap: 8, flexShrink: 0 }}>
                  <Badge tone="gray">{d.moods[t.mood]}</Badge>
                  {t.installed ? <Badge tone="teal">Đã có</Badge>
                    : <button type="button" className="chip" disabled={running} onClick={() => download({ ids: [t.id] })}><Download size={13} />{t.bytes ? mb(t.bytes) : "Tải"}</button>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {d.mine.length > 0 && (
        <Card title={`Nhạc của tôi (${d.mine.length})`} className="mt16">
          <div className="col" style={{ gap: 6 }}>
            {d.mine.map((t: any) => (
              <div key={t.file} className="inner row between" style={{ gap: 10, padding: "8px 10px" }}>
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  <button type="button" className="chip" onClick={() => play(t.file, fileUrl(t.path))}>{playing === t.file ? <Pause size={13} /> : <Play size={13} />}</button>
                  <div className="small semi ellipsis">{t.name} <span className="xs muted">{mmss(t.duration_s)}</span></div>
                </div>
                <button type="button" className="chip" title="Xoá khỏi máy" onClick={() => remove(t.file, t.name)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt16"><InfoNote>
        Mỗi bài có ghi giấy phép và nguồn trong file LICENSES.txt ở thư mục nhạc. Bài ghi “phải ghi công” thì cần ghi tên tác giả trong phần mô tả khi đăng video.
        Nhạc bạn tự thêm thì bạn tự chịu trách nhiệm về quyền sử dụng.
      </InfoNote></div>
    </div>
  );
}
