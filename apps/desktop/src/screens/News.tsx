/** Chế độ Tin tức: dán nội dung tin + thả ảnh/video → AI viết tiêu đề và lời đọc → dựng video dọc kiểu kênh tin. */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Copy, FolderOpen, Loader2, Newspaper, Plus, Sparkles, Trash2, Upload, Volume2, Wand2, X } from "lucide-react";
import { API, api, fileUrl, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { dt } from "../lib/format";
import { uploadWithProgress } from "../components/a_flow";
import { Badge, Bar, Btn, Card, Empty, Field, InfoNote, Loading, PageHead, Warn } from "../components/ui";

const TEXT_KEYS = ["source_text", "headline", "hook", "body", "category", "channel", "credit", "date_label", "cta_text", "price", "offer", "link", "caption", "hashtags"] as const;
type TextKey = (typeof TEXT_KEYS)[number];
const MOOD_VI: Record<string, string> = { news: "Tin tức", emotional: "Cảm động", upbeat: "Vui tươi", dramatic: "Kịch tính", inspirational: "Truyền cảm hứng", calm: "Nhẹ nhàng", corporate: "Doanh nghiệp", funny: "Hài hước", mine: "Của tôi" };
/** Chữ trên màn soạn đổi theo chế độ: mỗi chế độ cần nguyên liệu khác nhau. */
const KIND_UI: Record<string, { card1: string; intro: string; media: string; src: string; srcHint: string; card2: string; head: string; headHint: string; body: string; bodyHint: string; need: string }> = {
  news: { card1: "1. Nội dung tin và hình", intro: "", media: "Hình đầu tiên dùng cho phần mở đầu có vùng chữ màu.", src: "Nội dung tin", srcHint: "Dán bài viết hoặc ghi vài dòng sự việc. Để trống thì AI nghe lời nói trong clip để viết.",
    card2: "2. Tiêu đề và lời đọc", head: "Tiêu đề trên màn hình", headHint: "Hiện trong vùng chữ màu ở phần mở đầu, tự chuyển thành chữ in hoa. Nên dưới 200 ký tự.", body: "Lời đọc thân bài", bodyHint: "Mỗi dòng một câu. Phần này chỉ có giọng đọc, không hiện chữ.", need: "Cần ít nhất một hình, tiêu đề và lời đọc thân bài" },
  sale: { card1: "1. Sản phẩm và hình", intro: "", media: "Hình đầu tiên dùng cho phần mở đầu và màn chốt.", src: "Mô tả sản phẩm", srcHint: "AI chỉ được dùng thông tin ghi ở đây: không bịa công dụng, giá hay ưu đãi.",
    card2: "2. Tiêu đề và lời đọc", head: "Tiêu đề trên màn hình", headHint: "Hiện ở phần mở đầu, tự chuyển thành chữ in hoa.", body: "Lời đọc thân bài", bodyHint: "Mỗi dòng một câu. Phần này chỉ có giọng đọc, không hiện chữ.", need: "Cần ít nhất một hình, tiêu đề và lời đọc thân bài" },
  review: { card1: "1. Clip người nói và hình sản phẩm", intro: "Review có người thật: giữ nguyên giọng người nói. Máy cắt bỏ khoảng lặng, chạy phụ đề theo lời, chèn hình sản phẩm xen vào, rồi kết bằng màn chốt.",
    media: "Clip có người nói là phần chính. Thả thêm ảnh sản phẩm thì máy chèn xen vào, khoảng 7 giây một hình.", src: "", srcHint: "",
    card2: "2. Tiêu đề và màn chốt", head: "Tiêu đề ở đầu video", headHint: "Hiện trong hộp màu ở trên cùng suốt video. Để trống thì không hiện.", body: "", bodyHint: "", need: "Cần một clip có người nói" },
  clips: { card1: "1. Video dài cần cắt", intro: "Cắt video dài: máy nghe cả video, chọn những đoạn có ý trọn vẹn, cắt thành nhiều clip dọc có tiêu đề và phụ đề. Video một giờ cần vài phút để nghe.",
    media: "Thả một video dài có người nói: buổi dạy, livestream, phỏng vấn.", src: "", srcHint: "", card2: "2. Chữ để dán khi đăng", head: "", headHint: "", body: "", bodyHint: "", need: "Cần một video có người nói" },
  story: { card1: "1. Bài viết và hình", intro: "Kể chuyện bằng ảnh: mỗi câu là một cảnh. Hình phủ kín màn hình, chữ của câu hiện bên dưới, giọng AI đọc.",
    media: "Hình lần lượt đi với từng câu; ít hình hơn số câu thì máy quay vòng.", src: "Bài viết gốc", srcHint: "Dán bài viết để AI chuyển thành lời kể. Nếu đã có lời kể thì bỏ qua ô này, nhập thẳng ở mục 2.",
    card2: "2. Tên câu chuyện và lời kể", head: "Tên câu chuyện", headHint: "Hiện chữ lớn ở cảnh mở đầu. Để trống thì vào thẳng câu đầu tiên.", body: "Lời kể", bodyHint: "Mỗi dòng một câu, mỗi câu là một cảnh có chữ hiện trên hình. Nên dưới 22 chữ mỗi câu.", need: "Cần ít nhất một hình và lời kể" },
  quote: { card1: "1. Nội dung và hình nền", intro: "Trích dẫn: chữ lớn hiện lần lượt trên nền màu hoặc hình làm mờ, nhạc là chính. Hợp video 10 đến 20 giây.",
    media: "Không bắt buộc. Thả một ảnh hoặc video để làm nền mờ; không thả thì dùng nền màu.", src: "Nội dung gốc", srcHint: "Dán bài viết nếu muốn AI rút thành vài ý ngắn. Nếu đã có câu trích dẫn thì nhập thẳng ở mục 2.",
    card2: "2. Câu trích dẫn", head: "Nhãn chủ đề", headHint: "Vài chữ hiện phía trên, ví dụ “Bài học bán hàng”. Để trống thì không hiện.", body: "Câu trích dẫn hoặc các ý", bodyHint: "Một dòng là một câu trích dẫn lớn. Nhiều dòng (tối đa 6) thì hiện lần lượt từng ý.", need: "Cần có câu trích dẫn" },
};
const STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "Đang soạn", tone: "gray" },
  rendering: { label: "Đang dựng", tone: "purple" },
  done: { label: "Đã xong", tone: "teal" },
  failed: { label: "Lỗi", tone: "red" },
};

