/** Sản xuất hàng loạt: hàng đợi chạy nền, thư viện sản phẩm, nhập từ bảng tính, bộ kênh, sổ kết quả. */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, Factory, Pause, Play, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { API, api, fileUrl, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { dt } from "../lib/format";
import { Badge, Bar, Btn, Card, Empty, Field, InfoNote, Loading, PageHead, Tabs, Warn } from "../components/ui";

const JOB: Record<string, { label: string; tone: any }> = {
  waiting: { label: "Đang chờ", tone: "gray" },
  running: { label: "Đang chạy", tone: "purple" },
  done: { label: "Đã xong", tone: "teal" },
  failed: { label: "Lỗi", tone: "red" },
};
const VALUE_VI: Record<string, string> = { panel: "Vùng chữ màu", overlay: "Chữ trên hình", news: "Tin tức", sale: "Bán hàng", green: "Xanh lá", red: "Đỏ", orange: "Cam", navy: "Xanh navy", black: "Đen",
  dramatic: "Kịch tính", emotional: "Cảm động", inspirational: "Truyền cảm hứng", upbeat: "Vui tươi", calm: "Nhẹ nhàng", corporate: "Doanh nghiệp", funny: "Hài hước", mine: "Nhạc của tôi", none: "Không nhạc" };
const TABS = [{ id: "queue", label: "Hàng đợi" }, { id: "products", label: "Sản phẩm" }, { id: "import", label: "Nhập từ bảng" }, { id: "profiles", label: "Bộ kênh" }, { id: "results", label: "Kết quả" }];

export default function Batch() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || "queue";
  const q = useApi<any>("/factory", undefined, 3000);
  const meta = useApi<any>("/news");
  if (!q.data || !meta.data) return <Loading rows={5} h={22} />;
  const d = q.data;
  const waiting = d.queue.jobs.filter((j: any) => j.status === "waiting" || j.status === "running").length;
  return (
    <div>
      <PageHead icon={<Factory size={22} />} title="Sản xuất hàng loạt" sub="Lưu sản phẩm một lần, nhập cả bảng, để máy dựng lần lượt, rồi ghi lại video nào ra đơn." />
      <Tabs pill value={tab} onChange={(v) => setSp({ tab: v }, { replace: true })}
        tabs={TABS.map((t) => ({ ...t, label: t.id === "queue" && waiting ? `${t.label} (${waiting})` : t.id === "products" && d.products.length ? `${t.label} (${d.products.length})` : t.label }))} />
      <div className="mt16">
        {tab === "queue" && <Queue d={d} reload={q.reload} />}
        {tab === "products" && <Products d={d} reload={q.reload} />}
        {tab === "import" && <Import d={d} reload={q.reload} goQueue={() => setSp({ tab: "queue" })} />}
        {tab === "profiles" && <Profiles d={d} meta={meta.data} reload={q.reload} />}
        {tab === "results" && <Results />}
      </div>
    </div>
  );
}

