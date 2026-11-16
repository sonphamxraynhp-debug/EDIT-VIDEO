import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Archive, ArchiveRestore, Copy, FolderOpen, LayoutGrid, List, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { api, useApi } from "../lib/api";
import { dt } from "../lib/format";
import { useApp } from "../lib/store";
import { Async, Badge, Bar, Btn, Card, Empty, ErrorBox, Field, Loading, Modal, PageHead, Select, Thumb } from "../components/ui";
import { Ring } from "../components/charts";

const PHASE_TONE: Record<string, any> = { "Đang dựng video": "cyan", "Đang phân tích": "purple", "Đang viết kịch bản": "purple", "Hoàn thành": "teal", "Đã xuất một phần": "teal", "Chờ bạn chọn video": "orange", "Chờ duyệt kịch bản": "orange", "Đã chọn, chờ xuất": "orange", "Đã có video nguồn": "gray", "Mới tạo": "gray", "Đã lưu trữ": "gray" };
const PLATFORM_LABEL: Record<string, string> = { tiktok: "TikTok", reels: "Reels", shorts: "Shorts", facebook: "Facebook" };
const ASPECTS = ["9:16", "1:1", "16:9", "4:5"];

function phaseOf(p: any) {
  return p.status === "archived" ? "Đã lưu trữ" : p.phase;
}

