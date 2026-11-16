import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Check, Eye, FileText, FileUp, Info, Lock, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { api, ApiError, fileUrl, useApi } from "../lib/api";
import { CLAIM_STATUS, dt } from "../lib/format";
import { useApp } from "../lib/store";
import { Badge, Btn, Card, Empty, ErrorBox, Field, InfoNote, Loading, Modal, NeedProject, PageHead, Select, Tabs, Thumb, Warn } from "../components/ui";
import { useVariants } from "../components/pickers";
import { uploadWithProgress } from "../components/a_flow";

const TABS = [
  { id: "overview", label: "Tổng quan" },
  { id: "usp", label: "USP" },
  { id: "features", label: "Tính năng" },
  { id: "ingredients", label: "Thành phần" },
  { id: "evidence", label: "Bằng chứng" },
  { id: "faq", label: "FAQ" },
  { id: "audience", label: "Khách hàng" },
  { id: "rules", label: "Quy định" },
];

const OVERVIEW_FIELDS: Array<[string, string, string?]> = [
  ["category", "Danh mục"],
  ["short_description", "Mô tả ngắn"],
  ["usp", "USP / điểm khác biệt"],
  ["verified_benefits", "Công dụng được xác minh"],
  ["price", "Giá tham khảo"],
  ["features", "Đặc điểm nổi bật"],
  ["usage", "Hướng dẫn sử dụng"],
  ["limitations", "Giới hạn / chống chỉ định"],
  ["audience", "Nhóm khách hàng"],
  ["allowed_cta", "CTA được phép"],
  ["evidence_note", "Nguồn bằng chứng"],
];

const RISK = [
  { value: "low", label: "Thấp" },
  { value: "medium", label: "Trung bình" },
  { value: "high", label: "Cao" },
];
const CLAIM_OPTS = Object.entries(CLAIM_STATUS).map(([value, s]) => ({ value, label: s.label }));
const AFFECTED = "SCRIPT_APPROVED,STORYBOARD_READY,PREVIEW_READY,QC_PENDING,APPROVED";

export default function ProductBrain() {
  const { projectId, product, project } = useApp();
  return (
    <NeedProject projectId={projectId}>
      {projectId && (project === undefined ? <Loading rows={4} /> : product?.id ? <BrainBody key={product.id} pid={product.id} /> : <CreateProduct projectId={projectId} />)}
    </NeedProject>
  );
}

function CreateProduct({ projectId }: { projectId: string }) {
  const { reloadProject, toast, toastError } = useApp();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  async function create() {
    try {
      const p = await api.post("/products", { project_id: projectId, name: name.trim(), sku: sku.trim() || null, attributes_json: {} });
      toast({ kind: "success", title: `Đã tạo hồ sơ “${p.name}”` });
      reloadProject();
      return p;
    } catch (e) {
      toastError(e, "Không tạo được sản phẩm");
      return undefined;
    }
  }
  return (
    <>
      <PageHead title="Bộ não sản phẩm" sub="Xây dựng nguồn tri thức có bằng chứng để AI sáng tạo nội dung chính xác." />
      <Card title="Dự án chưa có hồ sơ sản phẩm" sub="Tạo hồ sơ để nhập USP, tuyên bố, bằng chứng và FAQ." style={{ maxWidth: 620 }}>
        <div className="grid g2">
          <Field label="Tên sản phẩm *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label="SKU"><input className="input" value={sku} onChange={(e) => setSku(e.target.value)} /></Field>
        </div>
        <div className="row mt12" style={{ justifyContent: "flex-end" }}>
          <Btn kind="primary" icon={<Plus size={15} />} disabled={!name.trim()} title={name.trim() ? undefined : "Nhập tên sản phẩm"} onClick={create}>Tạo hồ sơ sản phẩm</Btn>
        </div>
      </Card>
    </>
  );
}

