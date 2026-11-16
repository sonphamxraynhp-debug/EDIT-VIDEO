import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, FileJson, FileText, FileVideo, Folder, FolderOpen,
  FolderTree, Image as ImageIcon, LayoutGrid, Library as LibraryIcon, List, Search, ShieldCheck, Trash2, Upload, X,
} from "lucide-react";
import { api, fileUrl, useApi } from "../lib/api";
import { VARIANT_STATUS, bytes, dt, fileName, ms } from "../lib/format";
import { useApp } from "../lib/store";
import { Async, Badge, Btn, Card, Empty, Modal, NeedProject, PageHead, Select, Tabs, Thumb, VariantStatus, Warn } from "../components/ui";

type Row = any;
type ExportResult = { folder: string; count: number; preset?: string; spec_issues?: number; blocked_originality?: Array<{ code: string; score: number; nearest?: string }> };
type Node = { kind: "all" | "campaign" | "angle" | "date"; value?: string };
const PAGE = 24;

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const day = (iso?: string) => (iso || "").slice(0, 10);
const jsonPath = (p?: string) => (p ? p.replace(/\.[^./\\]+$/, ".json") : undefined);

function countBy(rows: Row[], key: (r: Row) => string | undefined) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = key(r) || "—";
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()];
}

export default function Library() {
  const { projectId } = useApp();
  return (
    <>
      <PageHead
        title="Thư viện video"
        sub="Quản lý, tìm kiếm, xuất và tổ chức toàn bộ video đã sản xuất"
        icon={<LibraryIcon size={22} />}
      />
      <NeedProject projectId={projectId}>
        <LibraryBody projectId={projectId as string} />
      </NeedProject>
    </>
  );
}

