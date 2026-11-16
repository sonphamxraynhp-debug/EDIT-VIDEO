import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, CheckCircle2, Info, Palette, Plus, Save, Search, ShieldCheck, ShoppingCart, Sparkles, Type, Upload, X, Zap,
} from "lucide-react";
import { api, fileUrl, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { Async, Badge, Btn, Card, Empty, Field, Modal, PageHead, Select, Tabs, Toggle } from "../components/ui";

const FONTS = ["Plus Jakarta Sans", "Be Vietnam Pro", "Inter", "Montserrat", "Roboto", "Nunito", "Playfair Display", "Lora", "Open Sans", "SF Pro Display"];
const TOKENS: Array<{ k: string; label: string }> = [
  { k: "primary", label: "Chủ đạo" },
  { k: "secondary", label: "Phụ" },
  { k: "accent", label: "Phụ 2" },
  { k: "dark", label: "Nền tối" },
  { k: "light", label: "Nền sáng" },
];
const RULES: Array<{ k: string; label: string }> = [
  { k: "keep_product_shape", label: "Giữ đúng hình dáng, màu sắc và bao bì sản phẩm" },
  { k: "no_misinformation", label: "Không chỉnh sửa gây sai lệch thông tin sản phẩm" },
  { k: "approved_footage_only", label: "Chỉ sử dụng hình ảnh/footage được cấp phép" },
];
const DEFAULT_KIT = {
  name: "Thương hiệu mới",
  primary: "#7B56FF",
  secondary: "#00D6C0",
  accent: "#4FD1FF",
  dark: "#1B2440",
  light: "#F6F7FB",
  font_title: "Plus Jakarta Sans",
  font_body: "Inter",
  tone: "",
  blocked: [] as string[],
  cta: ["Tìm hiểu thêm"],
  logo: null,
  watermark: false,
  outro: true,
  outro_text: "",
  caption: {},
};

const HEX = /^#[0-9a-fA-F]{6}$/;
function lum(hex: string) {
  if (!HEX.test(hex)) return 0;
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const textOn = (bg: string) => (contrast(bg, "#FFFFFF") >= contrast(bg, "#111111") ? "#FFFFFF" : "#111111");
function initials(name: string) {
  const w = (name || "?").replace(/thương hiệu/i, "").trim().split(/\s+/).filter(Boolean);
  return (w.length >= 2 ? w[0][0] + w[w.length - 1][0] : (w[0] || "?").slice(0, 2)).toUpperCase();
}

function Lockup({ kit, size = 46 }: { kit: any; size?: number }) {
  if (kit.logo) {
    return <img src={fileUrl(kit.logo)} alt={kit.name} style={{ width: size, height: size, borderRadius: size * 0.2, objectFit: "contain", flexShrink: 0, background: "rgba(255,255,255,.06)" }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.26, flexShrink: 0, display: "grid", placeItems: "center", background: `linear-gradient(135deg, ${kit.primary}, ${kit.secondary})`, color: textOn(kit.primary), fontWeight: 800, fontSize: size * 0.36, fontFamily: kit.font_title }}>
      {initials(kit.name)}
    </div>
  );
}

function ChipInput({ values, onChange, placeholder, tone }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; tone: "red" | "purple" }) {
  const [t, setT] = useState("");
  const add = () => {
    const v = t.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setT("");
  };
  return (
    <div>
      <div className="row wrap" style={{ gap: 6 }}>
        {values.map((v) => (
          <span key={v} className={`badge b-${tone}`}>
            {v}
            <X size={11} style={{ cursor: "pointer" }} onClick={() => onChange(values.filter((x) => x !== v))} />
          </span>
        ))}
        {values.length === 0 && <span className="xs muted">Chưa có mục nào.</span>}
      </div>
      <div className="row mt8">
        <input className="input" style={{ height: 32 }} value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <Btn size="sm" icon={<Plus size={13} />} disabled={!t.trim()} onClick={add}>Thêm</Btn>
      </div>
    </div>
  );
}