function BrainBody({ pid }: { pid: string }) {
  const { toast, toastError, reloadProject, project } = useApp();
  const q = useApi<any>(`/products/${pid}`);
  const affected = useVariants({ status: AFFECTED, size: 1 }, 0);
  const [tab, setTab] = useState("overview");
  const [draft, setDraft] = useState<{ name: string; sku: string; attrs: Record<string, any> } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const d = q.data;
  const p = d?.product;
  useEffect(() => {
    if (p && !dirty) setDraft({ name: p.name, sku: p.sku || "", attrs: { ...(p.attributes_json || {}) } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.updated_at, p?.id]);

  const setAttr = (k: string, v: any) => {
    setDraft((x) => (x ? { ...x, attrs: { ...x.attrs, [k]: v } } : x));
    setDirty(true);
  };
  const setTop = (k: "name" | "sku", v: string) => {
    setDraft((x) => (x ? { ...x, [k]: v } : x));
    setDirty(true);
  };

  async function doSave() {
    if (!draft) return undefined;
    if (!draft.name.trim()) {
      toast({ kind: "warn", title: "Tên sản phẩm không được để trống" });
      return undefined;
    }
    try {
      const r = await api.put(`/products/${pid}`, { name: draft.name.trim(), sku: draft.sku.trim() || null, attributes_json: draft.attrs });
      setDirty(false);
      q.setData(r);
      setConfirmSave(false);
      reloadProject();
      affected.reload();
      toast(p.locked ? { kind: "warn", title: `Đã lưu — Product Brain lên v${r.product.version}`, body: "Các biến thể đã duyệt được đánh dấu Cần chỉnh sửa." } : { kind: "success", title: "Đã lưu hồ sơ sản phẩm" });
      return r;
    } catch (e) {
      toastError(e, "Không lưu được hồ sơ sản phẩm");
      return undefined;
    }
  }
  function save() {
    if (p?.locked) {
      setConfirmSave(true);
      return undefined;
    }
    return doSave();
  }
  function discard() {
    setDirty(false);
    if (p) setDraft({ name: p.name, sku: p.sku || "", attrs: { ...(p.attributes_json || {}) } });
  }

  async function lock() {
    try {
      await api.post(`/products/${pid}/lock`);
      toast({ kind: "success", title: `Đã khoá dữ liệu sản phẩm v${p.version}`, body: "Snapshot đã lưu; AI chỉ dùng phiên bản này khi sinh nội dung." });
      q.reload();
      return true;
    } catch (e) {
      toastError(e, "Không khoá được dữ liệu sản phẩm");
      return undefined;
    }
  }

  if (q.loading && !d) return <><PageHead title="Bộ não sản phẩm" /><Loading rows={6} /></>;
  if (q.error && !d) return <><PageHead title="Bộ não sản phẩm" /><ErrorBox error={q.error} onRetry={q.reload} /></>;
  if (!d || !draft) return null;

  const ctx: Ctx = { d, draft, setAttr, setTop, reload: q.reload, pid };

  return (
    <>
      <PageHead
        title="Bộ não sản phẩm"
        sub="Xây dựng nguồn tri thức có bằng chứng để AI sáng tạo nội dung chính xác."
        actions={
          <>
            <Btn icon={<Sparkles size={15} />} onClick={() => setAiOpen(true)} title="AI đề xuất hồ sơ từ ghi chú (bản nháp chờ duyệt)">AI soạn nháp</Btn>
            <Btn kind="primary" size="lg" icon={<Lock size={17} />} onClick={lock} disabled={!!p.locked || dirty} title={p.locked ? `Đã khoá ở v${p.version}` : dirty ? "Lưu thay đổi trước khi khoá" : undefined}>
              {p.locked ? `Đã khoá v${p.version}` : "Khóa dữ liệu sản phẩm"}
            </Btn>
          </>
        }
      />
      <div className="card" style={{ padding: 8 }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0,1fr))`, gap: 8 }}>
          {TABS.map((t) => (
            <button key={t.id} className={`pill-tab ${tab === t.id ? "on" : ""}`} style={{ textAlign: "center" }} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {p.locked ? (
        <div className="mt12"><InfoNote>Dữ liệu đang khoá ở <b>v{p.version}</b>. Mọi thay đổi thông tin sản phẩm khi lưu sẽ tạo <b>v{p.version + 1}</b>, mở khoá và chuyển các biến thể đã duyệt sang “Cần chỉnh sửa”. Tuyên bố, bằng chứng và FAQ có thể chỉnh trực tiếp.</InfoNote></div>
      ) : null}

      <div className="mt16">
        {tab === "overview" && <Overview ctx={ctx} project={project} goEvidence={() => setTab("evidence")} />}
        {tab === "usp" && (
          <>
            <Card title="USP & điểm khác biệt">
              <div className="grid g2">
                <AttrArea ctx={ctx} k="usp" label="USP chính" rows={3} />
                <AttrArea ctx={ctx} k="usp_points" label="Các điểm khác biệt (mỗi dòng một ý)" rows={3} />
              </div>
            </Card>
            <ClaimsCard ctx={ctx} />
          </>
        )}
        {tab === "features" && (
          <Card title="Tính năng & cách dùng">
            <div className="grid g2">
              <AttrArea ctx={ctx} k="features" label="Đặc điểm nổi bật" />
              <AttrArea ctx={ctx} k="specs" label="Thông số kỹ thuật / quy cách" />
              <AttrArea ctx={ctx} k="usage" label="Hướng dẫn sử dụng" />
              <AttrArea ctx={ctx} k="verified_benefits" label="Công dụng được xác minh" />
            </div>
          </Card>
        )}
        {tab === "ingredients" && <Ingredients ctx={ctx} />}
        {tab === "evidence" && (
          <>
            <EvidenceCard ctx={ctx} showAdd />
            <ClaimsCard ctx={ctx} />
          </>
        )}
        {tab === "faq" && <FaqCard ctx={ctx} />}
        {tab === "audience" && (
          <Card title="Chân dung khách hàng">
            <div className="grid g2">
              <AttrArea ctx={ctx} k="audience" label="Nhóm khách hàng chính" />
              <AttrArea ctx={ctx} k="pain_points" label="Vấn đề / nhu cầu của khách hàng (mỗi dòng một ý)" />
              <AttrArea ctx={ctx} k="personas" label="Persona chi tiết" />
              <AttrArea ctx={ctx} k="objections" label="Băn khoăn thường gặp trước khi mua" />
            </div>
          </Card>
        )}
        {tab === "rules" && <Rules ctx={ctx} />}
      </div>

      {dirty && (
        <div className="sticky-bottom">
          <AlertTriangle size={16} className="c-orange" />
          <span className="small">Có thay đổi chưa lưu{p.locked ? ` — lưu sẽ tạo v${p.version + 1}` : ""}.</span>
          <div style={{ marginLeft: "auto" }} className="row">
            <Btn kind="ghost" onClick={discard}>Huỷ thay đổi</Btn>
            <Btn kind="primary" icon={<Save size={15} />} onClick={save}>Lưu thay đổi</Btn>
          </div>
        </div>
      )}

      <Modal
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        title={<><AlertTriangle size={16} className="c-orange" /> Sản phẩm đang bị khoá</>}
        footer={<><Btn kind="ghost" onClick={() => setConfirmSave(false)}>Huỷ</Btn><Btn kind="orange" icon={<Save size={15} />} onClick={doSave}>Lưu và tạo v{p.version + 1}</Btn></>}
      >
        <div className="small col">
          <div>Hồ sơ đang khoá ở <b>v{p.version}</b> và đã được dùng để sinh nội dung. Khi lưu:</div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Phiên bản tăng lên <b>v{p.version + 1}</b> và hồ sơ được mở khoá.</li>
            <li>
              Các biến thể đã duyệt kịch bản trở lên của dự án sẽ chuyển sang <b className="c-orange">Cần chỉnh sửa</b>
              {affected.data ? <> — hiện có <b>{affected.data.total}</b> biến thể trong chiến dịch đang mở bị ảnh hưởng.</> : "."}
            </li>
            <li>Bạn cần khoá lại dữ liệu sau khi rà soát xong.</li>
          </ul>
        </div>
      </Modal>

      <AiDraftModal open={aiOpen} onClose={() => setAiOpen(false)} pid={pid} onApply={(k, v) => setAttr(k, v)} onDone={q.reload} />
    </>
  );
}

interface Ctx {
  d: any;
  draft: { name: string; sku: string; attrs: Record<string, any> };
  setAttr: (k: string, v: any) => void;
  setTop: (k: "name" | "sku", v: string) => void;
  reload: () => void;
  pid: string;
}

function AttrArea({ ctx, k, label, rows = 4 }: { ctx: Ctx; k: string; label: string; rows?: number }) {
  return (
    <Field label={label}>
      <textarea className="textarea" rows={rows} value={ctx.draft.attrs[k] ?? ""} onChange={(e) => ctx.setAttr(k, e.target.value)} placeholder="Chưa nhập" />
    </Field>
  );
}

// ---------------------------------------------------------------- overview
function Overview({ ctx, project, goEvidence }: { ctx: Ctx; project: any; goEvidence: () => void }) {
  const { d, draft } = ctx;
  const p = d.product;
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,.8fr) minmax(0,2.1fr) minmax(0,1fr)" }}>
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <Thumb src={project?.thumbnail} ratio="16/10" />
            <div className="bold mt12" style={{ fontSize: 17 }}>{p.name}</div>
            <div className="row between mt8">
              <span className="xs muted">{draft.attrs.category || "Chưa phân loại"} · v{p.version}.0</span>
              <Badge tone={p.locked ? "teal" : p.status === "approved" ? "cyan" : "orange"}>{p.locked ? "Đã khoá" : p.status === "approved" ? "Đã mở khoá" : "Bản nháp"}</Badge>
            </div>
            <div className="xs muted mt8">Nguồn tham chiếu: {d.evidence.length} tài liệu · SKU {p.sku || "—"}</div>
            {d.versions?.length > 0 && <div className="xs muted">Snapshot gần nhất: v{d.versions[0].version} · {dt(d.versions[0].created_at)}</div>}
          </div>
          <DocStore ctx={ctx} />
        </div>

        <Card title="Thông tin sản phẩm" right={<Badge tone={p.locked ? "teal" : "orange"}>{p.locked ? `Khoá v${p.version}` : "Đang chỉnh sửa"}</Badge>}>
          <div className="grid g2" style={{ gap: 12 }}>
            <Field label="Tên sản phẩm"><input className="input" value={draft.name} onChange={(e) => ctx.setTop("name", e.target.value)} /></Field>
            <Field label="SKU"><input className="input" value={draft.sku} onChange={(e) => ctx.setTop("sku", e.target.value)} /></Field>
            {OVERVIEW_FIELDS.map(([k, label]) => (
              <Field key={k} label={label}>
                <input className="input" value={draft.attrs[k] ?? ""} onChange={(e) => ctx.setAttr(k, e.target.value)} placeholder="Chưa nhập" />
              </Field>
            ))}
          </div>
        </Card>

        <AuditPanel ctx={ctx} />
      </div>
      <div className="mt16"><EvidenceCard ctx={ctx} onImport={goEvidence} /></div>
    </>
  );
}

function DocStore({ ctx }: { ctx: Ctx }) {
  const { toast, toastError } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<{ name: string; p: number } | null>(null);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      setBusy({ name: f.name, p: 0 });
      const fd = new FormData();
      fd.append("file", f);
      try {
        await uploadWithProgress(`/products/${ctx.pid}/evidence/upload`, fd, (p) => setBusy({ name: f.name, p }));
        toast({ kind: "success", title: `Đã thêm tài liệu ${f.name}`, body: "Trạng thái: chờ kiểm tra." });
      } catch (e) {
        toastError(e, `Không tải lên được ${f.name}`);
      }
    }
    setBusy(null);
    ctx.reload();
  }
  return (
    <Card title="Kho tài liệu" right={<span className="small muted">{ctx.d.evidence.length} tệp</span>}>
      <div
        className={`dropzone ${over ? "over" : ""}`}
        style={{ padding: 16 }}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
      >
        <FileUp size={22} className="c-primary" />
        <div className="semi small">Kéo tài liệu PDF / DOCX</div>
        <div className="xs muted">hoặc chọn từ máy tính</div>
        <input ref={ref} type="file" multiple hidden accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.csv,.jpg,.jpeg,.png" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      </div>
      {busy && <div className="xs muted mt8">Đang tải {busy.name}… {Math.round(busy.p * 100)}%</div>}
      <div className="col mt12" style={{ gap: 6 }}>
        {ctx.d.evidence.slice(0, 4).map((e: any) => (
          <div key={e.id} className="list-item" style={{ padding: 8, cursor: "default" }}>
            <FileText size={15} className="muted" />
            <span className="small ellipsis grow" title={e.title}>{e.title}</span>
          </div>
        ))}
        {ctx.d.evidence.length > 4 && <div className="xs muted">+ {ctx.d.evidence.length - 4} tài liệu khác</div>}
      </div>
    </Card>
  );
}

function AuditPanel({ ctx }: { ctx: Ctx }) {
  const a = ctx.d.audit;
  const [open, setOpen] = useState(false);
  const items: Array<{ t: string; s: string; badge: string; tone: any }> = [
    { t: "Phát ngôn có nguồn", s: `${a.sourced} tuyên bố đã gắn bằng chứng`, badge: a.sourced > 0 ? "Đạt" : "Trống", tone: a.sourced > 0 ? "teal" : "gray" },
    { t: "Thiếu bằng chứng", s: `${a.missing_evidence} tuyên bố cần tài liệu`, badge: a.missing_evidence ? "Bổ sung" : "Đủ", tone: a.missing_evidence ? "orange" : "teal" },
    { t: "Cụm từ không được dùng", s: `${a.blocked_phrases} cụm từ bị chặn · ${a.prohibited} tuyên bố cấm/hết hạn`, badge: a.blocked_phrases ? "Đang chặn" : "Chưa khai báo", tone: a.blocked_phrases ? "red" : "gray" },
    { t: "Chờ người phê duyệt", s: `${a.pending_review} tuyên bố chờ duyệt`, badge: a.pending_review ? "Chờ duyệt" : "Xong", tone: a.pending_review ? "cyan" : "teal" },
  ];
  return (
    <Card title={<><Sparkles size={15} className="c-primary" /> AI Knowledge Audit</>} right={<Badge tone="teal">{a.evidence} nguồn</Badge>}>
      <div className="col" style={{ gap: 10 }}>
        {items.map((i) => (
          <div key={i.t} className="inner">
            <div className="row between"><span className="semi">{i.t}</span><Badge tone={i.tone}>{i.badge}</Badge></div>
            <div className="xs muted mt8">{i.s}</div>
          </div>
        ))}
        <InfoNote>AI chỉ được dùng tuyên bố đã duyệt và có nguồn trong hồ sơ. Đã duyệt: {a.approved}.</InfoNote>
        <Btn icon={<Eye size={15} />} onClick={() => setOpen(true)}>Xem báo cáo kiểm chứng</Btn>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Báo cáo kiểm chứng tuyên bố" width={720}>
        {ctx.d.claims.length === 0 ? (
          <div className="small muted">Chưa có tuyên bố nào.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Tuyên bố</th><th>Trạng thái</th><th>Rủi ro</th><th>Bằng chứng</th></tr></thead>
              <tbody>
                {ctx.d.claims.map((c: any) => {
                  const ev = ctx.d.evidence.find((e: any) => e.id === c.evidence_id);
                  const s = CLAIM_STATUS[c.status] || { label: c.status, tone: "gray" };
                  return (
                    <tr key={c.id}>
                      <td>{c.text}</td>
                      <td><Badge tone={s.tone}>{s.label}</Badge></td>
                      <td>{RISK.find((r) => r.value === c.risk_level)?.label || c.risk_level}</td>
                      <td className="small">{ev ? ev.title : <span className="c-orange">Chưa có</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="small muted mt12">Cụm từ bị chặn: {(ctx.d.product.attributes_json?.blocked_phrases || []).join(", ") || "—"}</div>
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------- evidence
const EV_STATUS: Record<string, { label: string; tone: any }> = {
  checked: { label: "Đã kiểm tra", tone: "teal" },
  pending: { label: "Chờ kiểm tra", tone: "orange" },
  expired: { label: "Hết hạn", tone: "gray" },
};

function EvidenceCard({ ctx, showAdd, onImport }: { ctx: Ctx; showAdd?: boolean; onImport?: () => void }) {
  const { toast, toastError } = useApp();
  const [del, setDel] = useState<any>(null);
  const [form, setForm] = useState({ title: "", kind: "PDF", source_uri: "", excerpt: "", page: "", expiry: "" });
  const ref = useRef<HTMLInputElement>(null);
  const supported = (eid: string) => ctx.d.claims.filter((c: any) => c.evidence_id === eid).length;
  const local = (u?: string) => !!u && (u.startsWith("/") || /^[A-Za-z]:\\/.test(u));

  async function add() {
    try {
      await api.post(`/products/${ctx.pid}/evidence`, { ...form, page: form.page || null, expiry: form.expiry || null, status: "checked" });
      toast({ kind: "success", title: "Đã thêm bằng chứng" });
      setForm({ title: "", kind: "PDF", source_uri: "", excerpt: "", page: "", expiry: "" });
      ctx.reload();
      return true;
    } catch (e) {
      toastError(e, "Không thêm được bằng chứng");
      return undefined;
    }
  }
  async function remove() {
    try {
      await api.del(`/evidence/${del.id}`);
      toast({ kind: "success", title: `Đã xoá “${del.title}”` });
      setDel(null);
      ctx.reload();
      return true;
    } catch (e) {
      toastError(e, "Không xoá được bằng chứng");
      return undefined;
    }
  }
  async function quickUpload(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        await uploadWithProgress(`/products/${ctx.pid}/evidence/upload`, fd, () => undefined);
        toast({ kind: "success", title: `Đã thêm tài liệu ${f.name}` });
      } catch (e) {
        toastError(e, `Không tải lên được ${f.name}`);
      }
    }
    ctx.reload();
  }

  return (
    <Card
      title="Tài liệu và bằng chứng"
      right={<><Btn icon={<Plus size={15} />} onClick={() => ref.current?.click()}>Nhập tài liệu</Btn><input ref={ref} type="file" multiple hidden onChange={(e) => { quickUpload(e.target.files); e.target.value = ""; }} />{onImport && <Btn kind="ghost" size="sm" onClick={onImport}>Quản lý ›</Btn>}</>}
    >
      {ctx.d.evidence.length === 0 ? (
        <div className="small muted">Chưa có tài liệu nào. Tuyên bố chỉ được duyệt khi gắn với bằng chứng.</div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Tên tệp</th><th>Loại</th><th>Nguồn</th><th>Trích dẫn</th><th>Phát ngôn được hỗ trợ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {ctx.d.evidence.map((e: any) => {
                const st = EV_STATUS[e.status] || { label: e.status, tone: "gray" };
                const isLocal = local(e.source_uri);
                return (
                  <tr key={e.id}>
                    <td className="semi">{e.title}</td>
                    <td>{e.kind || "—"}</td>
                    <td className="small t2 ellipsis" style={{ maxWidth: 200 }} title={e.source_uri || ""}>{isLocal ? "Tệp đã tải lên" : e.source_uri || "—"}</td>
                    <td className="small t2 ellipsis" style={{ maxWidth: 220 }} title={e.excerpt || ""}>{e.excerpt || "—"}{e.page ? ` · tr.${e.page}` : ""}</td>
                    <td>{supported(e.id)} tuyên bố</td>
                    <td><Badge tone={st.tone}>{st.label}</Badge>{e.expiry && <div className="xs muted">HSD {e.expiry}</div>}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        {isLocal ? <a className="link small" href={fileUrl(e.source_uri)} target="_blank" rel="noreferrer">Xem ›</a> : <span className="small muted" title="Bằng chứng nhập tay, không có tệp đính kèm">Xem ›</span>}
                        <button className="btn xs danger" title="Xoá bằng chứng" onClick={() => setDel(e)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && (
        <div className="inner mt12">
          <div className="semi small mb8">Thêm bằng chứng nhập tay (không có tệp)</div>
          <div className="grid" style={{ gridTemplateColumns: "2fr 1fr 1.4fr 2fr .7fr 1fr auto", gap: 8, alignItems: "end" }}>
            <Field label="Tiêu đề"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Loại"><Select value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={["PDF", "DOCX", "Kiểm nghiệm", "Chứng nhận", "Nội bộ", "Website"]} /></Field>
            <Field label="Nguồn"><input className="input" value={form.source_uri} onChange={(e) => setForm({ ...form, source_uri: e.target.value })} placeholder="Nội bộ / NCC / URL" /></Field>
            <Field label="Trích dẫn"><input className="input" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} /></Field>
            <Field label="Trang"><input className="input" value={form.page} onChange={(e) => setForm({ ...form, page: e.target.value })} /></Field>
            <Field label="Hết hạn"><input className="input" type="date" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} /></Field>
            <Btn kind="primary" icon={<Plus size={15} />} disabled={!form.title.trim()} title={form.title.trim() ? undefined : "Nhập tiêu đề"} onClick={add}>Thêm</Btn>
          </div>
        </div>
      )}
      <Modal open={!!del} onClose={() => setDel(null)} title={<><Trash2 size={16} className="c-red" /> Xoá bằng chứng</>} footer={<><Btn kind="ghost" onClick={() => setDel(null)}>Huỷ</Btn><Btn kind="danger" onClick={remove}>Xoá</Btn></>}>
        <div className="small">Xoá <b>{del?.title}</b>. {del && supported(del.id) > 0 ? <span className="c-orange">{supported(del.id)} tuyên bố đang dùng bằng chứng này sẽ bị gỡ liên kết; tuyên bố đã duyệt sẽ quay về “Chờ duyệt”.</span> : null}</div>
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------- claims
function ClaimsCard({ ctx }: { ctx: Ctx }) {
  const { toast, toastError } = useApp();
  const [errs, setErrs] = useState<Record<string, ApiError>>({});
  const [form, setForm] = useState({ text: "", risk_level: "low", evidence_id: "", status: "needs_review" });
  const [formErr, setFormErr] = useState<ApiError | null>(null);
  const evOpts = [{ value: "", label: "— Chưa gắn —" }, ...ctx.d.evidence.map((e: any) => ({ value: e.id, label: e.title }))];

  async function update(c: any, patch: Record<string, any>) {
    const body = { text: c.text, status: c.status, risk_level: c.risk_level, evidence_id: c.evidence_id || null, ...patch };
    if (body.evidence_id === "") body.evidence_id = null;
    try {
      await api.put(`/claims/${c.id}`, body);
      setErrs((x) => {
        const n = { ...x };
        delete n[c.id];
        return n;
      });
      ctx.reload();
    } catch (e) {
      setErrs((x) => ({ ...x, [c.id]: e as ApiError }));
      toastError(e, "Không cập nhật được tuyên bố");
    }
  }
  async function add() {
    try {
      await api.post(`/products/${ctx.pid}/claims`, { ...form, text: form.text.trim(), evidence_id: form.evidence_id || null });
      toast({ kind: "success", title: "Đã thêm tuyên bố" });
      setForm({ text: "", risk_level: "low", evidence_id: "", status: "needs_review" });
      setFormErr(null);
      ctx.reload();
      return true;
    } catch (e) {
      setFormErr(e as ApiError);
      toastError(e, "Không thêm được tuyên bố");
      return undefined;
    }
  }
  async function remove(c: any) {
    try {
      await api.del(`/claims/${c.id}`);
      toast({ kind: "success", title: "Đã xoá tuyên bố" });
      ctx.reload();
    } catch (e) {
      toastError(e, "Không xoá được tuyên bố");
    }
  }
  return (
    <Card className="mt16" title="Tuyên bố (claims)" sub="Chỉ tuyên bố “Đã duyệt” có bằng chứng mới được AI dùng trong kịch bản" right={<span className="small muted">{ctx.d.claims.length} tuyên bố</span>}>
      {ctx.d.claims.length === 0 ? (
        <div className="small muted mb12">Chưa có tuyên bố nào.</div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Tuyên bố</th><th style={{ width: 130 }}>Rủi ro</th><th style={{ width: 230 }}>Bằng chứng</th><th style={{ width: 150 }}>Trạng thái</th><th /></tr></thead>
            <tbody>
              {ctx.d.claims.map((c: any) => {
                const s = CLAIM_STATUS[c.status] || { label: c.status, tone: "gray" };
                const err = errs[c.id];
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="row"><Badge tone={s.tone}>{s.label}</Badge><span>{c.text}</span></div>
                      {err && <div className="xs c-red mt8"><AlertTriangle size={11} /> {err.body.message} <span className="mono">[{err.body.code}]</span>{err.body.code === "EVIDENCE_REQUIRED" && " — gắn bằng chứng trước khi duyệt."}</div>}
                    </td>
                    <td><Select value={c.risk_level} onChange={(v) => update(c, { risk_level: v })} options={RISK} /></td>
                    <td><Select value={c.evidence_id || ""} onChange={(v) => update(c, { evidence_id: v || null, ...(v ? {} : c.status === "approved" ? { status: "needs_review" } : {}) })} options={evOpts} /></td>
                    <td><Select value={c.status} onChange={(v) => update(c, { status: v })} options={CLAIM_OPTS} /></td>
                    <td><button className="btn xs danger" title="Xoá tuyên bố" onClick={() => remove(c)}><Trash2 size={12} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid mt12" style={{ gridTemplateColumns: "3fr 1fr 1.5fr 1.2fr auto", gap: 8, alignItems: "end" }}>
        <Field label="Tuyên bố mới"><input className="input" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="VD: Chai thuỷ tinh dung tích 30 ml" /></Field>
        <Field label="Rủi ro"><Select value={form.risk_level} onChange={(v) => setForm({ ...form, risk_level: v })} options={RISK} /></Field>
        <Field label="Bằng chứng"><Select value={form.evidence_id} onChange={(v) => setForm({ ...form, evidence_id: v })} options={evOpts} /></Field>
        <Field label="Trạng thái"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={CLAIM_OPTS} /></Field>
        <Btn kind="primary" icon={<Plus size={15} />} disabled={!form.text.trim()} title={form.text.trim() ? undefined : "Nhập nội dung tuyên bố"} onClick={add}>Thêm</Btn>
      </div>
      {formErr && <div className="mt8"><ErrorBox error={formErr} /></div>}
    </Card>
  );
}

// ---------------------------------------------------------------- ingredients
function Ingredients({ ctx }: { ctx: Ctx }) {
  const lines = String(ctx.draft.attrs.ingredients || "").split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="grid g2">
      <Card title="Thành phần / chất liệu" sub="Mỗi dòng một thành phần, dạng “Tên — vai trò”">
        <textarea className="textarea" rows={10} value={ctx.draft.attrs.ingredients ?? ""} onChange={(e) => ctx.setAttr("ingredients", e.target.value)} placeholder="Niacinamide — dưỡng da&#10;Glycerin — giữ ẩm" />
        <div className="mt12"><AttrArea ctx={ctx} k="ingredient_notes" label="Ghi chú về nguồn gốc / tiêu chuẩn" rows={3} /></div>
      </Card>
      <Card title="Xem trước" right={<span className="small muted">{lines.length} thành phần</span>}>
        {lines.length === 0 ? (
          <Empty title="Chưa khai báo thành phần">Thông tin thành phần chỉ dùng khi đã có bằng chứng tương ứng.</Empty>
        ) : (
          <div className="col" style={{ gap: 6 }}>
            {lines.map((l, i) => {
              const [name, role] = l.split(/\s+[—-]\s+/);
              return (
                <div key={i} className="list-item" style={{ cursor: "default" }}>
                  <Badge tone="purple">{String(i + 1).padStart(2, "0")}</Badge>
                  <span className="semi">{name}</span>
                  {role && <span className="small muted">{role}</span>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- FAQ
function FaqCard({ ctx }: { ctx: Ctx }) {
  const { toast, toastError } = useApp();
  const [form, setForm] = useState({ q: "", a: "", kind: "faq" });
  const [editing, setEditing] = useState<any>(null);
  async function add() {
    try {
      await api.post(`/products/${ctx.pid}/faqs`, { q: form.q.trim(), a: form.a.trim(), kind: form.kind, status: "approved" });
      toast({ kind: "success", title: "Đã thêm câu hỏi" });
      setForm({ q: "", a: "", kind: "faq" });
      ctx.reload();
      return true;
    } catch (e) {
      toastError(e, "Không thêm được FAQ");
      return undefined;
    }
  }
  async function remove(f: any) {
    try {
      await api.del(`/faqs/${f.id}`);
      toast({ kind: "success", title: "Đã xoá câu hỏi" });
      ctx.reload();
    } catch (e) {
      toastError(e, "Không xoá được FAQ");
    }
  }
  async function saveEdit() {
    // Backend chưa có PUT /faqs → tạo bản mới rồi xoá bản cũ.
    try {
      await api.post(`/products/${ctx.pid}/faqs`, { q: editing.q.trim(), a: editing.a.trim(), kind: editing.kind || "faq", status: "approved" });
      await api.del(`/faqs/${editing.id}`);
      toast({ kind: "success", title: "Đã cập nhật câu hỏi" });
      setEditing(null);
      ctx.reload();
      return true;
    } catch (e) {
      toastError(e, "Không cập nhật được FAQ");
      ctx.reload();
      return undefined;
    }
  }
  const faqs: any[] = ctx.d.faqs;
  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)" }}>
      <Card title="Câu hỏi thường gặp" right={<span className="small muted">{faqs.length} mục</span>}>
        {faqs.length === 0 ? (
          <Empty title="Chưa có FAQ">FAQ đã duyệt được dùng cho góc nội dung “Giải đáp” và “Q&A”.</Empty>
        ) : (
          <div className="col">
            {faqs.map((f) => (
              <div key={f.id} className="inner">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <Badge tone={f.kind === "objection" ? "orange" : "cyan"}>{f.kind === "objection" ? "Phản đối" : "FAQ"}</Badge>
                  <div className="grow">
                    <div className="semi">{f.q}</div>
                    <div className="small t2 mt8">{f.a}</div>
                  </div>
                  {f.status === "needs_review" && <Badge tone="orange">AI đề xuất · chờ duyệt</Badge>}
                  <button className="btn xs" onClick={() => setEditing({ ...f })}>Sửa</button>
                  <button className="btn xs danger" title="Xoá" onClick={() => remove(f)}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Thêm câu hỏi">
        <div className="col">
          <Field label="Loại"><Select value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={[{ value: "faq", label: "FAQ" }, { value: "objection", label: "Phản đối / băn khoăn" }]} /></Field>
          <Field label="Câu hỏi"><input className="input" value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} /></Field>
          <Field label="Trả lời (chỉ dùng thông tin đã xác minh)"><textarea className="textarea" rows={4} value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} /></Field>
          <Btn kind="primary" icon={<Plus size={15} />} disabled={!form.q.trim() || !form.a.trim()} title={!form.q.trim() || !form.a.trim() ? "Nhập câu hỏi và câu trả lời" : undefined} onClick={add}>Thêm FAQ</Btn>
        </div>
      </Card>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Sửa câu hỏi" footer={<><Btn kind="ghost" onClick={() => setEditing(null)}>Huỷ</Btn><Btn kind="primary" icon={<Check size={15} />} disabled={!editing?.q?.trim() || !editing?.a?.trim()} onClick={saveEdit}>Lưu & duyệt</Btn></>}>
        {editing && (
          <div className="col">
            <Field label="Câu hỏi"><input className="input" value={editing.q} onChange={(e) => setEditing({ ...editing, q: e.target.value })} /></Field>
            <Field label="Trả lời"><textarea className="textarea" rows={5} value={editing.a} onChange={(e) => setEditing({ ...editing, a: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- rules
function Rules({ ctx }: { ctx: Ctx }) {
  const blocked: string[] = ctx.draft.attrs.blocked_phrases || [];
  const [w, setW] = useState("");
  const add = () => {
    const v = w.trim();
    if (!v || blocked.some((b) => b.toLowerCase() === v.toLowerCase())) return;
    ctx.setAttr("blocked_phrases", [...blocked, v]);
    setW("");
  };
  const restricted = ctx.d.claims.filter((c: any) => c.status === "prohibited" || c.status === "expired");
  return (
    <div className="grid g2">
      <Card title="Cụm từ không được dùng" sub="Kịch bản chứa cụm từ này sẽ bị gắn cờ và chặn duyệt" right={<Badge tone="red">{blocked.length} cụm</Badge>}>
        <div className="row">
          <input className="input" value={w} onChange={(e) => setW(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="VD: trị dứt điểm" />
          <Btn icon={<Plus size={15} />} onClick={add} disabled={!w.trim()} title={w.trim() ? undefined : "Nhập cụm từ"}>Thêm</Btn>
        </div>
        <div className="row mt12" style={{ gap: 6, flexWrap: "wrap" }}>
          {blocked.length === 0 && <span className="small muted">Chưa có cụm từ nào.</span>}
          {blocked.map((b) => (
            <span key={b} className="badge b-red" style={{ fontSize: 12, padding: "5px 10px" }}>
              {b}
              <X size={12} style={{ cursor: "pointer" }} onClick={() => ctx.setAttr("blocked_phrases", blocked.filter((x) => x !== b))} />
            </span>
          ))}
        </div>
        <div className="xs muted mt12">Thay đổi danh sách cần bấm “Lưu thay đổi” ở thanh dưới cùng.</div>
      </Card>
      <Card title="Giới hạn & quy định">
        <div className="col">
          <AttrArea ctx={ctx} k="limitations" label="Giới hạn / chống chỉ định" rows={3} />
          <AttrArea ctx={ctx} k="allowed_cta" label="CTA được phép" rows={2} />
          <AttrArea ctx={ctx} k="regulatory_note" label="Ghi chú pháp lý / quảng cáo" rows={3} />
        </div>
      </Card>
      <Card title="Tuyên bố bị cấm / hết hạn" right={<span className="small muted">{restricted.length}</span>} style={{ gridColumn: "span 2" }}>
        {restricted.length === 0 ? (
          <div className="small muted">Không có tuyên bố bị cấm hoặc hết hạn.</div>
        ) : (
          <div className="col" style={{ gap: 6 }}>
            {restricted.map((c: any) => (
              <div key={c.id} className="row small"><Badge tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].label}</Badge>{c.text}</div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- AI draft
function AiDraftModal({ open, onClose, pid, onApply, onDone }: { open: boolean; onClose: () => void; pid: string; onApply: (k: string, v: string) => void; onDone: () => void }) {
  const nav = useNavigate();
  const { toastError, toast } = useApp();
  const [notes, setNotes] = useState("");
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => {
    if (open) {
      setRes(null);
      setErr(null);
    }
  }, [open]);
  async function run() {
    setErr(null);
    try {
      const r = await api.post(`/products/${pid}/ai-draft`, { notes });
      setRes(r);
      onDone();
      toast({ kind: "success", title: "AI đã soạn nháp", body: r.note });
      return r;
    } catch (e) {
      setErr(e as ApiError);
      toastError(e, "AI không soạn được nháp");
      return undefined;
    }
  }
  const draft = res?.draft || {};
  const fields = useMemo(() => [["short_description", "Mô tả ngắn"], ["usp", "USP"], ["usage", "Hướng dẫn sử dụng"]].filter(([k]) => draft[k]), [draft]);
  return (
    <Modal open={open} onClose={onClose} width={680} title={<><Sparkles size={16} className="c-primary" /> AI soạn nháp hồ sơ</>} footer={<><Btn kind="ghost" onClick={onClose}>Đóng</Btn>{!res && <Btn kind="primary" icon={<Sparkles size={15} />} disabled={notes.trim().length < 10} title={notes.trim().length < 10 ? "Nhập ghi chú ít nhất 10 ký tự" : undefined} onClick={run}>Soạn nháp</Btn>}</>}>
      {!res ? (
        <>
          <Field label="Ghi chú sản phẩm (dán thông tin từ nhà cung cấp, catalogue…)" hint="AI chạy local; không suy đoán thông tin không có trong ghi chú. Tuyên bố/FAQ đề xuất sẽ ở trạng thái Chờ duyệt.">
            <textarea className="textarea" rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {err && <div className="mt12"><ErrorBox error={err} />{err.body.code === "LLM_UNAVAILABLE" && <button className="btn sm mt8" onClick={() => nav("/system/models")}>Mở Quản lý mô hình AI</button>}</div>}
        </>
      ) : (
        <div className="col">
          <Warn title="Bản nháp cần người xác nhận">{res.note}. Áp dụng từng trường vào biểu mẫu rồi bấm “Lưu thay đổi”.</Warn>
          {fields.map(([k, l]) => (
            <div key={k} className="inner">
              <div className="row between"><span className="semi small">{l}</span><button className="btn xs" onClick={() => onApply(k, draft[k])}><Check size={12} /> Áp dụng</button></div>
              <div className="small t2 mt8">{draft[k]}</div>
            </div>
          ))}
          <div className="small muted"><Info size={12} /> Đã thêm {(draft.claims || []).length} tuyên bố và {(draft.faqs || []).length} FAQ ở trạng thái chờ duyệt.</div>
        </div>
      )}
    </Modal>
  );
}