function Queue({ d, reload }: { d: any; reload: () => void }) {
  const nav = useNavigate();
  const { toastError } = useApp();
  const jobs: any[] = d.queue.jobs;
  const act = (a: string) => api.post(`/factory/queue/${a}`, {}).then(() => { reload(); return true; }).catch((e) => { toastError(e); return undefined; });
  const done = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  return (
    <Card title={`Hàng đợi: ${done}/${jobs.length} việc đã xong${failed ? `, ${failed} lỗi` : ""}`}
      right={<div className="row" style={{ gap: 8 }}>
        {d.queue.paused ? <Btn size="sm" kind="primary" icon={<Play size={14} />} onClick={() => act("resume")}>Chạy tiếp</Btn>
          : <Btn size="sm" icon={<Pause size={14} />} onClick={() => act("pause")}>Tạm dừng</Btn>}
        {failed > 0 && <Btn size="sm" icon={<RotateCcw size={14} />} onClick={() => act("retry")}>Chạy lại việc lỗi</Btn>}
        {done + failed > 0 && <Btn size="sm" kind="ghost" onClick={() => act("clear")}>Dọn việc đã xong</Btn>}
      </div>}>
      {d.queue.paused && <div className="mb12"><Warn title="Hàng đợi đang tạm dừng">Việc đang chạy dở vẫn chạy cho xong; các việc sau chờ tới khi bấm Chạy tiếp.</Warn></div>}
      {!jobs.length ? <Empty title="Hàng đợi đang trống">Tạo video từ mục Sản phẩm hoặc Nhập từ bảng, máy sẽ xếp vào đây và dựng lần lượt. Có thể tắt màn hình này, máy vẫn chạy.</Empty> : (
        <div className="col" style={{ gap: 6 }}>
          {jobs.map((j) => (
            <div key={j.id} className="inner row between list-item" style={{ gap: 10, padding: "8px 10px" }} onClick={() => nav(`/news?id=${j.nid}`)}>
              <div style={{ minWidth: 0 }}>
                <div className="small semi ellipsis">{j.title}</div>
                <div className="xs muted ellipsis">{j.variants > 1 ? `${j.variants} biến thể` : "1 video"} · xếp lúc {dt(j.created_at)}{j.error ? ` · ${j.error}` : ""}</div>
              </div>
              <div className="row" style={{ gap: 8, flexShrink: 0 }}>
                <Badge tone={JOB[j.status]?.tone}>{JOB[j.status]?.label}</Badge>
                {j.status !== "running" && <button type="button" className="chip" title="Bỏ việc này" onClick={(e) => { e.stopPropagation(); api.del(`/factory/queue/${j.id}`).then(reload).catch((er) => toastError(er)); }}><X size={12} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const EMPTY_PRODUCT = { name: "", description: "", points: "", price: "", offer: "", link: "", platform: "tiktok" };

function Products({ d, reload }: { d: any; reload: () => void }) {
  const { toast, toastError } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<any>(EMPTY_PRODUCT);
  const [count, setCount] = useState(1);
  const [variants, setVariants] = useState(3);
  const [profile, setProfile] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const cur = d.products.find((p: any) => p.id === open);
  useEffect(() => { setForm(cur ? Object.fromEntries(Object.keys(EMPTY_PRODUCT).map((k) => [k, cur[k] || ""])) : EMPTY_PRODUCT); }, [open]);
  const f = (k: string) => ({ value: form[k], onChange: (e: any) => setForm({ ...form, [k]: e.target.value }) });

  async function save() {
    try {
      const p = cur ? await api.put(`/factory/products/${cur.id}`, form) : await api.post("/factory/products", form);
      setOpen(p.id); reload(); toast({ kind: "success", title: "Đã lưu sản phẩm" }); return true;
    } catch (e) { toastError(e, "Không lưu được sản phẩm"); return undefined; }
  }
  async function upload(list: FileList | null) {
    for (const file of Array.from(list || [])) {
      const fd = new FormData(); fd.append("file", file);
      try { await api.post(`/factory/products/${cur.id}/media`, fd); } catch (e) { toastError(e, `Không nhận được ${file.name}`); }
      reload();
    }
  }
  async function make() {
    try {
      const r = await api.post(`/factory/products/${cur.id}/videos`, { count, variants, profile_id: profile || null });
      toast({ kind: "success", title: `Đã xếp ${r.items.length} video vào hàng đợi`, body: "Xem tiến độ ở tab Hàng đợi." }); reload(); return true;
    } catch (e) { toastError(e, "Chưa tạo được video"); return undefined; }
  }
  async function remove(p: any) {
    if (!window.confirm(`Xoá sản phẩm “${p.name}” cùng hình của nó?`)) return;
    try { await api.del(`/factory/products/${p.id}`); if (open === p.id) setOpen(null); reload(); } catch (e) { toastError(e, "Không xoá được"); }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "300px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
      <Card title="Sản phẩm đã lưu" right={<Btn size="sm" icon={<Plus size={14} />} onClick={() => setOpen(null)}>Thêm</Btn>}>
        {!d.products.length ? <div className="xs muted">Chưa có sản phẩm nào. Điền thông tin bên phải rồi bấm Lưu.</div> : (
          <div className="col" style={{ gap: 6 }}>
            {d.products.map((p: any) => (
              <div key={p.id} className={`inner row between list-item ${open === p.id ? "on" : ""}`} style={{ gap: 8, padding: "8px 10px", outline: open === p.id ? "1px solid var(--primary, #7c5cff)" : undefined }} onClick={() => setOpen(p.id)}>
                <div style={{ minWidth: 0 }}><div className="small semi ellipsis">{p.name}</div><div className="xs muted">{p.media.length} hình{p.price ? ` · ${p.price}` : ""}</div></div>
                <button type="button" className="chip" title="Xoá sản phẩm" onClick={(e) => { e.stopPropagation(); remove(p); }}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="col" style={{ gap: 16 }}>
        <Card title={cur ? `Sửa: ${cur.name}` : "Sản phẩm mới"} right={<Btn kind="primary" size="sm" disabled={!form.name.trim()} onClick={save}>Lưu sản phẩm</Btn>}>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <Field label="Tên sản phẩm"><input className="input" {...f("name")} /></Field>
            <Field label="Giá" hint="Hiện ở màn chốt. Để trống thì không hiện."><input className="input" placeholder="199.000đ" {...f("price")} /></Field>
            <Field label="Ưu đãi"><input className="input" placeholder="Miễn phí vận chuyển" {...f("offer")} /></Field>
            <Field label="Nền tảng đăng"><select className="select" {...f("platform")}>{Object.entries(d.platforms).map(([k, v]: any) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <Field label="Mô tả sản phẩm" hint="AI chỉ được dùng thông tin ghi ở đây và ở ô Điểm nổi bật, nên hãy ghi đúng và đủ."><textarea className="textarea" rows={4} {...f("description")} /></Field>
          <Field label="Điểm nổi bật" hint="Mỗi dòng một điểm."><textarea className="textarea" rows={3} {...f("points")} /></Field>
          <Field label="Link affiliate" hint="Được ghi vào file chữ đi kèm mỗi video để dán khi đăng."><input className="input" placeholder="https://" {...f("link")} /></Field>
        </Card>
        {cur && (
          <Card title={`Hình của sản phẩm (${cur.media.length})`} right={<><Btn size="sm" icon={<Upload size={14} />} onClick={() => input.current?.click()}>Thêm ảnh, video</Btn>
            <input ref={input} type="file" multiple accept="video/*,image/*" style={{ display: "none" }} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} /></>}>
            {!cur.media.length ? <div className="xs muted">Thêm ít nhất một ảnh hoặc video thật của sản phẩm.</div> : (
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                {cur.media.map((m: any) => (
                  <div key={m.id} className="inner" style={{ width: 104, padding: 6 }}>
                    {m.type === "image" ? <img src={fileUrl(m.path)} alt="" style={{ width: "100%", height: 92, objectFit: "cover", borderRadius: 6 }} />
                      : <video src={fileUrl(m.path)} muted preload="metadata" style={{ width: "100%", height: 92, objectFit: "cover", borderRadius: 6 }} />}
                    <div className="row between mt4"><span className="xs ellipsis" title={m.name}>{m.name}</span>
                      <button type="button" className="chip" style={{ padding: "2px 6px" }} onClick={() => api.del(`/factory/products/${cur.id}/media/${m.id}`).then(reload).catch((e) => toastError(e))}><X size={12} /></button></div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
        {cur && (
          <Card title="Tạo video bán hàng từ sản phẩm này">
            <Field label="Số video khác góc nội dung" hint={count > 1 ? `Mỗi video một góc: ${d.angles.slice(0, count).join("; ")}.` : "Một video theo khuôn: vấn đề, giải pháp, điểm đáng chú ý, lời mời xem sản phẩm."}>
              <div className="row" style={{ gap: 6 }}>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={`chip ${count === n ? "on" : ""}`} onClick={() => setCount(n)}>{n} video</span>)}</div>
            </Field>
            <Field label="Số biến thể mỗi video" hint="Các biến thể khác nhau về lời, màu, kiểu mở đầu, thứ tự hình, nhịp đọc và nhạc.">
              <div className="row" style={{ gap: 6 }}>{[1, 2, 3, 4, 5, 6].map((n) => <span key={n} className={`chip ${variants === n ? "on" : ""}`} onClick={() => setVariants(n)}>{n} bản</span>)}</div>
            </Field>
            <Field label="Bộ kênh"><select className="select" value={profile} onChange={(e) => setProfile(e.target.value)}><option value="">Không dùng bộ kênh</option>{d.profiles.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Btn kind="primary" icon={<Play size={15} />} disabled={!cur.media.length} title={cur.media.length ? undefined : "Thêm hình cho sản phẩm trước"} onClick={make}>Xếp {count * variants} video vào hàng đợi</Btn>
          </Card>
        )}
      </div>
    </div>
  );
}

function Import({ d, reload, goQueue }: { d: any; reload: () => void; goQueue: () => void }) {
  const { toastError } = useApp();
  const [profile, setProfile] = useState("");
  const [variants, setVariants] = useState(3);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<any>(null);
  const input = useRef<HTMLInputElement>(null);
  async function send(file?: File) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file); fd.append("profile_id", profile); fd.append("variants", String(variants)); fd.append("enqueue_now", "true");
    setBusy(true);
    try { setReport(await api.post("/factory/import", fd)); reload(); } catch (e) { toastError(e, "Không nhập được bảng"); }
    setBusy(false);
  }
  return (
    <div className="col" style={{ gap: 16 }}>
      <Card title="Nhập cả lô từ bảng tính" right={<a className="btn sm" href={`${API}/factory/import/template`} download><Download size={14} /> Tải file mẫu</a>}>
        <div className="small">Mỗi dòng trong bảng là một sản phẩm (hoặc một tin). Máy đọc bảng, lấy hình từ thư mục ghi trong dòng đó, viết lời, rồi dựng lần lượt.</div>
        <div className="xs muted mt8">Các cột: <b>Tên</b> (bắt buộc), Mô tả, Điểm nổi bật (cách nhau bằng dấu chấm phẩy), Giá, Ưu đãi, Link, <b>Thư mục hình</b> (đường dẫn thư mục trên máy này chứa ảnh, video của dòng đó), Loại (bán hàng hoặc tin tức), Số bản, Nền tảng. Nhận file .csv và .xlsx.</div>
        <div className="grid mt12" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <Field label="Bộ kênh áp cho cả lô"><select className="select" value={profile} onChange={(e) => setProfile(e.target.value)}><option value="">Không dùng bộ kênh</option>{d.profiles.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Số biến thể khi dòng không ghi Số bản"><div className="row" style={{ gap: 6 }}>{[1, 2, 3, 4, 5, 6].map((n) => <span key={n} className={`chip ${variants === n ? "on" : ""}`} onClick={() => setVariants(n)}>{n}</span>)}</div></Field>
        </div>
        <div className="mt12"><Btn kind="primary" icon={<Upload size={15} />} loading={busy} onClick={() => { input.current?.click(); return undefined; }}>Chọn file bảng và nhập</Btn>
          <input ref={input} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }} /></div>
      </Card>
      {report && (
        <Card title={`Kết quả nhập: ${report.created.length} dòng đã tạo, ${report.errors.length} dòng lỗi`} right={report.created.length > 0 && <Btn size="sm" onClick={goQueue}>Xem hàng đợi</Btn>}>
          {report.errors.length > 0 && <Warn title="Các dòng chưa nhập được">{report.errors.map((e: any) => <div key={e.row}>Dòng {e.row}{e.name ? ` (${e.name})` : ""}: {e.error}</div>)}</Warn>}
          <div className="col mt8" style={{ gap: 4 }}>{report.created.map((c: any) => <div key={c.row} className="xs">Dòng {c.row}: {c.name} · {c.kind === "sale" ? "bán hàng" : "tin tức"} · {c.media} hình · {c.variants} bản</div>)}</div>
        </Card>
      )}
      <InfoNote>Máy chỉ đọc ảnh và video nằm trực tiếp trong thư mục bạn ghi, tối đa 12 file mỗi dòng và 200 dòng mỗi bảng. Hình được chép vào app nên sau đó dời thư mục gốc cũng không sao.</InfoNote>
    </div>
  );
}

function Profiles({ d, meta, reload }: { d: any; meta: any; reload: () => void }) {
  const { toast, toastError } = useApp();
  const blank = { name: "", channel: "", category: "", credit: "", theme: "green", style: "panel", voice: { mode: "os" }, music: "auto", music_mood: null, platform: "tiktok", cta_text: "" };
  const [form, setForm] = useState<any>(blank);
  const f = (k: string) => ({ value: form[k] || "", onChange: (e: any) => setForm({ ...form, [k]: e.target.value }) });
  async function save() {
    try { form.id ? await api.put(`/factory/profiles/${form.id}`, form) : await api.post("/factory/profiles", form); setForm(blank); reload(); toast({ kind: "success", title: "Đã lưu bộ kênh" }); return true; }
    catch (e) { toastError(e, "Không lưu được bộ kênh"); return undefined; }
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: "300px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
      <Card title="Bộ kênh đã lưu" right={<Btn size="sm" icon={<Plus size={14} />} onClick={() => setForm(blank)}>Thêm</Btn>}>
        {!d.profiles.length ? <div className="xs muted">Bộ kênh giữ tên kênh, màu, kiểu mở đầu, giọng, nhạc và nền tảng. Chạy nhiều kênh thì mỗi kênh lưu một bộ.</div> : (
          <div className="col" style={{ gap: 6 }}>
            {d.profiles.map((p: any) => (
              <div key={p.id} className="inner row between list-item" style={{ gap: 8, padding: "8px 10px" }} onClick={() => setForm(p)}>
                <div style={{ minWidth: 0 }}><div className="small semi ellipsis">{p.name}</div><div className="xs muted ellipsis">{[p.channel, meta.themes[p.theme]?.name, meta.styles[p.style], meta.platforms[p.platform]].filter(Boolean).join(" · ")}</div></div>
                <button type="button" className="chip" title="Xoá bộ kênh" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Xoá bộ kênh “${p.name}”?`)) api.del(`/factory/profiles/${p.id}`).then(reload).catch((er) => toastError(er)); }}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title={form.id ? `Sửa bộ kênh: ${form.name}` : "Bộ kênh mới"} right={<Btn kind="primary" size="sm" disabled={!String(form.name || "").trim()} onClick={save}>Lưu bộ kênh</Btn>}>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <Field label="Tên bộ kênh"><input className="input" placeholder="Kênh gia dụng" {...f("name")} /></Field>
          <Field label="Tên kênh hiện trên video"><input className="input" {...f("channel")} /></Field>
          <Field label="Chuyên mục"><input className="input" {...f("category")} /></Field>
          <Field label="Ghi nguồn hình"><input className="input" {...f("credit")} /></Field>
          <Field label="Nền tảng đăng"><select className="select" {...f("platform")}>{Object.entries(meta.platforms).map(([k, v]: any) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Giọng đọc"><select className="select" value={form.voice?.mode === "preset" ? form.voice.name : ""} onChange={(e) => setForm({ ...form, voice: e.target.value ? { mode: "preset", name: e.target.value } : { mode: "os" } })}>
            <option value="">Giọng máy</option>{meta.voices.map((v: any) => <option key={v.name} value={v.name}>{v.name}</option>)}</select></Field>
          <Field label="Nhạc nền"><select className="select" value={form.music === "auto" ? (form.music_mood || "auto") : ""} onChange={(e) => setForm({ ...form, music: e.target.value ? "auto" : null, music_mood: e.target.value && e.target.value !== "auto" ? e.target.value : null })}>
            <option value="auto">Tự động theo nội dung</option>{Object.entries(meta.moods).map(([k, v]: any) => <option key={k} value={k}>Luôn dùng nhóm {v}</option>)}<option value="">Không dùng nhạc</option></select></Field>
        </div>
        <Field label="Màu"><div className="row" style={{ gap: 8, flexWrap: "wrap" }}>{Object.entries(meta.themes).map(([k, t]: any) => <span key={k} className={`chip ${form.theme === k ? "on" : ""}`} onClick={() => setForm({ ...form, theme: k })}><span style={{ width: 14, height: 14, borderRadius: 4, background: `linear-gradient(${t.top}, ${t.bottom})` }} />{t.name}</span>)}</div></Field>
        <Field label="Kiểu mở đầu"><div className="row" style={{ gap: 8 }}>{Object.entries(meta.styles).map(([k, v]: any) => <span key={k} className={`chip ${form.style === k ? "on" : ""}`} onClick={() => setForm({ ...form, style: k })}>{v}</span>)}</div></Field>
        <Field label="Câu kêu gọi cuối video bán hàng" hint={`Để trống thì dùng câu mặc định của nền tảng: “${meta.platform_cta[form.platform] || ""}”`}><input className="input" {...f("cta_text")} /></Field>
      </Card>
    </div>
  );
}

function Results() {
  const { toastError } = useApp();
  const q = useApi<any>("/news-results");
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (!q.data) return <Loading rows={5} h={22} />;
  const r = q.data;
  const key = (v: any, f: string) => `${v.nid}:${v.k ?? "m"}:${f}`;
  async function commit(v: any, f: string) {
    const val = draft[key(v, f)];
    if (val === undefined || val === String(v.stats[f] ?? "")) return;
    try { await api.put(`/news/${v.nid}/stats`, { k: v.k, [f]: val }); q.reload(); } catch (e) { toastError(e, "Không lưu được số liệu"); }
  }
  const num = (v: any, f: string) => <input className="input" inputMode="numeric" style={{ width: 86, padding: "4px 8px" }} placeholder="chưa nhập"
    value={draft[key(v, f)] ?? String(v.stats[f] ?? "")} onChange={(e) => setDraft({ ...draft, [key(v, f)]: e.target.value.replace(/\D/g, "") })} onBlur={() => commit(v, f)} />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <Card title={`Công thức nào đang hiệu quả (${r.with_stats}/${r.videos.length} video đã nhập số)`}>
        {!r.with_stats ? <div className="xs muted">Sau khi đăng, nhập lượt xem và số đơn của từng video ở bảng dưới. Máy sẽ gộp theo màu, kiểu mở đầu, giọng, nhạc để chỉ ra cái nào đang chạy tốt.</div> : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
            {Object.entries(r.labels).map(([dim, label]: any) => r.dims[dim].length > 0 && (
              <div key={dim} className="inner" style={{ padding: 10 }}>
                <div className="small semi mb8">{label}</div>
                {r.dims[dim].map((g: any, i: number) => (
                  <div key={g.value} className="mb8">
                    <div className="row between xs"><span className={i === 0 && g.videos >= r.min_videos ? "semi" : ""}>{VALUE_VI[g.value] || g.value}</span>
                      <span className="muted">{g.videos} video · {g.avg_views.toLocaleString("vi-VN")} xem/video · {g.orders_per_1000} đơn/1.000 xem</span></div>
                    <Bar thin value={r.dims[dim][0].avg_views ? (g.avg_views / Math.max(...r.dims[dim].map((x: any) => x.avg_views), 1)) * 100 : 0} />
                    {g.videos < r.min_videos && <div className="xs muted">Mới {g.videos} video, chưa đủ để kết luận.</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="xs muted mt8">Giá trị nào có từ {r.min_videos} video trở lên và dẫn đầu sẽ được ưu tiên lên trước khi máy tạo biến thể lần sau. Đây là thống kê gộp đơn giản, không tách được ảnh hưởng của từng yếu tố.</div>
      </Card>
      <Card title="Nhập kết quả từng video">
        {!r.videos.length ? <Empty title="Chưa có video nào">Dựng video ở mục Tin tức hoặc qua hàng đợi, rồi quay lại đây nhập số sau khi đăng.</Empty> : (
          <div className="col" style={{ gap: 6 }}>
            {r.videos.map((v: any) => (
              <div key={`${v.nid}:${v.k}`} className="inner row between" style={{ gap: 10, padding: "6px 10px" }}>
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  {v.thumb && <img src={fileUrl(v.thumb)} alt="" style={{ width: 27, height: 48, objectFit: "cover", borderRadius: 4 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div className="small ellipsis">{v.headline}{v.k !== null ? ` (bản ${v.k + 1})` : ""}</div>
                    <div className="xs muted ellipsis">{[VALUE_VI[v.formula.kind], VALUE_VI[v.formula.theme], VALUE_VI[v.formula.style], v.formula.voice, VALUE_VI[v.formula.mood] || v.formula.mood, dt(v.created_at)].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
                <div className="row xs" style={{ gap: 8, flexShrink: 0 }}>Lượt xem {num(v, "views")} Số đơn {num(v, "orders")}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