function LibraryBody({ projectId }: { projectId: string }) {
  const nav = useNavigate();
  const { toast, toastError } = useApp();
  const q = useApi<Row[]>("/library", { project_id: projectId }, 15000);
  const [node, setNode] = useState<Node>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("new");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<ExportResult | null>(null);
  const [preset, setPreset] = useState("generic");
  const presetsQ = useApi<Array<{ id: string; label: string; note?: string }>>("/exports/presets");
  const presets = presetsQ.data?.length ? presetsQ.data : [{ id: "generic", label: "Chung (generic)" }, { id: "meta_ads", label: "Meta Ads" }, { id: "tiktok_ads", label: "TikTok Ads" }];
  const presetNote = presets.find((p) => p.id === preset)?.note;

  const rows = q.data || [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let r = rows.filter((x) => {
      if (node.kind === "campaign" && x.campaign !== node.value) return false;
      if (node.kind === "angle" && (x.angle_label || "—") !== node.value) return false;
      if (node.kind === "date" && day(x.created_at) !== node.value) return false;
      if (status && x.vstatus !== status) return false;
      if (s) {
        const hay = `${x.code} ${x.manifest_json?.caption || ""} ${x.angle_label || ""} ${x.campaign || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    r = [...r].sort((a, b) =>
      sort === "old" ? a.created_at.localeCompare(b.created_at)
        : sort === "size" ? (b.size_bytes || 0) - (a.size_bytes || 0)
          : sort === "code" ? a.code.localeCompare(b.code)
            : b.created_at.localeCompare(a.created_at));
    return r;
  }, [rows, node, search, status, sort]);

  useEffect(() => setPage(1), [node, search, status, sort]);
  useEffect(() => {
    if (!filtered.length) return;
    if (!activeId || !rows.some((r) => r.id === activeId)) setActiveId(filtered[0].id);
  }, [filtered, rows, activeId]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const active = rows.find((r) => r.id === activeId);
  const selectedRows = rows.filter((r) => sel.has(r.id));

  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => sel.has(r.id));
  const togglePage = () => setSel((s) => {
    const n = new Set(s);
    pageRows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id)));
    return n;
  });

  async function exportVideos() {
    const target = selectedRows.length ? selectedRows : filtered;
    if (!target.length) {
      toast({ kind: "warn", title: "Không có video nào để xuất" });
      return;
    }
    try {
      const r = await api.post<ExportResult>("/exports", { variant_ids: target.map((x) => x.variant_id), preset });
      setLastExport(r);
      const warned = (r.spec_issues || 0) > 0 || !!r.blocked_originality?.length;
      toast({ kind: warned ? "warn" : "success", title: `Đã xuất ${r.count} video`, body: r.folder });
      return true;
    } catch (e) {
      toastError(e, "Xuất video thất bại");
    }
  }

  function exportCsv() {
    const target = selectedRows.length ? selectedRows : filtered;
    if (!target.length) {
      toast({ kind: "warn", title: "Không có video nào để xuất metadata" });
      return;
    }
    const head = ["code", "caption", "campaign", "angle", "status", "duration_ms", "resolution", "encoder", "size_bytes", "sha256", "script_version", "created_at", "file_exists", "path"];
    const lines = target.map((r) => {
      const m = r.manifest_json || {};
      return [r.code, m.caption, r.campaign, r.angle_label, r.vstatus, m.duration_ms, m.resolution, m.encoder, r.size_bytes, m.sha256, m.script_version, r.created_at, r.exists, r.output_uri].map(csvCell).join(",");
    });
    download(`library_metadata_${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + [head.join(","), ...lines].join("\n"), "text/csv;charset=utf-8");
    toast({ kind: "success", title: `Đã tải metadata ${target.length} video` });
  }

  async function openFolder(path?: string) {
    try {
      await api.post("/system/open-folder", path ? { path } : {});
      return true;
    } catch (e) {
      toastError(e, "Không mở được thư mục");
    }
  }

  return (
    <Async q={q}>
      {() => (
        <>
          <div className="grid" style={{ gridTemplateColumns: "250px minmax(0,1fr) 340px", alignItems: "start" }}>
            {/* ---------------- cây thư mục */}
            <div className="col" style={{ gap: 16 }}>
              <Card title="Thư viện dự án" icon={<FolderTree size={16} className="c-primary" />}>
                <FolderTreeView rows={rows} node={node} setNode={setNode} />
              </Card>
              <SafeDeleteCard />
            </div>

            {/* ---------------- danh sách */}
            <div className="col" style={{ gap: 12, minWidth: 0 }}>
              <div className="row wrap">
                <Select value={preset} onChange={setPreset} style={{ width: 200 }} options={presets.map((p) => ({ value: p.id, label: `Preset: ${p.label}` }))} />
                <Btn kind="primary" icon={<Upload size={15} />} onClick={exportVideos}
                  title={selectedRows.length ? `Xuất ${selectedRows.length} video đã chọn` : `Xuất ${filtered.length} video đang lọc`}>
                  Xuất video{selectedRows.length ? ` (${selectedRows.length})` : ""}
                </Btn>
                <Btn icon={<FileText size={15} />} onClick={exportCsv}>Xuất metadata CSV</Btn>
                <Btn icon={<FolderOpen size={15} />} onClick={() => openFolder()} title="Mở thư mục output của ứng dụng">Mở thư mục</Btn>
                <Btn icon={<Folder size={15} />} disabled title="Bộ sưu tập chưa được backend hỗ trợ">Tạo bộ sưu tập</Btn>
              </div>
              {presetNote && <div className="xs muted">{presetNote}</div>}
              {lastExport && (
                <>
                  <div className="info-box small row" style={{ alignItems: "center" }}>
                    <Check size={15} className="c-teal" />
                    <span className="grow ellipsis">Đã xuất {lastExport.count} video → <span className="mono">{lastExport.folder}</span></span>
                    <Btn size="xs" icon={<FolderOpen size={13} />} onClick={() => openFolder(lastExport.folder)}>Mở thư mục</Btn>
                    <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setLastExport(null)} aria-label="Đóng"><X size={13} /></button>
                  </div>
                  <div className="xs t2">
                    Thư mục xuất gồm <span className="mono">ads_mapping.csv</span> (ad_name, primary_text, headline, CTA, landing_url kèm UTM) và <span className="mono">README.txt</span>.
                    Việc tải lên Ads Manager là thủ công theo thiết kế của ứng dụng.
                  </div>
                  {!!lastExport.blocked_originality?.length && (
                    <Warn title={`${lastExport.blocked_originality.length} video bị loại do điểm nguyên bản thấp`}>
                      Các video này không được xuất. Hãy đổi hook / cảnh / giọng rồi QC lại.
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {lastExport.blocked_originality.map((b, i) => (
                          <li key={i}><span className="mono">{b.code}</span> · nguyên bản {Math.round((b.score || 0) * 100)}%{b.nearest ? ` · gần nhất ${String(b.nearest).slice(0, 8)}` : ""}</li>
                        ))}
                      </ul>
                    </Warn>
                  )}
                  {(lastExport.spec_issues || 0) > 0 && (
                    <Warn title={`${lastExport.spec_issues} vấn đề về thông số theo preset`}>
                      Một số video chưa đạt thông số của preset (thời lượng / dung lượng / tỉ lệ). Chi tiết ghi trong <span className="mono">ads_mapping.csv</span>.
                    </Warn>
                  )}
                </>
              )}
              <div className="row wrap">
                <div className="search" style={{ margin: 0, maxWidth: 260, flex: "1 1 200px" }}>
                  <Search size={15} />
                  <input placeholder="Tìm theo tên, concept, mã…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Select value={status} onChange={setStatus} style={{ width: 170 }} options={[
                  { value: "", label: "Trạng thái: Tất cả" },
                  ...[...new Set(rows.map((r) => r.vstatus))].map((s) => ({ value: s, label: VARIANT_STATUS[s]?.label || s })),
                ]} />
                <Select value={sort} onChange={setSort} style={{ width: 160 }} options={[
                  { value: "new", label: "Sắp xếp: Mới nhất" },
                  { value: "old", label: "Cũ nhất" },
                  { value: "size", label: "Dung lượng lớn" },
                  { value: "code", label: "Theo mã" },
                ]} />
                <div className="seg" style={{ marginLeft: "auto" }}>
                  <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")} title="Lưới"><LayoutGrid size={14} /></button>
                  <button className={view === "table" ? "on" : ""} onClick={() => setView("table")} title="Bảng"><List size={14} /></button>
                </div>
              </div>

              {rows.length === 0 ? (
                <Empty title="Chưa có video hoàn tất trong dự án này"
                  action={<button className="btn primary" onClick={() => nav("/production/batch")}>Thiết lập render hàng loạt</button>}>
                  Video xuất hiện ở đây sau khi render final thành công.
                </Empty>
              ) : filtered.length === 0 ? (
                <Empty title="Không có video khớp bộ lọc" action={<button className="btn" onClick={() => { setNode({ kind: "all" }); setSearch(""); setStatus(""); }}>Xoá bộ lọc</button>} />
              ) : view === "grid" ? (
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                  {pageRows.map((r) => (
                    <div key={r.id} className={`card flat ${r.id === activeId ? "glow" : ""}`} style={{ padding: 8, cursor: "pointer" }} onClick={() => setActiveId(r.id)}>
                      <Thumb src={r.manifest_json?.thumbnail} ratio="9/14" duration={ms(r.manifest_json?.duration_ms)}
                        label={<input type="checkbox" className="check" checked={sel.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.id)} />} />
                      <div className="semi small ellipsis mt8" title={r.manifest_json?.caption}>{r.manifest_json?.caption || r.code}</div>
                      <div className="row between mt8">
                        <span className="xs muted">{r.code}</span>
                        {r.exists ? <VariantStatus status={r.vstatus} /> : <Badge tone="red">Thiếu tệp</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 30 }}><input type="checkbox" className="check" checked={allOnPage} onChange={togglePage} /></th>
                        <th>Tên video</th><th>Concept</th><th>Trạng thái</th><th>Kích thước</th><th>Thời lượng</th><th>Định dạng</th><th className="right">Dung lượng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => {
                        const m = r.manifest_json || {};
                        return (
                          <tr key={r.id} className={r.id === activeId ? "sel" : ""} style={{ cursor: "pointer" }} onClick={() => setActiveId(r.id)}>
                            <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="check" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                            <td>
                              <div className="row">
                                <Thumb src={m.thumbnail} ratio="9/16" style={{ width: 32 }} />
                                <div style={{ minWidth: 0 }}><div className="semi ellipsis" style={{ maxWidth: 220 }}>{m.caption || r.code}</div><div className="xs muted">{r.code}</div></div>
                              </div>
                            </td>
                            <td><Badge tone="purple">{r.angle_label || "—"}</Badge></td>
                            <td>{r.exists ? <VariantStatus status={r.vstatus} /> : <Badge tone="red">Thiếu tệp</Badge>}</td>
                            <td className="small">{m.resolution?.replace("x", " × ") || "—"}</td>
                            <td className="small">{ms(m.duration_ms)}</td>
                            <td className="small">MP4{m.encoder ? ` (${m.encoder})` : ""}</td>
                            <td className="small right">{bytes(r.size_bytes)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {filtered.length > 0 && (
                <div className="row between small t2">
                  <span>
                    Hiển thị {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, filtered.length)} trên {filtered.length} video
                    {sel.size > 0 && <> · <b className="c-primary">Đã chọn {sel.size}</b> <span className="link" onClick={() => setSel(new Set())}>Bỏ chọn</span></>}
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    {view === "grid" && <button className="btn xs" onClick={togglePage}>{allOnPage ? "Bỏ chọn trang" : "Chọn cả trang"}</button>}
                    <button className="btn xs icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={13} /></button>
                    <span>{page} / {pages}</span>
                    <button className="btn xs icon" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Trang sau"><ChevronRight size={13} /></button>
                  </div>
                </div>
              )}
            </div>

            {/* ---------------- chi tiết */}
            <DetailPanel row={active} onOpenFolder={openFolder} />
          </div>
        </>
      )}
    </Async>
  );
}

function FolderTreeView({ rows, node, setNode }: { rows: Row[]; node: Node; setNode: (n: Node) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ campaign: true, angle: true, date: true });
  const groups: Array<{ kind: Node["kind"]; label: string; icon: JSX.Element; items: Array<[string, number]> }> = [
    { kind: "campaign", label: "Theo chiến dịch", icon: <Folder size={14} />, items: countBy(rows, (r) => r.campaign) },
    { kind: "angle", label: "Theo góc nội dung", icon: <Folder size={14} />, items: countBy(rows, (r) => r.angle_label) },
    { kind: "date", label: "Theo ngày xuất", icon: <CalendarDays size={14} />, items: countBy(rows, (r) => day(r.created_at)).sort((a, b) => b[0].localeCompare(a[0])) },
  ];
  const item = (on: boolean, label: string, n: number, onClick: () => void, icon: JSX.Element, indent = 0) => (
    <div key={label} onClick={onClick} className="row small" style={{
      padding: "6px 8px", paddingLeft: 8 + indent, borderRadius: 7, cursor: "pointer",
      background: on ? "var(--primary-soft)" : undefined, color: on ? "#d6caff" : "var(--text-2)",
    }}>
      <span className="c-orange" style={{ display: "flex" }}>{icon}</span>
      <span className="grow ellipsis">{label}</span>
      <span className="xs muted">({n})</span>
    </div>
  );
  return (
    <div className="col" style={{ gap: 2 }}>
      {item(node.kind === "all", "Tất cả video", rows.length, () => setNode({ kind: "all" }), <FolderOpen size={14} />)}
      {groups.map((g) => (
        <div key={g.kind}>
          <div className="row small semi" style={{ padding: "6px 4px", cursor: "pointer" }} onClick={() => setOpen((o) => ({ ...o, [g.kind]: !o[g.kind] }))}>
            {open[g.kind] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {g.label}
          </div>
          {open[g.kind] && (g.items.length
            ? g.items.map(([v, n]) => item(node.kind === g.kind && node.value === v, v, n, () => setNode({ kind: g.kind, value: v }), g.icon, 16))
            : <div className="xs muted" style={{ paddingLeft: 24 }}>Trống</div>)}
        </div>
      ))}
    </div>
  );
}

function SafeDeleteCard() {
  const { toast, toastError } = useApp();
  const st = useApi<any>("/system/storage", undefined, 30000);
  const [confirm, setConfirm] = useState(false);
  const d = st.data;
  const cache = d ? (d.work || 0) + (d.voice || 0) : 0;
  async function clean() {
    try {
      const r = await api.post("/system/cleanup", undefined, { target: "cache" });
      st.setData(r);
      toast({ kind: "success", title: "Đã dọn cache", body: `Giải phóng khoảng ${bytes(cache)}` });
      setConfirm(false);
      return true;
    } catch (e) {
      toastError(e, "Dọn cache thất bại");
    }
  }
  return (
    <Card title="Chính sách xóa an toàn" icon={<ShieldCheck size={16} className="c-orange" />}>
      <div className="col small" style={{ gap: 8 }}>
        <div className="row" style={{ alignItems: "flex-start" }}><Check size={14} className="c-teal" style={{ flexShrink: 0, marginTop: 2 }} /><span className="t2"><b>Xóa cache:</b> xóa tệp tạm (work, giọng đọc tạm), có thể tạo lại. Không ảnh hưởng video gốc/thành phẩm.</span></div>
        <div className="row" style={{ alignItems: "flex-start" }}><X size={14} className="c-red" style={{ flexShrink: 0, marginTop: 2 }} /><span className="t2"><b>Xóa master:</b> chưa hỗ trợ trong ứng dụng – xóa thủ công trong Finder nếu cần.</span></div>
      </div>
      <div className="divider" />
      <Async q={st}>
        {(s) => (
          <div className="kv small" style={{ gridTemplateColumns: "1fr auto", gap: "5px 8px" }}>
            <span>Video thành phẩm</span><b>{bytes(s.output)}</b>
            <span>Tư liệu gốc</span><b>{bytes(s.media)}</b>
            <span>Proxy</span><b>{bytes(s.proxy)}</b>
            <span>Cache (work + giọng)</span><b>{bytes((s.work || 0) + (s.voice || 0))}</b>
            <span>Mô hình AI</span><b>{bytes(s.models)}</b>
            <span>Ổ đĩa còn trống</span><b className="c-teal">{s.disk_free_gb?.toFixed(1)} GB</b>
          </div>
        )}
      </Async>
      <div className="col mt12" style={{ gap: 8 }}>
        <Btn kind="orange" icon={<Trash2 size={14} />} onClick={() => setConfirm(true)} disabled={!d}>Dọn cache{d ? ` (${bytes(cache)})` : ""}</Btn>
        <Btn kind="danger" icon={<Trash2 size={14} />} disabled title="Backend chưa hỗ trợ xóa video thành phẩm (master)">Xóa master</Btn>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Dọn cache?"
        footer={<><button className="btn ghost" onClick={() => setConfirm(false)}>Huỷ</button><Btn kind="orange" icon={<Trash2 size={14} />} onClick={clean}>Dọn cache</Btn></>}>
        <div className="small t2">
          Thao tác sẽ xóa toàn bộ tệp trong thư mục <b>work</b> và <b>giọng đọc tạm</b> (khoảng {bytes(cache)}). Video gốc, proxy và video thành phẩm không bị ảnh hưởng.
          Giọng đọc sẽ được tạo lại khi render lần sau.
        </div>
      </Modal>
    </Card>
  );
}

function DetailPanel({ row, onOpenFolder }: { row?: Row; onOpenFolder: (p?: string) => Promise<unknown> }) {
  const { toast } = useApp();
  const [tab, setTab] = useState("info");
  if (!row) {
    return <Card title="Chi tiết video"><div className="small muted">Chọn một video để xem chi tiết.</div></Card>;
  }
  const m = row.manifest_json || {};
  const copy = (t: string) => {
    navigator.clipboard?.writeText(t).then(
      () => toast({ kind: "success", title: "Đã sao chép" }),
      () => toast({ kind: "warn", title: "Không sao chép được" }),
    );
  };
  const derivs: Array<{ label: string; path?: string; icon: JSX.Element; size?: string }> = [
    { label: "Video MP4 (master)", path: row.output_uri, icon: <FileVideo size={15} />, size: bytes(row.size_bytes) },
    { label: "Phụ đề SRT", path: m.srt, icon: <FileText size={15} /> },
    { label: "Thumbnail (JPG)", path: m.thumbnail, icon: <ImageIcon size={15} /> },
    { label: "Manifest JSON", path: jsonPath(row.output_uri), icon: <FileJson size={15} /> },
  ];
  return (
    <Card title="Chi tiết video" style={{ position: "sticky", top: 0 }}>
      {row.exists ? (
        <video key={row.id} className="video-player" style={{ maxHeight: 300 }} controls preload="metadata" poster={fileUrl(m.thumbnail)} src={fileUrl(row.output_uri)} />
      ) : (
        <Empty title="Không tìm thấy tệp video">Tệp đã bị di chuyển hoặc xoá khỏi ổ đĩa.</Empty>
      )}
      <div className="row between mt12" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="bold" style={{ fontSize: 15 }}>{m.caption || row.code}</div>
          <div className="xs muted mt8">{row.code} · MP4 · {m.resolution?.replace("x", " × ") || "—"} · {bytes(row.size_bytes)}</div>
        </div>
        <VariantStatus status={row.vstatus} />
      </div>
      <div className="mt12">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: "info", label: "Thông tin" }, { id: "deriv", label: "Tài sản dẫn xuất" }]} />
      </div>
      {tab === "info" ? (
        <div className="kv small" style={{ gridTemplateColumns: "92px 1fr" }}>
          <span>Concept</span><span>{row.angle_label || "—"}{m.concept?.duration ? ` · ${m.concept.duration}s` : ""}</span>
          <span>Chiến dịch</span><span>{row.campaign}</span>
          <span>Kịch bản</span><span>{m.script_version ? `v${m.script_version}` : "—"}{m.script_engine ? ` · ${m.script_engine}` : ""}</span>
          <span>Giọng đọc</span><span>{m.synthetic_media?.ai_voice ? "Giọng AI tổng hợp (cần disclosure)" : "—"}</span>
          <span>Codec</span><span>H.264{m.encoder ? ` · ${m.encoder}` : ""}</span>
          <span>Thời lượng</span><span>{ms(m.duration_ms)}</span>
          <span>Đường dẫn</span>
          <span className="row" style={{ gap: 4, minWidth: 0 }}>
            <span className="mono ellipsis xs" title={row.output_uri}>{fileName(row.output_uri)}</span>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => copy(row.output_uri)} title="Sao chép đường dẫn"><Copy size={12} /></button>
          </span>
          <span>Thời gian tạo</span><span>{dt(row.created_at)}</span>
          <span>SHA-256</span>
          <span className="row" style={{ gap: 4, minWidth: 0 }}>
            <span className="mono ellipsis xs" title={m.sha256}>{m.sha256 ? `${m.sha256.slice(0, 20)}…` : "—"}</span>
            {m.sha256 && <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => copy(m.sha256)} title="Sao chép checksum"><Copy size={12} /></button>}
          </span>
        </div>
      ) : (
        <div className="col" style={{ gap: 6 }}>
          {derivs.map((d) => (
            <div key={d.label} className="row inner" style={{ padding: "8px 10px" }}>
              <span className="c-primary" style={{ display: "flex" }}>{d.icon}</span>
              <span className="grow small">{d.label}</span>
              {d.size && <span className="xs muted">{d.size}</span>}
              {d.path ? (
                <a className="icon-btn" style={{ width: 26, height: 26 }} href={fileUrl(d.path)} download={fileName(d.path)} title={`Tải ${fileName(d.path)}`}><Download size={14} /></a>
              ) : <span className="xs muted">—</span>}
            </div>
          ))}
          <div className="xs muted">Tệp dẫn xuất được tạo khi render final; nếu thiếu, liên kết tải sẽ báo lỗi.</div>
        </div>
      )}
      <div className="row mt16">
        <Btn kind="primary" className="grow" icon={<FolderOpen size={15} />} onClick={() => onOpenFolder(row.output_uri)}>Mở thư mục chứa</Btn>
        <Btn kind="danger" icon={<Trash2 size={15} />} disabled title="Backend chưa hỗ trợ xóa video thành phẩm">Xóa</Btn>
      </div>
    </Card>
  );
}