function checkKit(k: any) {
  const out: Array<{ ok: boolean; level: "error" | "warn" | "ok"; text: string }> = [];
  const badHex = TOKENS.filter((t) => !HEX.test(k[t.k] || ""));
  out.push(badHex.length ? { ok: false, level: "error", text: `Mã màu không hợp lệ: ${badHex.map((t) => t.label).join(", ")}` } : { ok: true, level: "ok", text: "Đủ 5 color token hợp lệ" });
  const c1 = contrast(k.primary, textOn(k.primary));
  out.push({ ok: c1 >= 4.5, level: c1 >= 4.5 ? "ok" : c1 >= 3 ? "warn" : "error", text: `Tương phản chữ trên màu chủ đạo (nút CTA): ${c1.toFixed(1)}:1 ${c1 >= 4.5 ? "– đạt WCAG AA" : "– khuyến nghị ≥ 4.5:1"}` });
  const c2 = contrast(k.light, k.dark);
  out.push({ ok: c2 >= 7, level: c2 >= 4.5 ? "ok" : "warn", text: `Tương phản nền sáng / nền tối: ${c2.toFixed(1)}:1` });
  const cap = k.caption || {};
  if (cap.color) {
    const c3 = contrast(cap.color, k.dark);
    out.push({ ok: c3 >= 4.5, level: c3 >= 4.5 ? "ok" : "warn", text: `Màu phụ đề trên nền tối: ${c3.toFixed(1)}:1` });
  }
  out.push(k.font_title && k.font_body ? { ok: true, level: "ok", text: `Font: ${k.font_title} / ${k.font_body}` } : { ok: false, level: "warn", text: "Thiếu font tiêu đề hoặc nội dung" });
  out.push((k.tone || "").trim().length >= 10 ? { ok: true, level: "ok", text: "Đã mô tả tone-of-voice" } : { ok: false, level: "warn", text: "Tone-of-voice còn trống hoặc quá ngắn" });
  out.push((k.cta || []).length ? { ok: true, level: "ok", text: `${k.cta.length} câu CTA được phép` } : { ok: false, level: "warn", text: "Chưa có câu CTA nào" });
  const ctaHit = (k.cta || []).filter((c: string) => (k.blocked || []).some((b: string) => c.toLowerCase().includes(b.toLowerCase())));
  if (ctaHit.length) out.push({ ok: false, level: "error", text: `CTA chứa cụm từ bị cấm: ${ctaHit.join(", ")}` });
  out.push(k.logo ? { ok: true, level: "ok", text: "Đã có logo" } : { ok: false, level: "warn", text: "Chưa có file logo — đang dùng chữ viết tắt" });
  return out;
}