export default function News() {
  const [sp, setSp] = useSearchParams();
  const id = sp.get("id");
  const creating = useRef(false);
  const { toastError } = useApp();
  useEffect(() => {
    if (sp.get("new") !== "1" || creating.current) return;
    creating.current = true;
    api.post("/news", sp.get("kind") ? { kind: sp.get("kind") } : {}).then((it: any) => setSp({ id: it.id }, { replace: true })).catch((e) => { toastError(e, "Không tạo được tin mới"); setSp({}, { replace: true }); })
      .finally(() => { creating.current = false; });
  }, [sp]);
  if (sp.get("new") === "1") return <Loading rows={4} h={22} />;
  return id ? <Editor key={id} id={id} /> : <List />;
}

function List() {
  const nav = useNavigate();
  const { toast, toastError } = useApp();
  const q = useApi<any>("/news", undefined, 5000);
  async function remove(it: any) {
    if (!window.confirm(`Xoá tin “${it.headline || "chưa có tiêu đề"}”? Video đã xuất vẫn được giữ trong thư mục.`)) return;
    try { await api.del(`/news/${it.id}`); toast({ kind: "success", title: "Đã xoá tin" }); q.reload(); } catch (e) { toastError(e, "Không xoá được"); }
  }
  return (
    <div>
      <PageHead icon={<Newspaper size={22} />} title="Tin tức" sub="Video dọc kiểu kênh tin: hình thật, vùng chữ màu, giọng AI đọc."
        actions={<Btn kind="primary" icon={<Plus size={16} />} onClick={() => nav("/news?new=1")}>Tạo tin mới</Btn>} />
      {!q.data ? <Loading rows={4} /> : !q.data.items.length ? (
        <Empty title="Chưa có tin nào" action={<Btn kind="primary" icon={<Plus size={16} />} onClick={() => nav("/news?new=1")}>Tạo tin đầu tiên</Btn>}>
          Dán nội dung tin, thả ảnh hoặc video vào, máy viết lời và dựng thành video.
        </Empty>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {q.data.items.map((it: any) => (
            <div key={it.id} className="card list-item row between" style={{ gap: 12, padding: 12 }} onClick={() => nav(`/news?id=${it.id}`)}>
              <div className="row" style={{ gap: 12, minWidth: 0 }}>
                {it.output?.thumb ? <img src={fileUrl(it.output.thumb)} alt="" style={{ width: 36, height: 64, objectFit: "cover", borderRadius: 6 }} /> : <div style={{ width: 36 }} />}
                <div style={{ minWidth: 0 }}>
                  <div className="semi ellipsis">{it.headline || "Tin chưa có tiêu đề"}</div>
                  <div className="xs muted">{it.media.length} ảnh và video · {dt(it.updated_at)}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Badge tone={STATUS[it.status]?.tone || "gray"}>{STATUS[it.status]?.label || it.status}</Badge>
                <button type="button" className="chip" title="Xoá tin" onClick={(e) => { e.stopPropagation(); remove(it); }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

let sampleAudio: HTMLAudioElement | null = null;

function Editor({ id }: { id: string }) {
  const nav = useNavigate();
  const { toast, toastError } = useApp();
  const [busy, setBusy] = useState(false);
  const q = useApi<any>(`/news/${id}`, undefined, busy ? 1500 : 0);
  const meta = useApi<any>("/news");
  const factory = useApi<any>("/factory");
  const lk = useApi<any>("/looks");
  const it = q.data;
  const [form, setForm] = useState<Record<TextKey, string> | null>(null);
  const [ups, setUps] = useState<Array<{ key: number; name: string; p: number }>>([]);
  const [over, setOver] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [count, setCount] = useState(3);
  const [varyVoice, setVaryVoice] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => { if (it && !form) setForm(Object.fromEntries(TEXT_KEYS.map((k) => [k, it[k] || ""])) as any); }, [it]);
  useEffect(() => { setBusy(it?.status === "rendering"); }, [it?.status]);
  useEffect(() => () => { sampleAudio?.pause(); }, []);
  if (q.error && !it) return <Empty title="Không tìm thấy tin này" action={<Btn onClick={() => nav("/news")}>Về danh sách tin</Btn>} />;
  if (!it || !form) return <Loading rows={5} h={22} />;

  const rendering = it.status === "rendering";
  const themes: Record<string, any> = meta.data?.themes || {};
  const voices: any[] = meta.data?.voices || [];
  const music: any[] = meta.data?.music || [];
  const styles: Record<string, string> = meta.data?.styles || {};
  const moods: Record<string, string> = meta.data?.moods || {};
  const variants: any[] = it.variants || [];
  const kinds: Record<string, string> = meta.data?.kinds || {};
  const platforms: Record<string, string> = meta.data?.platforms || {};
  const sale = it.kind === "sale";
  const kind: string = KIND_UI[it.kind] ? it.kind : "news";
  const K = KIND_UI[kind];
  const classic = kind === "news" || kind === "sale";
  const talk = kind === "review" || kind === "clips";
  const shop = sale || kind === "review";                      // hai chế độ có màn chốt bán hàng
  const flag = (k: string, label: string, hint: string) => (
    <label className="row small" style={{ gap: 8, cursor: "pointer", alignItems: "flex-start" }}>
      <input type="checkbox" checked={!!it[k]} disabled={rendering} onChange={(e) => put({ [k]: e.target.checked })} style={{ marginTop: 3 }} />
      <span>{label}<span className="xs muted" style={{ display: "block" }}>{hint}</span></span>
    </label>);
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast({ kind: "success", title: "Đã chép" })).catch(() => toast({ kind: "warn", title: "Không chép được, hãy bôi đen rồi chép tay" }));
  async function applyProfile(pid: string) {
    if (!pid || !(await saveText())) return;
    try { const r = await api.post(`/news/${id}/profile/${pid}`, {}); setForm(Object.fromEntries(TEXT_KEYS.map((k) => [k, r[k] || ""])) as any); q.reload(); toast({ kind: "success", title: "Đã áp bộ kênh" }); }
    catch (e) { toastError(e, "Không áp được bộ kênh"); }
  }
  async function saveProfile() {
    const name = window.prompt("Đặt tên cho bộ kênh (lưu tên kênh, màu, kiểu mở đầu, giọng, nhạc, nền tảng của tin này):");
    if (!name?.trim() || !(await saveText())) return;
    try { await api.post(`/factory/profiles/from/${id}`, { name }); factory.reload(); toast({ kind: "success", title: "Đã lưu bộ kênh" }); } catch (e) { toastError(e, "Không lưu được bộ kênh"); }
  }
  const dirty = TEXT_KEYS.some((k) => (form[k] || "") !== (it[k] || ""));

  async function put(patch: Record<string, unknown>) {
    try { await api.put(`/news/${id}`, patch); q.reload(); return true; }
    catch (e) { toastError(e, "Không lưu được"); return undefined; }
  }
  async function saveText() {
    const patch: Record<string, string> = {};
    TEXT_KEYS.forEach((k) => { if ((form![k] || "") !== (it[k] || "")) patch[k] = form![k]; });
    return Object.keys(patch).length ? put(patch) : true;
  }
  const text = (k: TextKey) => ({ value: form[k], onChange: (e: any) => setForm({ ...form, [k]: e.target.value }), onBlur: () => { saveText(); }, disabled: rendering });

  async function addFiles(list: FileList | null) {
    const all = Array.from(list || []);
    const files = all.filter((x) => /\.(mp4|mov|m4v|mkv|webm|jpe?g|png|webp)$/i.test(x.name));
    if (all.length > files.length) toast({ kind: "warn", title: `Bỏ qua ${all.length - files.length} file không phải ảnh hoặc video` });
    for (const file of files) {
      const key = ++seq.current;
      setUps((u) => [...u, { key, name: file.name, p: 0 }]);
      const fd = new FormData();
      fd.append("file", file);
      try { await uploadWithProgress(`/news/${id}/media`, fd, (p) => setUps((u) => u.map((x) => (x.key === key ? { ...x, p } : x)))); }
      catch (e) { toastError(e, `Không nhận được ${file.name}`); }
      setUps((u) => u.filter((x) => x.key !== key));
      q.reload();
    }
  }
  async function write() {
    if (form!.body.trim() && !window.confirm("AI sẽ viết lại từ ô Nội dung và thay toàn bộ tiêu đề, lời mở đầu, lời thân bài hiện tại, kể cả những chỗ bạn đã sửa tay. Tiếp tục?")) return undefined;
    if (!(await saveText())) return undefined;
    try {
      const r = await api.post(`/news/${id}/write`, {});
      setForm(Object.fromEntries(TEXT_KEYS.map((k) => [k, r[k] || ""])) as any);
      q.reload();
      toast({ kind: "success", title: "Đã viết xong tiêu đề và lời đọc", body: r.script_engine === "llm" ? "Đọc lại và sửa tay nếu cần." : "Máy chưa có AI viết lời nên dùng nguyên văn nội dung. Sửa tay cho gọn." });
      return true;
    } catch (e) { toastError(e, "Chưa viết được lời"); return undefined; }
  }
  async function build() {
    if (!(await saveText())) return undefined;
    try { await api.post(`/news/${id}/render`, {}); setBusy(true); q.reload(); return true; }
    catch (e) { toastError(e, "Chưa dựng được"); return undefined; }
  }
  async function buildVariants() {
    if (!(await saveText())) return undefined;
    try { await api.post(`/news/${id}/variants`, { count, vary_voice: varyVoice }); setBusy(true); q.reload(); return true; }
    catch (e) { toastError(e, "Chưa tạo được biến thể"); return undefined; }
  }
  async function listen(name: string) {
    sampleAudio?.pause();
    if (playing === name) { setPlaying(null); return; }
    try {
      const r = await api.post("/voice/sample", { name });
      sampleAudio = new Audio(fileUrl(r.path));
      sampleAudio.onended = () => setPlaying(null);
      await sampleAudio.play();
      setPlaying(name);
    } catch (e) { toastError(e, "Chưa nghe thử được"); }
  }
  const hasSpeech = it.media.some((m: any) => m.has_audio);
  const firstHasAudio = it.media[0]?.has_audio;
  const canWrite = talk ? hasSpeech : !!form.source_text.trim() || (classic && hasSpeech);
  const canBuild = talk ? hasSpeech : kind === "quote" ? !!form.body.trim() : kind === "story" ? it.media.length > 0 && !!form.body.trim()
    : it.media.length > 0 && !!(form.hook.trim() || form.headline.trim()) && !!form.body.trim();
  async function buildClips() {
    if (!(await saveText())) return undefined;
    try { await api.post(`/news/${id}/variants`, { count: it.clip_count }); setBusy(true); q.reload(); return true; }
    catch (e) { toastError(e, "Chưa cắt được"); return undefined; }
  }

  return (
    <div>
      <PageHead icon={<Newspaper size={22} />} title="Tin tức" sub="Dán nội dung, thả ảnh hoặc video, máy viết lời và dựng thành video dọc kiểu kênh tin."
        actions={<Btn kind="ghost" icon={<ArrowLeft size={15} />} onClick={() => nav("/news")}>Danh sách tin</Btn>} />
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, alignItems: "start" }}>
        <div className="col" style={{ gap: 16 }}>
          <Card title={K.card1} icon={<Upload size={16} className="c-primary" />}
            right={<div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>{Object.entries(kinds).map(([k, label]) => <span key={k} className={`chip ${it.kind === k ? "on" : ""}`} onClick={() => !rendering && put({ kind: k })}>{label}</span>)}</div>}>
            {sale && <div className="xs muted mb8">Video bán hàng: lời đi theo khuôn vấn đề, giải pháp, điểm đáng chú ý, rồi kết bằng màn chốt có lời mời xem sản phẩm{it.product_name ? `. Sản phẩm: ${it.product_name}` : ""}.{it.angle ? ` Góc nội dung: ${it.angle}.` : ""}</div>}
            {K.intro && <div className="xs muted mb8">{K.intro}</div>}
            {!talk && (
            <Field label={K.src} hint={K.srcHint}>
              <textarea className="textarea" rows={5} placeholder="Dán nội dung vào đây…" {...text("source_text")} />
            </Field>
            )}
            <div className={`dropzone mt12 ${over ? "over" : ""}`} style={{ minHeight: it.media.length ? 110 : 170 }}
              onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
              <Upload size={26} className="c-primary" />
              <div className="semi">Kéo thả ảnh và video vào đây hoặc bấm để chọn</div>
              <div className="xs muted">MP4, MOV, JPG, PNG. {K.media}</div>
              <input ref={input} type="file" multiple accept="video/*,image/*" style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </div>
            {ups.map((u) => <div key={u.key} className="mt8"><div className="xs muted">{u.name}</div><Bar value={u.p * 100} thin /></div>)}
            {it.media.length > 0 && (
              <div className="row mt12" style={{ gap: 10, flexWrap: "wrap" }}>
                {it.media.map((m: any, i: number) => (
                  <div key={m.id} className="inner" style={{ width: 112, padding: 6, position: "relative" }}>
                    {m.type === "image"
                      ? <img src={fileUrl(m.path)} alt="" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6 }} />
                      : <video src={fileUrl(m.path)} muted preload="metadata" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6 }} />}
                    <div className="xs ellipsis mt4" title={m.name}>{m.name}</div>
                    <div className="row between mt4">
                      {i === 0 ? <Badge tone="purple">Mở đầu</Badge>
                        : <button type="button" className="chip" style={{ padding: "2px 6px", fontSize: 10.5 }} disabled={rendering} onClick={() => api.post(`/news/${id}/media/${m.id}/first`, {}).then(q.reload).catch((e) => toastError(e))}>Đưa lên đầu</button>}
                      <button type="button" className="chip" title="Bỏ hình này" style={{ padding: "2px 6px" }} disabled={rendering} onClick={() => api.del(`/news/${id}/media/${m.id}`).then(q.reload).catch((e) => toastError(e))}><X size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={K.card2} icon={<Wand2 size={16} className="c-primary" />}
            right={kind !== "clips" && <Btn kind="primary" size="sm" icon={<Sparkles size={14} />} disabled={!canWrite || rendering} title={canWrite ? undefined : talk ? "Thả một clip có người nói trước" : "Dán nội dung vào mục 1 trước"} onClick={write}>{kind === "review" ? "AI đặt tiêu đề" : form.body ? "AI viết lại" : "AI viết lời"}</Btn>}>
            {kind !== "clips" && (
            <Field label={K.head} hint={K.headHint}>
              <textarea className="textarea" rows={classic ? 3 : 2} {...text("headline")} />
            </Field>
            )}
            {classic && (
            <Field label="Lời đọc mở đầu" hint="Giọng AI đọc đoạn này trong lúc tiêu đề hiện trên màn hình. Để trống thì đọc đúng tiêu đề.">
              <textarea className="textarea" rows={3} {...text("hook")} />
            </Field>
            )}
            {!talk && (
            <Field label={K.body} hint={K.bodyHint}>
              <textarea className="textarea" rows={kind === "quote" ? 5 : 7} {...text("body")} />
            </Field>
            )}
            {sale && it.script_engine === "llm" && <div className="mb12"><Warn title="Đọc lại lời trước khi đăng">AI trên máy đôi khi tự thêm lời khen hoặc công dụng không có trong mô tả sản phẩm. Máy đã chặn con số lạ, nhưng câu chữ thì bạn cần tự soát: xoá mọi ý mà sản phẩm không thật sự có.</Warn></div>}
            {shop && (
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <Field label="Nền tảng đăng"><select className="select" value={it.platform} disabled={rendering} onChange={(e) => put({ platform: e.target.value })}>{Object.entries(platforms).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Giá (hiện ở màn chốt)"><input className="input" placeholder="Để trống thì không hiện" {...text("price")} /></Field>
                <Field label="Ưu đãi"><input className="input" {...text("offer")} /></Field>
              </div>
            )}
            {shop && <Field label="Câu kêu gọi cuối video" hint={`${sale ? "Giọng AI đọc và hiện chữ" : "Hiện chữ"} ở màn chốt. Để trống thì dùng: “${meta.data?.platform_cta?.[it.platform] || ""}”`}><input className="input" {...text("cta_text")} /></Field>}
            <Field label="Mô tả khi đăng" hint="Máy ghi mô tả, hashtag và link vào một file chữ nằm cạnh video để dán khi đăng.">
              <textarea className="textarea" rows={2} {...text("caption")} />
            </Field>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <Field label="Hashtag"><input className="input" placeholder="#meovat #giadung" {...text("hashtags")} /></Field>
              <Field label={shop ? "Link affiliate" : "Link kèm theo"}><input className="input" placeholder="https://" {...text("link")} /></Field>
            </div>
          </Card>

          <Card title={talk ? "3. Kiểu hiển thị" : "3. Kiểu hiển thị và giọng đọc"} right={<div className="row" style={{ gap: 6 }}>
            <select className="select" style={{ width: 190, padding: "4px 8px" }} value="" disabled={rendering} onChange={(e) => applyProfile(e.target.value)}>
              <option value="">Áp bộ kênh…</option>{(factory.data?.profiles || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <Btn size="sm" kind="ghost" onClick={() => { saveProfile(); return undefined; }}>Lưu thành bộ kênh</Btn></div>}>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {classic && <Field label="Chuyên mục"><input className="input" placeholder="TIN TỨC" {...text("category")} /></Field>}
              <Field label="Tên kênh"><input className="input" placeholder="Tên kênh của bạn" {...text("channel")} /></Field>
              {classic && <Field label="Ghi nguồn hình"><input className="input" placeholder="Video: tên người quay" {...text("credit")} /></Field>}
              {classic && <Field label="Ngày đăng"><input className="input" {...text("date_label")} /></Field>}
            </div>
            <Field label={classic ? "Màu vùng chữ" : "Màu chủ đạo"}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {Object.entries(themes).map(([k, t]: any) => (
                  <span key={k} className={`chip ${it.theme === k ? "on" : ""}`} onClick={() => !rendering && put({ theme: k })}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: `linear-gradient(${t.top}, ${t.bottom})` }} />{t.name}
                  </span>
                ))}
              </div>
            </Field>
            {classic && (
            <Field label="Kiểu mở đầu" hint="Vùng chữ màu: hình ở nửa trên, tiêu đề trên nền màu. Chữ trên hình: hình phủ kín màn hình, tiêu đề nổi trên nền tối.">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {Object.entries(styles).map(([k, label]) => <span key={k} className={`chip ${(it.style || "panel") === k ? "on" : ""}`} onClick={() => !rendering && put({ style: k })}>{label}</span>)}
              </div>
            </Field>
            )}
            {talk && (
              <Field label="Phụ đề và cắt gọn">
                <div className="col" style={{ gap: 8 }}>
                  {flag("subs", "Chạy phụ đề theo lời nói", "Chữ in hoa viền đen, mỗi lần vài từ, ở nửa dưới màn hình.")}
                  {flag("cut_silence", "Cắt bỏ khoảng lặng", "Chỗ ngừng nói lâu hơn nửa giây bị cắt để video gọn hơn.")}
                </div>
              </Field>
            )}
            {talk && (
              <Field label="Sửa từ máy nghe sai" hint="Mỗi dòng một cặp: từ sai => từ đúng. Áp vào phụ đề, tiêu đề clip và phần AI đọc lời. Hay dùng cho tên riêng, tên sản phẩm.">
                <textarea className="textarea" rows={3} placeholder={"Hoá => Hoà\nmáy game => máy ghi âm"} defaultValue={it.sub_fixes || ""} disabled={rendering} onBlur={(e) => { if (e.target.value !== (it.sub_fixes || "")) put({ sub_fixes: e.target.value }); }} />
              </Field>
            )}
            {kind === "clips" && (
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <Field label="Số clip muốn cắt"><div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{[2, 3, 5, 8, 10].map((n) => <span key={n} className={`chip ${it.clip_count === n ? "on" : ""}`} onClick={() => !rendering && put({ clip_count: n })}>{n} clip</span>)}</div></Field>
                <Field label="Độ dài mỗi clip"><div className="row" style={{ gap: 6 }}>{[30, 45, 60].map((n) => <span key={n} className={`chip ${it.clip_len === n ? "on" : ""}`} onClick={() => !rendering && put({ clip_len: n })}>khoảng {n} giây</span>)}</div></Field>
              </div>
            )}
            {kind === "quote" && <Field label="Giọng đọc">{flag("speak", "Giọng AI đọc từng dòng", "Tắt thì video chỉ có chữ và nhạc. Bật thì mỗi dòng hiện ra đúng lúc giọng đọc tới.")}</Field>}
            {(classic || kind === "story" || (kind === "quote" && it.speak)) && (
            <Field label={kind === "quote" ? "Chọn giọng" : "Giọng đọc"} hint={voices.length ? "Bấm loa để nghe thử." : "Máy này chưa cài bộ giọng nên đọc bằng giọng máy."}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className={`chip ${it.voice?.mode !== "preset" ? "on" : ""}`} onClick={() => !rendering && put({ voice: { mode: "os" } })}>Giọng máy</span>
                {voices.map((v) => (
                  <span key={v.name} className={`chip ${it.voice?.mode === "preset" && it.voice?.name === v.name ? "on" : ""}`} onClick={() => !rendering && put({ voice: { mode: "preset", name: v.name } })}>
                    {v.name}
                    <span title="Nghe thử" onClick={(e) => { e.stopPropagation(); listen(v.name); }} style={{ display: "inline-flex" }}>{playing === v.name ? <X size={13} /> : <Volume2 size={13} />}</span>
                  </span>
                ))}
              </div>
            </Field>
            )}
            {classic && (
            <Field label="Tiếng gốc của clip" hint={firstHasAudio ? "Mặc định tắt hẳn: cả video chỉ có giọng AI đọc. Chọn số giây nếu muốn giọng đọc dừng lại để người xem nghe tiếng thật trong clip rồi đọc tiếp." : "Video chỉ có giọng AI đọc. Hình mở đầu không có tiếng nên không có gì để phát."}>
              <div className="row" style={{ gap: 8 }}>
                {[0, 5, 8, 12].map((s) => <span key={s} className={`chip ${it.raw_gap_s === s ? "on" : ""}`} style={{ opacity: firstHasAudio || s === 0 ? 1 : 0.4 }} onClick={() => !rendering && put({ raw_gap_s: s })}>{s ? `Phát ${s} giây` : "Tắt hẳn"}</span>)}
              </div>
            </Field>
            )}
            {lk.data && (
              <Field label="Phong cách edit" hint={<>Màu phim và hiệu ứng khi đổi cảnh{talk ? ", cùng kiểu phụ đề và font" : ""}. Để “Theo mặc định” thì dùng lựa chọn ở mục <a href="/looks">Phong cách &amp; phụ đề</a>.</>}>
                <div className="grid" style={{ gridTemplateColumns: talk ? "repeat(auto-fit, minmax(170px, 1fr))" : "1fr", gap: 8 }}>
                  <select className="select" value={it.look || ""} disabled={rendering} onChange={(e) => put({ look: e.target.value })}>
                    <option value="">Theo mặc định ({lk.data.edit_styles[lk.data.default.edit]?.name})</option>
                    {Object.entries(lk.data.edit_styles).map(([k, v]: any) => <option key={k} value={k}>{v.name}</option>)}
                  </select>
                  {talk && <select className="select" value={it.cap_style || ""} disabled={rendering} onChange={(e) => put({ cap_style: e.target.value })}>
                    <option value="">Kiểu phụ đề theo phong cách</option>
                    {Object.entries(lk.data.caption_styles).map(([k, v]: any) => <option key={k} value={k}>{v.name}</option>)}
                  </select>}
                  {talk && <select className="select" value={it.font || ""} disabled={rendering} onChange={(e) => put({ font: e.target.value })}>
                    <option value="">Font theo kiểu phụ đề</option>
                    {Object.entries(lk.data.fonts).map(([k, v]: any) => <option key={k} value={k}>{v.name}</option>)}
                  </select>}
                </div>
                {talk && <img src={`${API}/looks/preview?${new URLSearchParams(Object.entries({ edit: it.look || lk.data.default.edit, caption: it.cap_style, font: it.font }).filter(([, v]) => v) as any).toString()}`} alt="" style={{ width: 120, aspectRatio: "9/16", objectFit: "cover", borderRadius: 8, marginTop: 8 }} />}
              </Field>
            )}
            <Field label="Nhạc nền" hint={music.length ? "Nhạc tự nhỏ lại dưới giọng đọc. Để tự động thì máy chọn bài hợp không khí của tin, mỗi biến thể một bài khác." : <>Chưa có bài nào trên máy. Vào <a href="/music">Thư viện nhạc</a> để tải.</>}>
              <select className="select" value={it.music || ""} disabled={rendering} onChange={(e) => put({ music: e.target.value || null })}>
                <option value="auto">Tự động chọn theo nội dung tin</option>
                <option value="">Không dùng nhạc</option>
                {music.map((m) => <option key={m.path} value={m.path}>{MOOD_VI[m.mood] || "Khác"}: {m.name}</option>)}
              </select>
              {it.music === "auto" && (
                <div className="row mt8" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className={`chip ${!it.music_mood ? "on" : ""}`} onClick={() => !rendering && put({ music_mood: null })}>Máy tự đoán{!it.music_mood && moods[it.auto_mood] ? `: ${moods[it.auto_mood]}` : ""}</span>
                  {Object.entries(moods).map(([k, label]) => <span key={k} className={`chip ${it.music_mood === k ? "on" : ""}`} onClick={() => !rendering && put({ music_mood: k })}>{label}</span>)}
                </div>
              )}
            </Field>
          </Card>
        </div>

        <div className="col" style={{ gap: 12, position: "sticky", top: 12 }}>
          <Card title={kind === "clips" ? "Cắt clip" : "Video"}>
            {it.output?.path && !rendering
              ? <video key={it.output.created_at || it.updated_at} src={`${fileUrl(it.output.path)}&v=${encodeURIComponent(it.output.created_at || it.updated_at)}`} controls playsInline style={{ width: "100%", borderRadius: 10, background: "#000", aspectRatio: "9/16" }} />
              : <div className="inner center col" style={{ aspectRatio: "9/16", justifyContent: "center", gap: 8, padding: 16 }}>
                  {rendering ? <><Loader2 size={26} className="spin c-primary" /><div className="small">{it.stage || "Đang dựng"}</div><Bar value={it.progress || 0} thin style={{ width: "80%" }} /></>
                    : <div className="xs muted">{kind === "clips" ? "Các clip cắt xong sẽ hiện ở phía dưới." : "Video sẽ hiện ở đây sau khi dựng."}</div>}
                </div>}
            {it.status === "failed" && it.error && <div className="mt8"><Warn title="Chưa dựng được">{it.error}</Warn></div>}
            {it.warning && !rendering && <div className="xs c-orange mt8">{it.warning}</div>}
            <div className="col mt12" style={{ gap: 8 }}>
              <Btn kind="primary" size="lg" icon={<Wand2 size={16} />} disabled={!canBuild || rendering} loading={rendering}
                title={canBuild ? undefined : K.need} onClick={kind === "clips" ? buildClips : build}>{kind === "clips" ? `Tìm đoạn hay và cắt ${it.clip_count} clip` : it.output ? "Dựng lại video" : "Dựng video"}</Btn>
              {it.output?.path && !rendering && (
                <div className="row" style={{ gap: 8 }}>
                  <a className="btn sm" href={fileUrl(it.output.path)} download>Tải về</a>
                  <Btn size="sm" kind="ghost" icon={<FolderOpen size={14} />} onClick={() => api.post("/system/open-folder", { path: it.output.path }).then(() => true).catch((e) => { toastError(e); return undefined; })}>Mở thư mục</Btn>
                </div>
              )}
            </div>
            {it.output && !it.output.layout && !rendering && kind !== "clips" && (
              <div className="xs muted mt8">
                Dài {Math.round(it.output.duration_ms / 1000)} giây.
                {it.output.cut_s ? ` Đã cắt bỏ ${it.output.cut_s} giây khoảng lặng.` : ""}{it.output.inserts ? ` Chèn ${it.output.inserts} lượt hình.` : ""}
                {it.output.scenes ? ` ${it.output.scenes} cảnh.` : ""}{it.output.lines ? ` ${it.output.lines} dòng chữ.` : ""}
                {it.output.music ? ` Nhạc: ${it.output.music.name} (${MOOD_VI[it.output.music.mood] || "khác"}).` : " Không có nhạc nền."}
              </div>
            )}
            {it.output?.layout && !rendering && (
              <div className="xs muted mt8">
                Dài {Math.round(it.output.duration_ms / 1000)} giây: mở đầu {it.output.layout.a_s}s
                {it.output.layout.raw_s ? `, tiếng gốc ${it.output.layout.raw_s}s` : ""}, thân bài {it.output.layout.b_s}s với {it.output.layout.shots} hình{it.output.layout.c_s ? `, màn chốt ${it.output.layout.c_s}s` : ""}.
                {it.output.music ? ` Nhạc: ${it.output.music.name} (${MOOD_VI[it.output.music.mood] || "khác"}).` : " Không có nhạc nền."}
                {it.output.headline_fit?.overflow ? " Tiêu đề dài quá nên bị cắt bớt, hãy rút gọn." : ""}
              </div>
            )}
            {it.output?.caption && !rendering && <div className="inner mt8" style={{ padding: 8 }}>
              <div className="row between"><span className="xs semi">Chữ để dán khi đăng</span><span className="chip" style={{ padding: "2px 8px" }} onClick={() => copy(it.output.caption)}>Chép</span></div>
              <div className="xs muted mt4" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{it.output.caption}</div></div>}
            {(dirty || it.output_stale) && !rendering && <div className="mt8"><Warn title="Video này đang đọc lời cũ">Bạn đã sửa lời sau khi dựng. Bấm “Dựng lại video” để giọng đọc theo lời mới.</Warn></div>}
          </Card>
          {kind !== "clips" && <Card title="Biến thể" icon={<Copy size={16} className="c-primary" />}>
            <div className="xs muted">{classic ? "Từ tin này dựng nhiều bản khác nhau về lời (tiêu đề, mở đầu, thân bài), màu, kiểu mở đầu, thứ tự và độ dài hình, nhịp đọc và nhạc. Bản 1 giữ đúng lựa chọn của bạn."
              : "Dựng nhiều bản khác nhau về màu, thứ tự hình và nhạc. Lời giữ nguyên ở mọi bản. Bản 1 giữ đúng lựa chọn của bạn."}</div>
            <div className="row mt8" style={{ gap: 6, flexWrap: "wrap" }}>
              {[2, 3, 4, 5, 6].map((n) => <span key={n} className={`chip ${count === n ? "on" : ""}`} onClick={() => setCount(n)}>{n} bản</span>)}
            </div>
            <label className="row xs mt8" style={{ gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={varyVoice} disabled={!voices.length || it.voice?.mode !== "preset"} onChange={(e) => setVaryVoice(e.target.checked)} />
              Mỗi bản một giọng đọc khác
            </label>
            <div className="mt8"><Btn icon={<Copy size={15} />} disabled={!canBuild || rendering} loading={rendering && variants.some((v) => v.status !== "done" && v.status !== "failed")}
              title={canBuild ? undefined : K.need} onClick={buildVariants}>Tạo {count} biến thể</Btn></div>
          </Card>}
          <InfoNote>Video có giọng AI: nhớ bật nhãn “nội dung AI” khi đăng. Chỉ dùng ảnh, video bạn có quyền sử dụng và ghi nguồn rõ ràng.</InfoNote>
        </div>
      </div>

      {variants.length > 0 && (
        <Card title={`${kind === "clips" ? "Các clip" : "Các biến thể"} (${variants.filter((v) => v.status === "done").length}/${variants.length} bản đã xong)`} className="mt16">
          {(dirty || it.variants_stale) && !rendering && kind !== "clips" && <div className="mb12"><Warn title="Các biến thể này đang đọc lời cũ">Chúng được tạo trước khi bạn sửa lời. Bấm “Tạo biến thể” lần nữa để máy viết lại theo lời mới.</Warn></div>}
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
            {variants.map((v) => (
              <div key={v.k} className="inner" style={{ padding: 8 }}>
                {v.status === "done" && v.output?.path
                  ? <video key={v.output.created_at} src={`${fileUrl(v.output.path)}&v=${encodeURIComponent(v.output.created_at || "")}`} poster={`${fileUrl(v.output.thumb)}&v=${encodeURIComponent(v.output.created_at || "")}`} controls playsInline preload="none" style={{ width: "100%", borderRadius: 8, background: "#000", aspectRatio: "9/16" }} />
                  : <div className="center col" style={{ aspectRatio: "9/16", justifyContent: "center", gap: 6 }}>
                      {v.status === "rendering" ? <><Loader2 size={22} className="spin c-primary" /><div className="xs">{it.stage || "Đang dựng"}</div></>
                        : v.status === "failed" ? <div className="xs c-orange" style={{ padding: 8 }}>{v.error || "Không dựng được bản này"}</div>
                        : <div className="xs muted">Đang chờ lượt</div>}
                    </div>}
                <div className="row between mt8"><span className="small semi">{kind === "clips" ? "Clip" : "Bản"} {v.k + 1}</span>
                  {v.status === "done" && v.output?.path && <span className="row" style={{ gap: 4 }}>{v.output.caption && <span className="chip" style={{ padding: "2px 8px" }} title={v.output.caption} onClick={() => copy(v.output.caption)}>Chép chữ</span>}
                    <a className="chip" style={{ padding: "2px 8px" }} href={fileUrl(v.output.path)} download>Tải về</a></span>}</div>
                <div className="xs mt4" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={v.headline}>{v.headline}</div>
                <div className="xs muted mt4">
                  {[themes[v.theme]?.name, styles[v.style], v.voice, v.rewritten ? "lời viết lại" : null, v.first_media ? (kind === "clips" ? `đoạn ${v.first_media}` : `mở bằng ${v.first_media}`) : null,
                    v.output?.music ? `nhạc ${v.output.music.name}` : v.status === "done" ? "không nhạc" : null].filter(Boolean).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
