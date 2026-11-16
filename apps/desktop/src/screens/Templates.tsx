import { ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Clapperboard, Clock, FlaskConical, HelpCircle, Image as ImageIcon,
  LayoutGrid, LayoutTemplate, Lightbulb, List, ListChecks, Package, Pencil, Play, Plus, Rocket, Scale, Search, Sparkles,
  Star, Type, Wand2, Palette, Film,
} from "lucide-react";
import { api, useApi } from "../lib/api";
import { dt } from "../lib/format";
import { useApp } from "../lib/store";
import { Async, Badge, Btn, Card, Empty, Field, InfoNote, Modal, PageHead, Select } from "../components/ui";

const CAT_ICON: Record<string, (s: number) => ReactNode> = {
  "Product Review": (s) => <Star size={s} />,
  Unboxing: (s) => <Package size={s} />,
  Tutorial: (s) => <BookOpen size={s} />,
  Demonstration: (s) => <FlaskConical size={s} />,
  FAQ: (s) => <HelpCircle size={s} />,
  Comparison: (s) => <Scale size={s} />,
  Story: (s) => <BookOpen size={s} />,
  Explainer: (s) => <Lightbulb size={s} />,
  Checklist: (s) => <ListChecks size={s} />,
  "Feature Spotlight": (s) => <Sparkles size={s} />,
  "Brand Film": (s) => <Clapperboard size={s} />,
  "Product Launch": (s) => <Rocket size={s} />,
};
const catIcon = (c: string, s = 16) => (CAT_ICON[c] || ((x: number) => <LayoutTemplate size={x} />))(s);

const MOTIONS: Record<string, string> = { zoom_in: "Zoom in", zoom_out: "Zoom out", pan_left: "Pan trái", pan_right: "Pan phải", none: "Tĩnh" };
const CAPTION_PRESETS = ["kinetic", "minimal", "educational", "bold", "chat", "highlight", "cinematic", "infographic", "list", "dynamic", "bold_launch"];
const PAGE_SIZE = 12;

function cap(s?: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—";
}

/** "30–45s" → [30, 45] */
function durRange(d?: string): [number, number] | null {
  const m = (d || "").match(/(\d+)\D+(\d+)/);
  if (m) return [Number(m[1]), Number(m[2])];
  const one = (d || "").match(/(\d+)/);
  return one ? [Number(one[1]), Number(one[1])] : null;
}