export default function Projects() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { projects, reloadProjects, setProjectId, projectId, toast, toastError } = useApp();
  const listQ = useApi<any[]>("/projects", undefined, 10000);
  const activity = useApi<any[]>("/activity", { limit: 8 }, 15000);
  const settings = useApi<any>("/settings");

  const [q, setQ] = useState("");
  const [product, setProduct] = useState("");
  const [phase, setPhase] = useState("");
  const [platform, setPlatform] = useState("");
  const [sort, setSort] = useState("updated");
  const [size, setSize] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [menu, setMenu] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<any>(null);

  const all = listQ.data ?? projects;
  const reloadAll = () => {
    listQ.reload();
    reloadProjects();
    activity.reload();
  };

  const products = useMemo(() => Array.from(new Set(all.map((p) => p.product?.name).filter(Boolean))) as string[], [all]);
  const platforms = useMemo(() => Array.from(new Set(all.flatMap((p) => p.settings_json?.platforms || []))) as string[], [all]);

  const filtered = useMemo(() => {
    let r = all.filter((p) => {
      const ph = phaseOf(p);
      if (phase ? ph !== phase : p.status === "archived") return false;
      if (product && p.product?.name !== product) return false;
      if (platform && !(p.settings_json?.platforms || []).includes(platform)) return false;
      if (size === "s" && p.target > 20) return false;
      if (size === "m" && (p.target <= 20 || p.target > 100)) return false;
      if (size === "l" && p.target <= 100) return false;
      if (q) {
        const s = q.toLowerCase();
        const hay = [p.name, p.description, p.product?.name, p.product?.sku, p.campaign?.name].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    r = [...r].sort((a, b) =>
      sort === "created_desc" ? b.created_at.localeCompare(a.created_at) : sort === "created_asc" ? a.created_at.localeCompare(b.created_at) : b.updated_at.localeCompare(a.updated_at),
    );
    return r;
  }, [all, q, product, phase, platform, sort, size]);

  // ---------------------------------------------------------------- quick create
  const nameRef = useRef<HTMLInputElement>(null);
  const quickRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({ name: "", product_name: "", target_count: 100, aspect: "9:16" });
  const [highlight, setHighlight] = useState(false);
  const isNew = sp.get("new") === "1";
  useEffect(() => {
    if (!isNew) return;
    setHighlight(true);
    setTimeout(() => {
      quickRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      nameRef.current?.focus();
    }, 50);
    const t = setTimeout(() => setHighlight(false), 2500);
    const next = new URLSearchParams(sp);
    next.delete("new");
    setSp(next, { replace: true });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  function focusQuick() {
    setHighlight(true);
    quickRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    nameRef.current?.focus();
    setTimeout(() => setHighlight(false), 2500);
  }

  async function create() {
    if (!form.name.trim()) {
      toast({ kind: "warn", title: "Nhập tên dự án", body: "Tên dự án là bắt buộc." });
      nameRef.current?.focus();
      return undefined;
    }
    try {
      const p = await api.post("/projects", {
        name: form.name.trim(),
        product_name: form.product_name.trim() || null,
        target_count: Math.max(1, Number(form.target_count) || 1),
        aspect: form.aspect,
      });
      toast({ kind: "success", title: `Đã tạo dự án “${p.name}”` });
      setForm({ name: "", product_name: "", target_count: 100, aspect: "9:16" });
      setProjectId(p.id);
      reloadAll();
      return p;
    } catch (e) {
      toastError(e, "Không tạo được dự án");
      return undefined;
    }
  }

  async function duplicate(p: any) {
    setMenu(null);
    try {
      const n = await api.post(`/projects/${p.id}/duplicate`);
      toast({ kind: "success", title: `Đã nhân bản thành “${n.name}”` });
      reloadAll();
    } catch (e) {
      toastError(e, "Không nhân bản được dự án");
    }
  }

  async function archive(p: any, restore = false) {
    setMenu(null);
    try {
      await api.patch(`/projects/${p.id}`, { status: restore ? "active" : "archived" });
      toast({ kind: "success", title: restore ? `Đã khôi phục “${p.name}”` : `Đã lưu trữ “${p.name}”` });
      reloadAll();
    } catch (e) {
      toastError(e, "Không cập nhật được trạng thái dự án");
    }
  }

  function open(p: any, to = "/flow") {
    setProjectId(p.id);
    nav(to);
  }

  return (
    <div onClick={() => menu && setMenu(null)}>
      <PageHead
        title="Dự án sáng tạo"
        sub="Quản lý chiến dịch, theo dõi tiến độ, sản phẩm và các phiên sản xuất hàng loạt."
        actions={<Btn kind="primary" size="lg" icon={<Plus size={18} />} onClick={focusQuick}>Dự án mới</Btn>}
      />

      <div className="card" style={{ padding: 12 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="search" style={{ margin: 0, maxWidth: 300, flex: "1 1 240px", height: 38 }}>
            <Search size={15} />
            <input placeholder="Tìm tên dự án, sản phẩm, mã chiến dịch..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Select value={product} onChange={setProduct} options={[{ value: "", label: "Sản phẩm: Tất cả" }, ...products.map((x) => ({ value: x, label: x }))]} />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Select value={phase} onChange={setPhase} options={[{ value: "", label: "Trạng thái: Đang hoạt động" }, ...["Mới tạo", "Đã có video nguồn", "Đang phân tích", "Đang viết kịch bản", "Chờ duyệt kịch bản", "Chờ bạn chọn video", "Đã chọn, chờ xuất", "Đang dựng video", "Đã xuất một phần", "Hoàn thành", "Đã lưu trữ"].map((x) => ({ value: x, label: x }))]} />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <Select value={platform} onChange={setPlatform} options={[{ value: "", label: "Nền tảng: Tất cả" }, ...platforms.map((x) => ({ value: x, label: PLATFORM_LABEL[x] || x }))]} />
          </div>
          <div style={{ flex: "1 1 130px" }} title="Ứng dụng chạy local một người dùng — dự án chưa có trường người phụ trách">
            <Select value="" onChange={() => undefined} disabled options={[{ value: "", label: "Người phụ trách" }]} />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <Select value={sort} onChange={setSort} options={[{ value: "updated", label: "Cập nhật gần nhất" }, { value: "created_desc", label: "Ngày tạo: mới nhất" }, { value: "created_asc", label: "Ngày tạo: cũ nhất" }]} />
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <Select value={size} onChange={setSize} options={[{ value: "", label: "Số video: Tất cả" }, { value: "s", label: "≤ 20 video" }, { value: "m", label: "21 – 100 video" }, { value: "l", label: "> 100 video" }]} />
          </div>
          <button className={`btn icon ${view === "grid" ? "primary" : ""}`} title="Dạng lưới" onClick={() => setView("grid")}><LayoutGrid size={16} /></button>
          <button className={`btn icon ${view === "list" ? "primary" : ""}`} title="Dạng danh sách" onClick={() => setView("list")}><List size={16} /></button>
        </div>
      </div>

      <div className="mt16">
        {listQ.loading && !listQ.data ? (
          <div className="grid g3">{[0, 1, 2].map((i) => <div key={i} className="card"><Loading rows={4} /></div>)}</div>
        ) : listQ.error && !listQ.data ? (
          <ErrorBox error={listQ.error} onRetry={listQ.reload} />
        ) : filtered.length === 0 ? (
          <Empty
            title={all.length === 0 ? "Chưa có dự án nào" : "Không có dự án khớp bộ lọc"}
            action={all.length === 0 ? <Btn kind="primary" icon={<Plus size={15} />} onClick={focusQuick}>Tạo dự án đầu tiên</Btn> : <Btn onClick={() => { setQ(""); setProduct(""); setPhase(""); setPlatform(""); setSize(""); }}>Xoá bộ lọc</Btn>}
          >
            {all.length === 0 ? "Dùng biểu mẫu “Tạo nhanh dự án mới” bên dưới để bắt đầu." : `${all.length} dự án đang bị ẩn bởi bộ lọc hiện tại.`}
          </Empty>
        ) : view === "grid" ? (
          <div className="grid g3">
            {filtered.map((p) => (
              <ProjectCard key={p.id} p={p} current={p.id === projectId} menuOpen={menu === p.id} onMenu={() => setMenu(menu === p.id ? null : p.id)}
                onOpen={() => open(p)} onDuplicate={() => duplicate(p)} onArchive={(r) => archive(p, r)} onDelete={() => { setMenu(null); setToDelete(p); }} />
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Dự án</th><th>Sản phẩm</th><th>Nền tảng</th><th className="center">Kịch bản duyệt</th><th style={{ width: 190 }}>Video hoàn tất</th><th>Trạng thái</th><th>Cập nhật</th><th /></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={p.id === projectId ? "sel" : ""}>
                    <td style={{ cursor: "pointer" }} onClick={() => open(p)}><div className="row"><Thumb src={p.thumbnail} ratio="1/1" style={{ width: 38 }} /><div><div className="semi">{p.name}</div><div className="xs muted ellipsis" style={{ maxWidth: 260 }}>{p.description || "—"}</div></div></div></td>
                    <td>{p.product?.name || "—"}</td>
                    <td><div className="row" style={{ gap: 4 }}>{(p.settings_json?.platforms || []).map((x: string) => <Badge key={x} tone="purple">{PLATFORM_LABEL[x] || x}</Badge>)}</div></td>
                    <td className="center bold">{p.approved_scripts}</td>
                    <td><div className="small">{p.completed} / {p.target} ({p.progress}%)</div><Bar value={p.progress} thin style={{ marginTop: 4 }} /></td>
                    <td><Badge tone={PHASE_TONE[phaseOf(p)] || "gray"}>{phaseOf(p)}</Badge></td>
                    <td className="small t2">{dt(p.updated_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn xs" title="Nhân bản" onClick={() => duplicate(p)}><Copy size={13} /></button>
                        <button className="btn xs" title={p.status === "archived" ? "Khôi phục" : "Lưu trữ"} onClick={() => archive(p, p.status === "archived")}>{p.status === "archived" ? <ArchiveRestore size={13} /> : <Archive size={13} />}</button>
                        <button className="btn xs danger" title="Xoá dự án" onClick={() => setToDelete(p)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)" }}>
        <Card title="Hoạt động gần đây" right={<span className="link small" onClick={() => nav("/settings?tab=logs")}>Xem tất cả ›</span>}>
          <Async q={activity} empty={(d) => d.length === 0 && <div className="small muted">Chưa có hoạt động nào.</div>}>
            {(d) => (
              <div className="col" style={{ gap: 8 }}>
                {d.slice(0, 6).map((a) => (
                  <div key={a.id} className="row small" style={{ alignItems: "flex-start" }}>
                    <span className="muted mono" style={{ minWidth: 44 }}>{new Date(a.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className={a.level === "warning" ? "c-orange" : a.level === "error" ? "c-red" : ""}>{a.message}</span>
                    <span className="xs muted" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{all.find((p) => p.id === a.project_id)?.name || ""}</span>
                  </div>
                ))}
              </div>
            )}
          </Async>
        </Card>

        <div ref={quickRef} className={`card ${highlight ? "glow" : ""}`} style={{ transition: "box-shadow .3s, border-color .3s" }}>
          <div className="card-head">
            <div className="card-title"><Plus size={16} /> Tạo nhanh dự án mới</div>
            <span className="spacer link small" onClick={() => nav("/settings")}>Thiết lập ban đầu</span>
          </div>
          <form className="row wrap" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); create(); }}>
            <input ref={nameRef} className="input" style={{ flex: "2 1 180px" }} placeholder="Tên dự án..." value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
            <input className="input" style={{ flex: "1.5 1 150px" }} placeholder="Sản phẩm..." value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
            <div className="row" style={{ flex: "0 1 130px", gap: 6 }}>
              <input className="input" type="number" min={1} max={5000} value={form.target_count} onChange={(e) => setForm({ ...form, target_count: Number(e.target.value) })} title="Số video mục tiêu" />
              <span className="small muted">video</span>
            </div>
            <div style={{ flex: "0 1 90px" }}><Select value={form.aspect} onChange={(v) => setForm({ ...form, aspect: v })} options={ASPECTS} /></div>
            <Btn kind="primary" icon={<Plus size={15} />} onClick={create}>Tạo dự án</Btn>
          </form>
          <div className="xs muted mt8">
            Thư mục lưu local: <span className="mono">{settings.data?.paths?.data ? `${settings.data.paths.data}/media` : "—"}</span> · Có thể thay đổi trong Cài đặt.
          </div>
        </div>
      </div>

      <DeleteModal project={toDelete} onClose={() => setToDelete(null)} onDone={() => { setToDelete(null); reloadAll(); }} />
    </div>
  );
}

function ProjectCard({ p, current, menuOpen, onMenu, onOpen, onDuplicate, onArchive, onDelete }: {
  p: any; current: boolean; menuOpen: boolean; onMenu: () => void; onOpen: () => void; onDuplicate: () => void; onArchive: (restore: boolean) => void; onDelete: () => void;
}) {
  const ph = phaseOf(p);
  const archived = p.status === "archived";
  return (
    <div className={`card ${current ? "glow" : ""}`} style={{ position: "relative", opacity: archived ? 0.7 : 1 }}>
      <div className="row between">
        <Badge tone={PHASE_TONE[ph] || "gray"}>{ph}</Badge>
        <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" aria-label="Thao tác dự án" onClick={onMenu}><MoreHorizontal size={16} /></button>
          {menuOpen && (
            <div className="card flat" style={{ position: "absolute", right: 0, top: 36, zIndex: 20, padding: 6, width: 180, boxShadow: "var(--shadow)" }}>
              <MenuItem icon={<FolderOpen size={14} />} onClick={onOpen}>Mở dự án</MenuItem>
              <MenuItem icon={<Copy size={14} />} onClick={onDuplicate}>Nhân bản</MenuItem>
              <MenuItem icon={archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} onClick={() => onArchive(archived)}>{archived ? "Khôi phục" : "Lưu trữ"}</MenuItem>
              <MenuItem icon={<Trash2 size={14} />} danger onClick={onDelete}>Xoá dự án…</MenuItem>
            </div>
          )}
        </div>
      </div>
      <div className="row mt12" style={{ gap: 14, alignItems: "flex-start", cursor: "pointer" }} onClick={onOpen}>
        <Thumb src={p.thumbnail} ratio="1/1" style={{ width: 92, flexShrink: 0 }} />
        <div className="grow">
          <div className="bold ellipsis" style={{ fontSize: 15 }}>{p.name}</div>
          <div className="small muted ellipsis">{p.product?.name || "Chưa có sản phẩm"}</div>
          <div className="row mt8" style={{ gap: 5, flexWrap: "wrap" }}>
            {(p.settings_json?.platforms || []).map((x: string) => <Badge key={x} tone="purple">{PLATFORM_LABEL[x] || x}</Badge>)}
            {p.settings_json?.aspect && <Badge tone="cyan">{p.settings_json.aspect}</Badge>}
          </div>
          <div className="xs t2 mt8">Kịch bản duyệt: <b>{p.approved_scripts}</b></div>
          <div className="xs t2">Video hoàn tất: <b>{p.completed} / {p.target}</b></div>
        </div>
        <Ring value={p.progress} size={58} thickness={6} />
      </div>
      <div className="row between small t2 mt16"><span>Tiến độ sản xuất</span><b>{p.progress}%</b></div>
      <Bar value={p.progress} style={{ marginTop: 6 }} />
      <div className="row between xs muted mt8"><span>Thời gian cập nhật</span><span>{new Date(p.updated_at).toLocaleDateString("vi-VN")}</span></div>
    </div>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button className="btn ghost sm" style={{ width: "100%", justifyContent: "flex-start", color: danger ? "#ff8aa1" : undefined }} onClick={onClick}>
      {icon} {children}
    </button>
  );
}

/** TC-018: xoá dự án phải xác nhận bằng cách gõ lại tên. */
function DeleteModal({ project, onClose, onDone }: { project: any; onClose: () => void; onDone: () => void }) {
  const { toast, toastError } = useApp();
  const [typed, setTyped] = useState("");
  const [purge, setPurge] = useState(false);
  useEffect(() => {
    setTyped("");
    setPurge(false);
  }, [project?.id]);
  if (!project) return null;
  const ok = typed.trim() === project.name.trim();
  async function del() {
    try {
      await api.del(`/projects/${project.id}`, purge ? { purge_media: true } : undefined);
      toast({ kind: "success", title: `Đã xoá dự án “${project.name}”` });
      onDone();
      return true;
    } catch (e) {
      toastError(e, "Không xoá được dự án");
      return undefined;
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={<><Trash2 size={16} className="c-red" /> Xoá dự án</>}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Huỷ</Btn>
        <Btn kind="danger" icon={<Trash2 size={15} />} disabled={!ok} title={ok ? undefined : "Gõ đúng tên dự án để xác nhận"} onClick={del}>Xoá vĩnh viễn</Btn>
      </>}
    >
      <div className="warn-box small">
        Dự án <b>{project.name}</b> sẽ bị ẩn khỏi danh sách cùng {project.variants} biến thể và {project.completed} video đã hoàn tất. Thao tác này không thể hoàn tác từ giao diện.
      </div>
      <label className="row mt12 small" style={{ cursor: "pointer" }}>
        <input type="checkbox" className="check" checked={purge} onChange={(e) => setPurge(e.target.checked)} />
        Xoá luôn bản sao media đã nhập trong thư mục dữ liệu (file gốc trên máy không bị ảnh hưởng)
      </label>
      <div className="mt12">
        <Field label={<>Gõ lại tên dự án <b>{project.name}</b> để xác nhận</>}>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