export default function BrandKit() {
  const { projectId, product, toast, toastError } = useApp();
  const q = useApi<{ kits: any[]; active: string }>("/brands");
  const scenes = useApi<any[]>(projectId ? "/scenes" : null, projectId ? { project_id: projectId } : undefined);
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("overview");
  const [checkOpen, setCheckOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const kits = q.data?.kits || [];
  const active = q.data?.active;
  const sel = kits.find((k) => k.id === selId) || kits.find((k) => k.id === active) || kits[0];

  useEffect(() => {
    if (sel && (!draft || draft.id !== sel.id || !dirty)) {
      setDraft(JSON.parse(JSON.stringify({ ...DEFAULT_KIT, ...sel })));
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id, q.data]);

  const set = (k: string, v: unknown) => {
    setDraft((d: any) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const setCap = (k: string, v: unknown) => set("caption", { ...(draft?.caption || {}), [k]: v });
  const setRule = (k: string, v: boolean) => set("rules", { ...(draft?.rules || {}), [k]: v });

  const keyframe = useMemo(() => (scenes.data || []).find((s) => s.keyframe)?.keyframe as string | undefined, [scenes.data]);
  const filtered = kits.filter((k) => !search.trim() || `${k.name} ${k.tone || ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  function pick(id: string) {
    if (dirty && !window.confirm("Bộ nhận diện đang có thay đổi chưa lưu. Bỏ thay đổi?")) return;
    setDirty(false);
    setDraft(null);
    setSelId(id);
  }

  async function save() {
    if (!draft) return;
    const bad = TOKENS.filter((t) => !HEX.test(draft[t.k] || ""));
    if (bad.length) {
      toast({ kind: "error", title: "Mã màu không hợp lệ", body: bad.map((t) => t.label).join(", "), code: "BRAND_COLOR", hint: "Dùng định dạng #RRGGBB." });
      return;
    }
    try {
      const r = await api.put("/brands", draft);
      q.setData(r);
      setDirty(false);
      toast({ kind: "success", title: `Đã lưu “${draft.name}”`, body: r.active === draft.id ? "Brand Kit đang hoạt động — áp dụng cho các lần render tiếp theo." : undefined });
      return true;
    } catch (e) {
      toastError(e, "Không lưu được bộ nhận diện");
    }
  }

  async function uploadLogo(file: File) {
    if (!draft?.id) {
      toast({ kind: "error", title: "Hãy lưu Brand Kit trước khi tải logo", code: "BRAND_UNSAVED" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post(`/brands/${draft.id}/logo`, fd);
      setDraft((d: any) => (d && d.id === draft.id ? { ...d, logo: r.logo } : d));
      q.reload();
      toast({ kind: "success", title: "Đã tải logo", body: "Logo hiện ở góc trên-trái video khi render." });
    } catch (e) {
      toastError(e, "Không tải được logo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function create() {
    if (dirty && !window.confirm("Bộ nhận diện đang có thay đổi chưa lưu. Bỏ thay đổi?")) return;
    try {
      const before = new Set(kits.map((k) => k.id));
      const base = sel ? { ...sel, id: undefined, name: `${sel.name} (bản sao)` } : DEFAULT_KIT;
      const { id: _drop, ...body } = base as any;
      const r = await api.put("/brands", { ...body, name: kits.length ? body.name : DEFAULT_KIT.name });
      q.setData(r);
      const fresh = r.kits.find((k: any) => !before.has(k.id));
      setDirty(false);
      setDraft(null);
      if (fresh) setSelId(fresh.id);
      toast({ kind: "success", title: "Đã tạo Brand Kit mới", body: "Sao chép từ bộ đang chọn — chỉnh sửa và lưu ở bảng bên phải." });
      return true;
    } catch (e) {
      toastError(e, "Không tạo được Brand Kit");
    }
  }

  async function activate() {
    if (!draft?.id) return;
    try {
      if (dirty) await api.put("/brands", draft);
      const r = await api.post(`/brands/${draft.id}/activate`);
      q.setData(r);
      setDirty(false);
      toast({ kind: "success", title: `“${draft.name}” đang hoạt động`, body: "Màu nhấn và phụ đề sẽ áp dụng cho mọi video render từ giờ." });
      return true;
    } catch (e) {
      toastError(e, "Không kích hoạt được");
    }
  }

  const k = draft;
  return (
    <>
      <PageHead title="Hệ thống nhận diện thương hiệu" sub="Quản lý và áp dụng bộ nhận diện thương hiệu cho dự án, mẫu video và toàn bộ nội dung sản xuất." />
      <Async q={q} empty={(d) => d.kits.length === 0 && <Empty title="Chưa có Brand Kit" action={<Btn kind="primary" icon={<Plus size={15} />} onClick={create}>Tạo Brand Kit mới</Btn>} />}>
        {() =>
          !k ? null : (
            <>
              <div className="grid" style={{ gridTemplateColumns: "230px minmax(0,1fr) 340px", alignItems: "start" }}>
                {/* Danh sách */}
                <Card title="Danh sách Brand Kit" right={<button className="btn sm icon primary" title="Tạo Brand Kit mới" onClick={create}><Plus size={14} /></button>}>
                  <div className="search" style={{ margin: 0, maxWidth: "none", height: 32 }}>
                    <Search size={14} />
                    <input placeholder="Tìm thương hiệu…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <div className="col mt12" style={{ gap: 8 }}>
                    {filtered.map((x) => (
                      <div key={x.id} className={`list-item ${x.id === k.id ? "on" : ""}`} onClick={() => x.id !== k.id && pick(x.id)}>
                        <Lockup kit={x.id === k.id ? k : x} size={34} />
                        <div className="grow">
                          <div className="semi small ellipsis">{x.id === k.id ? k.name : x.name}</div>
                          <div className="xs muted ellipsis">{(x.cta || [])[0] || "—"}</div>
                        </div>
                        {x.id === active && <CheckCircle2 size={16} className="c-teal" />}
                      </div>
                    ))}
                    {filtered.length === 0 && <div className="small muted">Không tìm thấy.</div>}
                    <Btn kind="ghost" icon={<Plus size={14} />} onClick={create}>Tạo Brand Kit mới</Btn>
                  </div>
                </Card>

                {/* Tổng quan */}
                <div className="card">
                  <div className="row" style={{ gap: 14 }}>
                    <Lockup kit={k} size={52} />
                    <div className="grow">
                      <div className="bold" style={{ fontSize: 19, fontFamily: k.font_title }}>{k.name}</div>
                      <div className="small muted">Mã: {k.id} · {(k.cta || []).length} CTA · {(k.blocked || []).length} cụm từ cấm</div>
                    </div>
                    {k.id === active ? <Badge tone="teal" icon={<CheckCircle2 size={12} />}>Đang hoạt động</Badge> : <Badge tone="gray">Chưa kích hoạt</Badge>}
                    {dirty && <Badge tone="orange">Chưa lưu</Badge>}
                  </div>
                  <div className="mt12">
                    <Tabs tabs={[{ id: "overview", label: "Tổng quan" }, { id: "guide", label: "Hướng dẫn sử dụng" }]} value={tab} onChange={setTab} />
                  </div>
                  {tab === "overview" ? <Overview k={k} keyframe={keyframe} productName={product?.name} /> : <Guide k={k} />}
                </div>

                {/* Thiết lập */}
                <Card title="Thiết lập bộ nhận diện" icon={<Palette size={16} className="c-primary" />}>
                  <div className="col" style={{ gap: 14 }}>
                    <Field label="Tên thương hiệu"><input className="input" value={k.name} onChange={(e) => set("name", e.target.value)} /></Field>
                    <div>
                      <div className="label mb8">Logo thương hiệu</div>
                      <div className="row inner" style={{ padding: 10 }}>
                        <Lockup kit={k} size={40} />
                        <div className="grow xs muted ellipsis">{k.logo ? String(k.logo).split(/[\\/]/).pop() : "Đang dùng chữ viết tắt tự sinh từ tên"}</div>
                        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
                        <Btn size="sm" icon={<Upload size={13} />} disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Đang tải…" : "Tải logo"}</Btn>
                      </div>
                    </div>
                    <div>
                      <div className="label mb8">Bảng màu (Color Tokens)</div>
                      <div className="grid g5" style={{ gap: 6 }}>
                        {TOKENS.map((t) => (
                          <label key={t.k} className="col center" style={{ gap: 4, cursor: "pointer" }}>
                            <span style={{ position: "relative", height: 34, borderRadius: 8, background: k[t.k], border: "1px solid var(--border-2)", display: "block" }}>
                              <input type="color" value={HEX.test(k[t.k]) ? k[t.k] : "#000000"} onChange={(e) => set(t.k, e.target.value.toUpperCase())} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
                            </span>
                            <span className="xs t2">{t.label}</span>
                            <input className="input mono" style={{ height: 24, fontSize: 10, padding: "0 4px", textAlign: "center" }} value={k[t.k] || ""} onChange={(e) => set(t.k, e.target.value)} />
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="grid g2" style={{ gap: 8 }}>
                      <Field label="Font tiêu đề"><Select value={k.font_title} onChange={(v) => set("font_title", v)} options={Array.from(new Set([k.font_title, ...FONTS])).filter(Boolean)} /></Field>
                      <Field label="Font nội dung"><Select value={k.font_body} onChange={(v) => set("font_body", v)} options={Array.from(new Set([k.font_body, ...FONTS])).filter(Boolean)} /></Field>
                    </div>
                    <Field label="Tone-of-Voice (Giọng điệu thương hiệu)" hint={`${(k.tone || "").length} / 500`}>
                      <textarea className="textarea" rows={3} maxLength={500} value={k.tone || ""} onChange={(e) => set("tone", e.target.value)} />
                    </Field>
                    <div>
                      <div className="label mb8">Câu CTA được phép</div>
                      <ChipInput values={k.cta || []} onChange={(v) => set("cta", v)} placeholder="VD: Xem thông tin sản phẩm" tone="purple" />
                    </div>
                    <div>
                      <div className="label mb8">Từ ngữ / nội dung bị cấm</div>
                      <ChipInput values={k.blocked || []} onChange={(v) => set("blocked", v)} placeholder="VD: cam kết hiệu quả tuyệt đối" tone="red" />
                    </div>
                    <div>
                      <div className="label mb8">Phụ đề thương hiệu</div>
                      <div className="grid g2" style={{ gap: 8 }}>
                        <Select value={k.caption?.preset || ""} onChange={(v) => setCap("preset", v || undefined)} options={[{ value: "", label: "Theo template" }, "kinetic", "minimal", "bold", "highlight", "cinematic", "educational"]} />
                        <input className="input" type="number" min={24} max={96} placeholder="Cỡ chữ (px)" value={k.caption?.font_size || ""} onChange={(e) => setCap("font_size", e.target.value ? Number(e.target.value) : undefined)} />
                      </div>
                      <div className="row mt8 small" style={{ gap: 12 }}>
                        <label className="row" style={{ gap: 6 }}>Chữ <input type="color" value={k.caption?.color || "#FFFFFF"} onChange={(e) => setCap("color", e.target.value)} style={{ width: 32, height: 24, border: 0, background: "none" }} /></label>
                        <label className="row" style={{ gap: 6 }}>Nhấn <input type="color" value={k.caption?.highlight_color || k.secondary || "#FFD700"} onChange={(e) => setCap("highlight_color", e.target.value)} style={{ width: 32, height: 24, border: 0, background: "none" }} /></label>
                        <label className="row" style={{ gap: 6 }}><input type="checkbox" className="check" checked={!!k.caption?.box} onChange={(e) => setCap("box", e.target.checked)} /> Nền chữ</label>
                      </div>
                    </div>
                    <div className="row between">
                      <div><div className="label">Watermark thương hiệu</div><div className="xs muted">Lưu trong kit; render hiện chưa chèn watermark</div></div>
                      <Toggle on={!!k.watermark} onChange={(v) => set("watermark", v)} />
                    </div>
                    <div className="row between">
                      <div><div className="label">Thẻ kết (outro) thương hiệu</div><div className="xs muted">Thẻ 1,8 giây cuối video: nền màu tối thương hiệu + logo + CTA</div></div>
                      <Toggle on={k.outro ?? true} onChange={(v) => set("outro", v)} />
                    </div>
                    {(k.outro ?? true) && (
                      <Field label="Chữ trên thẻ kết"><input className="input" value={k.outro_text ?? ""} placeholder={(k.cta || [])[0] || "Tìm hiểu thêm"} onChange={(e) => set("outro_text", e.target.value)} /></Field>
                    )}
                    <div>
                      <div className="label mb8">Quy tắc đảm bảo hình ảnh sản phẩm</div>
                      <div className="col" style={{ gap: 6 }}>
                        {RULES.map((r) => (
                          <label key={r.k} className="row small t2"><input type="checkbox" className="check" checked={k.rules?.[r.k] ?? true} onChange={(e) => setRule(r.k, e.target.checked)} /> {r.label}</label>
                        ))}
                      </div>
                      <div className="xs muted mt8">Quy tắc lưu trong bộ nhận diện làm hướng dẫn cho người duyệt; QC tự động chưa kiểm các mục này.</div>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="sticky-bottom" style={{ justifyContent: "flex-end" }}>
                {dirty && <span className="small c-orange" style={{ marginRight: "auto" }}>Có thay đổi chưa lưu</span>}
                <Btn icon={<ShieldCheck size={15} />} onClick={() => setCheckOpen(true)}>Kiểm tra nhất quán</Btn>
                <Btn icon={<Zap size={15} />} disabled={k.id === active && !dirty} title={k.id === active && !dirty ? "Brand Kit này đang hoạt động" : "Kích hoạt cho mọi lần render (lưu thay đổi trước nếu có)"} onClick={activate}>Áp dụng cho dự án</Btn>
                <Btn kind="primary" icon={<Save size={15} />} disabled={!dirty} title={!dirty ? "Chưa có thay đổi" : undefined} onClick={save}>Lưu bộ nhận diện</Btn>
              </div>

              <Modal open={checkOpen} onClose={() => setCheckOpen(false)} title={`Kiểm tra nhất quán · ${k.name}`}>
                <div className="col" style={{ gap: 8 }}>
                  {checkKit(k).map((c, i) => (
                    <div key={i} className="row small">
                      {c.level === "ok" ? <CheckCircle2 size={15} className="c-teal" /> : c.level === "warn" ? <Info size={15} className="c-orange" /> : <X size={15} className="c-red" />}
                      <span className={c.level === "error" ? "c-red" : "t2"}>{c.text}</span>
                    </div>
                  ))}
                </div>
                <div className="xs muted mt12">Kiểm tra cục bộ trên dữ liệu Brand Kit (định dạng màu, độ tương phản WCAG, font, tone, CTA, cụm từ cấm).</div>
              </Modal>
            </>
          )
        }
      </Async>
    </>
  );
}

function Overview({ k, keyframe, productName }: { k: any; keyframe?: string; productName?: string }) {
  const name = productName || k.name;
  const cta = (k.cta || [])[0] || "Tìm hiểu thêm";
  const cap = k.caption || {};
  const capColor = cap.color || "#FFFFFF";
  const hl = cap.highlight_color || k.secondary;
  const bgImg = keyframe ? `url("${fileUrl(keyframe)}")` : undefined;
  const phone = (branded: boolean) => (
    <div className="media" style={{ aspectRatio: "9/12", backgroundImage: bgImg ? `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.55)), ${bgImg}` : `linear-gradient(160deg, #2a3463, #0b1130)`, backgroundSize: "cover", backgroundPosition: "center" }}>
      {branded && (
        <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Lockup kit={k} size={22} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: k.font_title }}>{k.name}</span>
        </div>
      )}
      <div style={{ position: "absolute", left: 10, right: 10, bottom: 12, textAlign: "center" }}>
        <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 6, fontWeight: 800, fontSize: 12, color: branded ? capColor : "#fff", background: branded && cap.box ? k.dark : "transparent", fontFamily: branded ? k.font_title : undefined, textShadow: "0 1px 3px rgba(0,0,0,.7)" }}>
          {name} <span style={{ color: branded ? hl : "#FFD700" }}>{cta}</span>
        </span>
        {branded && <div style={{ marginTop: 6 }}><span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999, background: k.primary, color: textOn(k.primary), fontSize: 10, fontWeight: 700 }}>{cta}</span></div>}
      </div>
    </div>
  );
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="grid" style={{ gridTemplateColumns: "1.1fr 1.4fr 1fr", gap: 12 }}>
        <div className="inner">
          <div className="semi small mb8">Logo (Lockup)</div>
          <div style={{ height: 110, borderRadius: 10, background: k.light, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Lockup kit={k} size={46} />
            <div style={{ color: k.dark, fontWeight: 800, fontFamily: k.font_title, letterSpacing: 0.5 }}>{k.name}</div>
          </div>
        </div>
        <div className="inner">
          <div className="semi small mb8">Bảng màu thương hiệu</div>
          <div className="grid g5" style={{ gap: 6 }}>
            {TOKENS.map((t) => (
              <div key={t.k} className="center">
                <div style={{ height: 54, borderRadius: 9, background: k[t.k], border: "1px solid var(--border-2)" }} />
                <div className="xs t2 mt8">{t.label}</div>
                <div className="xs muted mono" style={{ fontSize: 9.5 }}>{k[t.k]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="inner">
          <div className="semi small mb8">Typography</div>
          <div className="row" style={{ gap: 10 }}><span style={{ fontSize: 30, fontWeight: 700, fontFamily: k.font_title }}>Aa</span><div><div className="small semi">{k.font_title}</div><div className="xs muted">Tiêu đề, nhấn mạnh</div></div></div>
          <div className="row mt8" style={{ gap: 10 }}><span style={{ fontSize: 30, fontFamily: k.font_body }}>Aa</span><div><div className="small semi">{k.font_body}</div><div className="xs muted">Nội dung, mô tả</div></div></div>
        </div>
      </div>
      <div className="grid g3" style={{ gap: 12 }}>
        <div className="inner">
          <div className="semi small mb8">Lower Third (Thanh tiêu đề)</div>
          <div style={{ height: 90, borderRadius: 10, background: `linear-gradient(135deg, ${k.dark}, #0b1130)`, display: "flex", alignItems: "center", padding: 12 }}>
            <div style={{ display: "flex", alignItems: "stretch", boxShadow: "0 6px 16px rgba(0,0,0,.4)" }}>
              <div style={{ width: 6, background: k.secondary, borderRadius: "4px 0 0 4px" }} />
              <div style={{ background: k.primary, color: textOn(k.primary), padding: "6px 14px", clipPath: "polygon(0 0, 100% 0, 92% 100%, 0 100%)" }}>
                <div style={{ fontWeight: 800, fontFamily: k.font_title, fontSize: 14 }}>{name}</div>
                <div style={{ fontSize: 10, fontFamily: k.font_body, opacity: 0.9 }}>{k.name}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="inner">
          <div className="semi small mb8">Outro (Kết thúc video)</div>
          <div style={{ height: 90, borderRadius: 10, background: `linear-gradient(135deg, ${k.primary}, ${k.accent})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Lockup kit={{ ...k, primary: k.light, secondary: k.light }} size={30} />
            <span style={{ fontSize: 10, padding: "2px 10px", borderRadius: 999, background: k.dark, color: k.light, fontFamily: k.font_body }}>{k.outro_text || cta}</span>
          </div>
        </div>
        <div className="inner">
          <div className="semi small mb8">CTA (Kêu gọi hành động)</div>
          <div className="col" style={{ gap: 8, alignItems: "center", justifyContent: "center", height: 90 }}>
            {(k.cta || []).length === 0 && <span className="xs muted">Chưa có CTA</span>}
            {(k.cta || []).slice(0, 2).map((c: string, i: number) => (
              <span key={c} className="row" style={{ gap: 6, padding: "7px 16px", borderRadius: 999, fontWeight: 700, fontSize: 12, fontFamily: k.font_body, background: i === 0 ? k.primary : "transparent", color: i === 0 ? textOn(k.primary) : k.light, border: `1.5px solid ${i === 0 ? k.primary : k.light}` }}>
                {i === 0 ? <ShoppingCart size={13} /> : null}{c}{i > 0 ? <ArrowRight size={13} /> : null}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="inner">
        <div className="row between mb8">
          <div className="semi small">Xem trước áp dụng vào video</div>
          <span className="xs muted">{keyframe ? "Ảnh nền: keyframe thật từ tư liệu dự án" : "Chưa có keyframe — nhập & phân tích video để xem trên cảnh thật"}</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr auto 1fr 1.2fr", gap: 12, alignItems: "center" }}>
          <div><Badge tone="gray">Trước khi áp dụng</Badge><div className="mt8" style={{ maxWidth: 170 }}>{phone(false)}</div></div>
          <ArrowRight size={18} className="muted" />
          <div><Badge tone="purple">Sau khi áp dụng {k.name}</Badge><div className="mt8" style={{ maxWidth: 170 }}>{phone(true)}</div></div>
          <div className="col small t2" style={{ gap: 7 }}>
            <div className="semi" style={{ color: "var(--text)" }}>Khi render với Brand Kit đang hoạt động</div>
            <span className="row" style={{ gap: 6 }}><CheckCircle2 size={13} className="c-teal" /> Màu nhấn lấy theo màu chủ đạo</span>
            <span className="row" style={{ gap: 6 }}><CheckCircle2 size={13} className="c-teal" /> Phụ đề theo thiết lập thương hiệu (ghi đè template)</span>
            <span className="row" style={{ gap: 6 }}><CheckCircle2 size={13} className="c-teal" /> Logo (góc trên-trái, trong vùng an toàn) và thẻ kết 1,8 giây (nền tối + logo + CTA) được chèn khi render</span>
            <span className="row" style={{ gap: 6 }}><Info size={13} className="c-orange" /> Watermark và lower third: chỉ xem trước — render chưa chèn</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Guide({ k }: { k: any }) {
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="inner">
        <div className="row semi small"><Sparkles size={14} className="c-primary" /> Tone-of-voice</div>
        <div className="small t2 mt8" style={{ whiteSpace: "pre-wrap", fontFamily: k.font_body }}>{k.tone || "Chưa mô tả giọng điệu thương hiệu."}</div>
      </div>
      <div className="grid g2" style={{ gap: 12 }}>
        <div className="inner">
          <div className="row semi small"><CheckCircle2 size={14} className="c-teal" /> CTA được phép</div>
          <ul className="small t2" style={{ margin: "8px 0 0", paddingLeft: 18 }}>{(k.cta || []).map((c: string) => <li key={c}>{c}</li>)}{!(k.cta || []).length && <li className="muted">Chưa có</li>}</ul>
        </div>
        <div className="inner">
          <div className="row semi small"><X size={14} className="c-red" /> Từ ngữ bị cấm</div>
          <ul className="small t2" style={{ margin: "8px 0 0", paddingLeft: 18 }}>{(k.blocked || []).map((c: string) => <li key={c}>{c}</li>)}{!(k.blocked || []).length && <li className="muted">Chưa có</li>}</ul>
          <div className="xs muted mt8">Lưu ý: kiểm tra claim kịch bản hiện dùng danh sách cụm từ cấm trong Product Brain, chưa dùng danh sách này.</div>
        </div>
      </div>
      <div className="inner">
        <div className="row semi small"><Type size={14} className="c-cyan" /> Quy tắc hình ảnh</div>
        <ul className="small t2" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {RULES.filter((r) => k.rules?.[r.k] ?? true).map((r) => <li key={r.k}>{r.label}</li>)}
        </ul>
      </div>
    </div>
  );
}