function Tile({ t, big, children }: { t: any; big?: boolean; children?: ReactNode }) {
  const tj = t.template_json || {};
  const accent = tj.accent || "#7B56FF";
  return (
    <div
      className="media"
      style={{
        aspectRatio: big ? "1/1" : "4/3",
        background: `radial-gradient(120% 90% at 20% 10%, ${accent}cc 0%, ${accent}55 38%, #0b1130 100%)`,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div style={{ width: big ? 64 : 54, height: big ? 64 : 54, borderRadius: 16, display: "grid", placeItems: "center", background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.3)", color: "#fff" }}>
        {catIcon(t.category, big ? 30 : 26)}
      </div>
      <div style={{ position: "absolute", left: 10, right: 10, bottom: 10, display: "flex", gap: 3 }}>
        {(tj.structure || []).map((s: string, i: number) => (
          <div key={i} title={s} style={{ flex: 1, height: 4, borderRadius: 3, background: i === 0 ? "#fff" : "rgba(255,255,255,.4)" }} />
        ))}
      </div>
      {children}
    </div>
  );
}

function statusBadge(t: any) {
  return t.status === "stable" ? <Badge tone="teal" icon={<CheckCircle2 size={11} />}>Ổn định</Badge> : <Badge tone="orange">Nháp</Badge>;
}

export default function Templates() {
  const nav = useNavigate();
  const { campaign, reloadProject, toast, toastError } = useApp();
  const q = useApi<any[]>("/templates");
  const brands = useApi<any>("/brands");
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState("");
  const [dur, setDur] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [selId, setSelId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  const list = q.data || [];
  const appliedId: string | undefined = campaign?.brief_json?.template_id;
  const cats = useMemo(() => {
    const m: Record<string, number> = {};
    list.forEach((t) => (m[t.category] = (m[t.category] || 0) + 1));
    return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [list]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let r = list.filter((t) => {
      const tj = t.template_json || {};
      if (cat !== "all" && t.category !== cat) return false;
      if (status !== "all" && t.status !== status) return false;
      if (s && !`${t.name} ${t.category} ${(tj.structure || []).join(" ")} ${tj.caption?.preset || ""}`.toLowerCase().includes(s)) return false;
      if (dur !== "all") {
        const rg = durRange(tj.duration);
        if (!rg) return false;
        if (dur === "short" && rg[0] > 20) return false;
        if (dur === "mid" && (rg[1] < 30 || rg[0] > 45)) return false;
        if (dur === "long" && rg[1] < 45) return false;
      }
      return true;
    });
    r = [...r].sort((a, b) =>
      sort === "version" ? b.version - a.version : sort === "new" ? String(b.created_at).localeCompare(String(a.created_at)) : sort === "applied" ? Number(b.id === appliedId) - Number(a.id === appliedId) : a.name.localeCompare(b.name, "vi"),
    );
    return r;
  }, [list, cat, status, search, dur, sort, appliedId]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => setPage(1), [cat, search, dur, status, sort]);
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const sel = list.find((t) => t.id === selId) || list.find((t) => t.id === appliedId) || filtered[0];

  async function apply(t: any) {
    if (!campaign) return;
    try {
      await api.post(`/campaigns/${campaign.id}/template`, { template_id: t.id });
      reloadProject();
      toast({ kind: "success", title: `Đã áp dụng “${t.name}”`, body: `Storyboard dựng mới của chiến dịch ${campaign.name} sẽ dùng template này.` });
      return true;
    } catch (e) {
      toastError(e, "Không áp dụng được template");
    }
  }

  const activeKit = brands.data?.kits?.find((k: any) => k.id === brands.data?.active);

  return (
    <>
      <PageHead
        title="Thư viện mẫu video"
        sub="Bộ template dựng video sẵn theo kịch bản, phân cảnh và phong cách sáng tạo"
        actions={
          <>
            <Btn icon={<Play size={15} />} onClick={() => nav("/creative/storyboard")}>Mở Storyboard AI</Btn>
            <Btn kind="primary" size="lg" icon={<Plus size={18} />} onClick={() => setEditing({})}>Tạo template mới</Btn>
          </>
        }
      />
      <Async q={q} empty={(d) => d.length === 0 && <Empty title="Chưa có template nào" action={<Btn kind="primary" icon={<Plus size={15} />} onClick={() => setEditing({})}>Tạo template đầu tiên</Btn>}>Template giúp chuẩn hoá cấu trúc, chuyển động và phụ đề cho nhiều video.</Empty>}>
        {() => (
          <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 340px", alignItems: "start" }}>
            <div className="col" style={{ gap: 14 }}>
              <div className="pill-tabs">
                <button className={`pill-tab ${cat === "all" ? "on" : ""}`} onClick={() => setCat("all")}>Tất cả ({list.length})</button>
                {cats.map(([c, n]) => (
                  <button key={c} className={`pill-tab ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>
                    <span className="row" style={{ gap: 6 }}>{catIcon(c, 14)}{c} <span className="xs" style={{ opacity: 0.7 }}>{n}</span></span>
                  </button>
                ))}
              </div>
              <div className="row wrap">
                <div className="search" style={{ margin: 0, maxWidth: 280, flex: 1 }}>
                  <Search size={15} />
                  <input placeholder="Tìm theo tên template, mô tả…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Select style={{ width: 170 }} value={dur} onChange={setDur} options={[{ value: "all", label: "Tất cả thời lượng" }, { value: "short", label: "Ngắn (≤ 20s)" }, { value: "mid", label: "30–45 giây" }, { value: "long", label: "Dài (≥ 45s)" }]} />
                <Select style={{ width: 150 }} value={status} onChange={setStatus} options={[{ value: "all", label: "Mọi trạng thái" }, { value: "stable", label: "Ổn định" }, { value: "draft", label: "Nháp" }]} />
                <Select style={{ width: 180 }} value={sort} onChange={setSort} options={[{ value: "name", label: "Sắp xếp: Tên A–Z" }, { value: "applied", label: "Sắp xếp: Đang áp dụng" }, { value: "version", label: "Sắp xếp: Phiên bản" }, { value: "new", label: "Sắp xếp: Mới tạo" }]} />
                <Badge tone="gray">9:16 (Dọc)</Badge>
                <div className="seg" style={{ marginLeft: "auto" }}>
                  <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")} title="Dạng lưới"><LayoutGrid size={14} /></button>
                  <button className={view === "list" ? "on" : ""} onClick={() => setView("list")} title="Dạng danh sách"><List size={14} /></button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <Empty title="Không có template khớp bộ lọc">Thử bỏ bớt bộ lọc hoặc đổi từ khoá.</Empty>
              ) : view === "grid" ? (
                <div className="grid g6" style={{ gap: 12 }}>
                  {shown.map((t) => {
                    const tj = t.template_json || {};
                    const on = sel?.id === t.id;
                    return (
                      <div key={t.id} className={`card ${on ? "glow" : ""}`} style={{ padding: 8, cursor: "pointer" }} onClick={() => setSelId(t.id)}>
                        <Tile t={t}>
                          <span className="tag-tl badge" style={{ background: tj.accent || "#7B56FF", color: "#fff" }}>{t.category}</span>
                          <button className="icon-btn" title="Chỉnh sửa template" style={{ position: "absolute", top: 4, right: 4, width: 28, height: 28, color: "#fff" }} onClick={(e) => { e.stopPropagation(); setEditing(t); }}>
                            <Pencil size={13} />
                          </button>
                          {t.id === appliedId && <span className="tag-br" style={{ background: "rgba(25,211,181,.85)", color: "#04241f" }}>Đang dùng</span>}
                        </Tile>
                        <div className="semi mt8" style={{ fontSize: 12.5, minHeight: 34, lineHeight: 1.35 }}>{t.name}</div>
                        <div className="col xs t2" style={{ gap: 3, marginTop: 6 }}>
                          <span className="row" style={{ gap: 5 }}><Clock size={11} /> {tj.duration || "—"}</span>
                          <span className="row" style={{ gap: 5 }}><Film size={11} /> Cần {tj.scenes || "—"} cảnh</span>
                          <span className="row" style={{ gap: 5 }}><Type size={11} /> Phụ đề: {cap(tj.caption?.preset)}</span>
                        </div>
                        <div className="row mt8 between">{statusBadge(t)}<span className="xs muted">v{t.version}</span></div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Template</th><th>Danh mục</th><th>Thời lượng</th><th>Số cảnh</th><th>Phụ đề</th><th>Phiên bản</th><th>Trạng thái</th><th /></tr></thead>
                    <tbody>
                      {shown.map((t) => {
                        const tj = t.template_json || {};
                        return (
                          <tr key={t.id} className={sel?.id === t.id ? "sel" : ""} style={{ cursor: "pointer" }} onClick={() => setSelId(t.id)}>
                            <td><div className="row"><div style={{ width: 30, height: 30, borderRadius: 8, background: tj.accent || "#7B56FF", display: "grid", placeItems: "center", color: "#fff" }}>{catIcon(t.category, 15)}</div><span className="semi">{t.name}</span>{t.id === appliedId && <Badge tone="teal">Đang dùng</Badge>}</div></td>
                            <td>{t.category}</td>
                            <td>{tj.duration || "—"}</td>
                            <td>{tj.scenes || "—"}</td>
                            <td>{cap(tj.caption?.preset)}</td>
                            <td>v{t.version}</td>
                            <td>{statusBadge(t)}</td>
                            <td><Btn size="xs" kind="ghost" icon={<Pencil size={12} />} onClick={() => setEditing(t)}>Sửa</Btn></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="row between small t2">
                <span>Hiển thị {filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0} – {Math.min(page * PAGE_SIZE, filtered.length)} trong {filtered.length} template</span>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={14} /></button>
                  {Array.from({ length: pages }).map((_, i) => (
                    <button key={i} className={`btn sm ${page === i + 1 ? "primary" : ""}`} onClick={() => setPage(i + 1)}>{i + 1}</button>
                  ))}
                  <button className="btn sm icon" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Trang sau"><ChevronRight size={14} /></button>
                </div>
              </div>
            </div>

            <Card title="Chi tiết Template" icon={<LayoutTemplate size={16} className="c-primary" />} style={{ position: "sticky", top: 0 }}>
              {!sel ? (
                <div className="small muted">Chọn một template để xem chi tiết.</div>
              ) : (
                <TemplateDetail
                  t={sel}
                  applied={sel.id === appliedId}
                  campaign={campaign}
                  activeKit={activeKit}
                  onEdit={() => setEditing(sel)}
                  onApply={() => apply(sel)}
                  onStoryboard={() => nav("/creative/storyboard")}
                />
              )}
            </Card>
          </div>
        )}
      </Async>
      <TemplateModal
        tpl={editing}
        onClose={() => setEditing(null)}
        onSaved={(t) => {
          setEditing(null);
          q.reload();
          setSelId(t.id);
        }}
      />
    </>
  );
}

function TemplateDetail({ t, applied, campaign, activeKit, onEdit, onApply, onStoryboard }: { t: any; applied: boolean; campaign: any; activeKit: any; onEdit: () => void; onApply: () => Promise<unknown>; onStoryboard: () => void }) {
  const tj = t.template_json || {};
  const c = tj.caption || {};
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 110, flexShrink: 0 }}><Tile t={t} big /></div>
        <div className="grow">
          <div className="bold" style={{ fontSize: 15 }}>{t.name}</div>
          <div className="row wrap mt8" style={{ gap: 6 }}>
            <Badge tone="purple">{t.category}</Badge>
            {applied && <Badge tone="teal">Đang áp dụng</Badge>}
          </div>
          <div className="row mt8" style={{ gap: 6 }}>{statusBadge(t)}<span className="xs muted">Phiên bản v{t.version}</span></div>
          <div className="xs muted mt8">Tạo: {dt(t.created_at)}</div>
        </div>
      </div>
      <InfoNote>Template quyết định cấu trúc, chuyển động camera và phụ đề khi dựng storyboard. Phiên bản được ghim vào từng timeline, sửa template sẽ tăng phiên bản.</InfoNote>
      <div>
        <div className="semi mb8">Cấu trúc kịch bản (Storyboard)</div>
        {(tj.structure || []).length === 0 ? <div className="small muted">Chưa khai báo cấu trúc.</div> : (
          <div className="col" style={{ gap: 6 }}>
            {(tj.structure || []).map((s: string, i: number) => (
              <div key={i} className="row small">
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--primary)", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 700 }}>{i + 1}</span>
                <span className="grow">{s}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="inner kv" style={{ gridTemplateColumns: "130px 1fr" }}>
        <span>Thời lượng</span><span>{tj.duration || "—"}</span>
        <span>Số cảnh yêu cầu</span><span>{tj.scenes || "—"} cảnh</span>
        <span>Phong cách phụ đề</span><span>{cap(c.preset)} · {c.font_size || "—"}px</span>
        <span>Màu phụ đề</span>
        <span className="row" style={{ gap: 6 }}>
          {[c.color, c.highlight_color, c.box_color].filter(Boolean).map((x: string) => <span key={x} title={x} style={{ width: 16, height: 16, borderRadius: 4, background: x, border: "1px solid var(--border-2)" }} />)}
          {c.box ? <span className="xs muted">có nền chữ</span> : null}
        </span>
        <span>Chuyển động</span><span>{(tj.motions || []).map((m: string) => MOTIONS[m] || m).join(", ") || "—"}</span>
        <span>Màu nhấn</span><span className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 16, borderRadius: 4, background: tj.accent }} />{tj.accent || "—"}</span>
      </div>
      <div className="inner">
        <div className="row semi small"><Palette size={14} className="c-primary" /> Cá nhân hoá thương hiệu</div>
        {activeKit ? (
          <div className="small t2 mt8">
            Khi render, màu nhấn và phụ đề lấy từ Brand Kit đang hoạt động <b className="c-teal">{activeKit.name}</b>
            <span className="row mt8" style={{ gap: 4 }}>{[activeKit.primary, activeKit.secondary, activeKit.accent].filter(Boolean).map((x: string) => <span key={x} style={{ width: 14, height: 14, borderRadius: 4, background: x }} />)}</span>
          </div>
        ) : <div className="small muted mt8">Chưa có Brand Kit hoạt động — dùng màu nhấn của template.</div>}
      </div>
      <div className="row">
        <Btn className="grow" icon={<Pencil size={14} />} onClick={onEdit}>Chỉnh sửa</Btn>
        <Btn className="grow" icon={<ImageIcon size={14} />} onClick={onStoryboard}>Xem storyboard</Btn>
      </div>
      <Btn
        kind="primary"
        size="lg"
        icon={<Wand2 size={16} />}
        disabled={!campaign || applied}
        title={!campaign ? "Chưa có chiến dịch — tạo ở Chiến lược nội dung trước" : applied ? "Template này đang được áp dụng cho chiến dịch" : `Áp dụng cho chiến dịch ${campaign.name}`}
        onClick={onApply}
      >
        {applied ? "Đang áp dụng cho chiến dịch" : "Áp dụng template"}
      </Btn>
      {campaign && <div className="xs muted center">Áp dụng cho chiến dịch: {campaign.name}. Chỉ storyboard dựng sau đó mới dùng template mới.</div>}
    </div>
  );
}

function TemplateModal({ tpl, onClose, onSaved }: { tpl: any | null; onClose: () => void; onSaved: (t: any) => void }) {
  const { toast, toastError } = useApp();
  const isEdit = !!tpl?.id;
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (!tpl) return;
    const tj = tpl.template_json || {};
    setF({
      name: tpl.name || "",
      category: tpl.category || tj.category || "Custom",
      duration: tj.duration || "30–45s",
      scenes: tj.scenes || "4–6",
      preset: tj.caption?.preset || "kinetic",
      font_size: tj.caption?.font_size || 52,
      color: tj.caption?.color || "#FFFFFF",
      highlight_color: tj.caption?.highlight_color || "#FFD700",
      box: !!tj.caption?.box,
      structure: (tj.structure || ["Hook", "Thân bài", "CTA"]).join("\n"),
      motions: tj.motions || ["zoom_in"],
      accent: tj.accent || "#7B56FF",
    });
  }, [tpl]);
  if (!tpl) return null;
  const set = (k: string, v: unknown) => setF((x: any) => ({ ...x, [k]: v }));
  const structure = String(f.structure || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const valid = String(f.name || "").trim() && structure.length >= 2 && (f.motions || []).length > 0;

  async function save() {
    const template_json = {
      ...(tpl.template_json || {}),
      name: f.name.trim(),
      category: f.category,
      duration: f.duration,
      scenes: f.scenes,
      caption: { ...(tpl.template_json?.caption || {}), preset: f.preset, font_size: Number(f.font_size) || 52, color: f.color, highlight_color: f.highlight_color, box: f.box },
      structure,
      motions: f.motions,
      accent: f.accent,
    };
    try {
      const r = isEdit
        ? await api.put(`/templates/${tpl.id}`, { name: f.name.trim(), template_json })
        : await api.post(`/templates`, { name: f.name.trim(), category: f.category, template_json });
      toast({ kind: "success", title: isEdit ? `Đã lưu – phiên bản v${r.version}` : "Đã tạo template mới" });
      onSaved(r);
      return true;
    } catch (e) {
      toastError(e, "Không lưu được template");
    }
  }

  return (
    <Modal
      open
      width={680}
      onClose={onClose}
      title={isEdit ? `Chỉnh sửa template · v${tpl.version} → v${tpl.version + 1}` : "Tạo template mới"}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Huỷ</Btn>
          <Btn kind="primary" disabled={!valid} title={!valid ? "Cần tên, ≥ 2 bước cấu trúc và ≥ 1 chuyển động" : undefined} onClick={save}>{isEdit ? "Lưu phiên bản mới" : "Tạo template"}</Btn>
        </>
      }
    >
      <div className="grid g2" style={{ gap: 12 }}>
        <Field label="Tên template *"><input className="input" value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Danh mục" hint={isEdit ? "Danh mục hiển thị theo bản tạo ban đầu (API sửa chưa đổi cột danh mục)." : undefined}>
          <input className="input" list="tpl-cats" value={f.category || ""} onChange={(e) => set("category", e.target.value)} disabled={isEdit} />
          <datalist id="tpl-cats">{Object.keys(CAT_ICON).map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Thời lượng"><input className="input" value={f.duration || ""} onChange={(e) => set("duration", e.target.value)} placeholder="30–45s" /></Field>
        <Field label="Số cảnh"><input className="input" value={f.scenes || ""} onChange={(e) => set("scenes", e.target.value)} placeholder="4–6" /></Field>
        <Field label="Phong cách phụ đề"><Select value={f.preset} onChange={(v) => set("preset", v)} options={CAPTION_PRESETS.map((p) => ({ value: p, label: cap(p) }))} /></Field>
        <Field label="Cỡ chữ phụ đề (px)"><input className="input" type="number" min={24} max={96} value={f.font_size || 52} onChange={(e) => set("font_size", e.target.value)} /></Field>
        <div className="row" style={{ gap: 14 }}>
          <Field label="Màu chữ"><input type="color" value={f.color || "#FFFFFF"} onChange={(e) => set("color", e.target.value)} style={{ width: 54, height: 34, background: "none", border: 0 }} /></Field>
          <Field label="Màu nhấn chữ"><input type="color" value={f.highlight_color || "#FFD700"} onChange={(e) => set("highlight_color", e.target.value)} style={{ width: 54, height: 34, background: "none", border: 0 }} /></Field>
          <Field label="Màu template"><input type="color" value={f.accent || "#7B56FF"} onChange={(e) => set("accent", e.target.value)} style={{ width: 54, height: 34, background: "none", border: 0 }} /></Field>
        </div>
        <Field label="Nền chữ phụ đề">
          <label className="row small"><input type="checkbox" className="check" checked={!!f.box} onChange={(e) => set("box", e.target.checked)} /> Có hộp nền sau chữ</label>
        </Field>
        <div style={{ gridColumn: "span 2" }}>
          <Field label={`Cấu trúc kịch bản (mỗi dòng một bước · ${structure.length} bước)`}>
            <textarea className="textarea" rows={5} value={f.structure || ""} onChange={(e) => set("structure", e.target.value)} />
          </Field>
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <div className="label mb8">Chuyển động camera</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {Object.entries(MOTIONS).map(([k, l]) => {
              const on = (f.motions || []).includes(k);
              return <span key={k} className={`chip ${on ? "on" : ""}`} onClick={() => set("motions", on ? f.motions.filter((m: string) => m !== k) : [...(f.motions || []), k])}>{l}</span>;
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
