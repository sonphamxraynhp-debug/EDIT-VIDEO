import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, Bell, Brain, ChevronDown, ChevronRight, Clapperboard, Folder, Home, Image, Layers, Library, Play, Search,
  Settings, ShieldCheck, Sparkles, Wand2, X,
 Newspaper, Music2, Factory, Palette } from "lucide-react";
import { useApp } from "../lib/store";
import { Bar } from "./ui";
import { HelpButton, TourProvider } from "./Tour";

export interface Screen {
  path: string;
  label: string;
}

interface NavGroup {
  label: string;
  icon: ReactNode;
  path?: string;
  children?: Screen[];
}

/** Người mới chỉ cần 4 mục này; phần còn lại nằm trong nhóm "Nâng cao" gập sẵn. */
const NAV_BASIC: NavGroup[] = [
  { label: "Bắt đầu", icon: <Play size={18} />, path: "/" },
  { label: "Tạo video", icon: <Wand2 size={18} />, path: "/flow" },
  { label: "Tin tức", icon: <Newspaper size={18} />, path: "/news" },
  { label: "Sản xuất hàng loạt", icon: <Factory size={18} />, path: "/batch" },
  { label: "Phong cách & phụ đề", icon: <Palette size={18} />, path: "/looks" },
  { label: "Thư viện nhạc", icon: <Music2 size={18} />, path: "/music" },
  { label: "Dự án", icon: <Folder size={18} />, path: "/projects" },
  { label: "Video đã xuất", icon: <Library size={18} />, path: "/library" },
];

const NAV_ADVANCED: NavGroup[] = [
  { label: "Tổng quan", icon: <Home size={18} />, path: "/overview" },
  { label: "Tư liệu", icon: <Image size={18} />, children: [
    { path: "/media", label: "Nguồn video" },
    { path: "/media/analyze", label: "AI phân tích video" },
  ] },
  { label: "Product Brain", icon: <Brain size={18} />, path: "/brain" },
  { label: "AI Sáng tạo", icon: <Sparkles size={18} />, children: [
    { path: "/creative/strategy", label: "Chiến lược nội dung" },
    { path: "/creative/matrix", label: "Ma trận sáng tạo" },
    { path: "/creative/scripts", label: "Nhà máy kịch bản" },
    { path: "/creative/storyboard", label: "Storyboard AI" },
    { path: "/creative/voice", label: "Phòng thu giọng đọc" },
    { path: "/creative/templates", label: "Thư viện mẫu video" },
  ] },
  { label: "Sản xuất", icon: <Clapperboard size={18} />, children: [
    { path: "/production/editor", label: "Smart Video Editor" },
    { path: "/production/motion", label: "Motion & Effects" },
    { path: "/production/subtitles", label: "Subtitle Studio" },
    { path: "/production/batch", label: "Sản xuất hàng loạt" },
    { path: "/production/queue", label: "Render Queue" },
  ] },
  { label: "Kiểm duyệt", icon: <ShieldCheck size={18} />, children: [
    { path: "/review/qc", label: "Kiểm định nội dung" },
    { path: "/review/batch", label: "Duyệt video hàng loạt" },
  ] },
  { label: "Phân tích", icon: <BarChart3 size={18} />, path: "/analytics" },
  { label: "Hệ thống", icon: <Settings size={18} />, children: [
    { path: "/settings", label: "Cài đặt hệ thống" },
    { path: "/system/hardware", label: "Tối ưu phần cứng" },
    { path: "/system/models", label: "Quản lý mô hình AI" },
    { path: "/system/brand", label: "Nhận diện thương hiệu" },
  ] },
];

export const NAV: NavGroup[] = [...NAV_BASIC, ...NAV_ADVANCED];
const ADVANCED_PATHS = NAV_ADVANCED.flatMap((g) => (g.children ? g.children.map((c) => c.path) : [g.path!]));

const ALL: Screen[] = NAV.flatMap((g) => (g.children ? g.children : [{ path: g.path!, label: g.label }]));

function screenOf(pathname: string): Screen | undefined {
  return [...ALL].sort((a, b) => b.path.length - a.path.length).find((s) => (s.path === "/" ? pathname === "/" : pathname.startsWith(s.path)));
}

function Sidebar() {
  const loc = useLocation();
  const { hw, health } = useApp();
  const live = hw?.live;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const inAdvanced = ADVANCED_PATHS.some((p) => loc.pathname.startsWith(p));
  const [adv, setAdv] = useState<boolean>(() => { try { return localStorage.getItem("avf.nav.adv") === "1"; } catch { return false; } });
  const showAdv = adv || inAdvanced;
  const toggleAdv = () => { const v = !showAdv; setAdv(v); try { localStorage.setItem("avf.nav.adv", v ? "1" : "0"); } catch { /* bỏ qua */ } };
  const renderGroup = (g: NavGroup) => {
    if (!g.children)
      return (
        <NavLink key={g.label} to={g.path!} end={g.path === "/"} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          {g.icon}
          {g.label}
        </NavLink>
      );
    const activeGroup = g.children.some((c) => loc.pathname.startsWith(c.path));
    const isOpen = open[g.label] ?? activeGroup;
    return (
      <div key={g.label}>
        <div className={`nav-item ${activeGroup && !isOpen ? "active" : ""}`} onClick={() => setOpen({ ...open, [g.label]: !isOpen })}>
          {g.icon}
          <span className="grow">{g.label}</span>
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        {isOpen && (
          <div className="nav-sub">
            {g.children.map((c) => (
              <NavLink key={c.path} to={c.path} end className={({ isActive }) => (isActive || (c.path !== "/media" && loc.pathname.startsWith(c.path)) ? "active" : "")}>
                {c.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  };
  return (
    <aside className="sidebar">
      <Link to="/" className="brand">
        <div className="brand-logo">
          <Play size={18} fill="#fff" color="#fff" />
        </div>
        <div>
          <div className="brand-name">AI VIDEO FACTORY</div>
          <div className="brand-sub">Local AI Video Studio</div>
        </div>
      </Link>
      {NAV_BASIC.map(renderGroup)}
      <div className="nav-item nav-adv" onClick={toggleAdv} title="Các màn chỉnh sâu từng khâu, dành cho người đã quen">
        <Settings size={18} />
        <span className="grow">Nâng cao</span>
        {showAdv ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>
      {showAdv && NAV_ADVANCED.map(renderGroup)}
      <div className="side-foot">
        <div className="res-card">
          <div className="row small semi" style={{ color: health?.llm ? "var(--teal)" : "var(--orange)" }}>
            <span className="dot" /> {health ? (health.llm ? "AI trên máy đã sẵn sàng" : "AI viết kịch bản chưa bật") : "Đang kết nối…"}
          </div>
          <div className="xs muted" style={{ marginTop: 2 }}>Xử lý nội bộ · Không dùng cloud</div>
          <div className="res-row"><span>CPU</span><span>{live ? `${Math.round(live.cpu_pct)}%` : "—"}</span></div>
          <Bar value={live?.cpu_pct ?? 0} tone="teal" thin />
          <div className="res-row"><span>RAM</span><span>{live ? `${live.ram_used_gb} / ${live.ram_total_gb} GB` : "—"}</span></div>
          <Bar value={live?.ram_pct ?? 0} tone="purple" thin />
          <div className="res-row"><span>Ổ đĩa trống</span><span>{live ? `${live.disk_free_gb} GB` : "—"}</span></div>
          <Bar value={live ? 100 - (live.disk_free_gb / live.disk_total_gb) * 100 : 0} tone="cyan" thin />
        </div>
      </div>
    </aside>
  );
}

function ProjectSwitcher() {
  const { projects, project, setProjectId } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn ghost sm" onClick={() => setOpen(!open)} style={{ color: "var(--text-2)" }}>
        {project?.name || "Chọn dự án"} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="card" style={{ position: "absolute", top: 34, left: 0, zIndex: 30, width: 280, padding: 6, maxHeight: 320, overflow: "auto" }}>
          {projects.map((p) => (
            <div key={p.id} className={`list-item ${p.id === project?.id ? "on" : ""}`} style={{ marginBottom: 4 }} onClick={() => { setProjectId(p.id); setOpen(false); }}>
              <div className="grow">
                <div className="semi ellipsis">{p.name}</div>
                <div className="xs muted">{p.product?.name || "Chưa có sản phẩm"} · {p.completed}/{p.target} video</div>
              </div>
            </div>
          ))}
          {!projects.length && <div className="small muted" style={{ padding: 10 }}>Chưa có dự án</div>}
        </div>
      )}
    </div>
  );
}

function Topbar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { hw, health, project } = useApp();
  const screen = screenOf(loc.pathname);
  const [q, setQ] = useState("");
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inp.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const results = q
    ? ALL.filter((s) => s.label.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];
  const live = hw?.live;
  const projectScoped = loc.pathname !== "/" && !loc.pathname.startsWith("/projects") && !loc.pathname.startsWith("/settings") && !loc.pathname.startsWith("/system");
  return (
    <header className="topbar">
      <div className="crumbs">
        <Home size={15} />
        {projectScoped && (
          <>
            <span>/</span>
            <Link to="/projects">Dự án</Link>
            <ChevronRight size={13} />
            <ProjectSwitcher />
            <ChevronRight size={13} />
          </>
        )}
        {!projectScoped && <span>/</span>}
        <b>{screen?.label || "Tổng quan"}</b>
        {project && !projectScoped && loc.pathname.startsWith("/system") && <span className="muted small">· {project.name}</span>}
      </div>
      <div className="search" style={{ position: "relative" }}>
        <Search size={15} />
        <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm màn hình, dự án, video, kịch bản…"
          onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { nav(results[0].path); setQ(""); } if (e.key === "Escape") setQ(""); }} />
        {q ? <X size={14} style={{ cursor: "pointer" }} onClick={() => setQ("")} /> : <span className="kbd">Ctrl K</span>}
        {results.length > 0 && (
          <div className="card" style={{ position: "absolute", top: 40, left: 0, right: 0, zIndex: 40, padding: 6 }}>
            {results.map((r) => (
              <div key={r.path} className="list-item" style={{ marginBottom: 4 }} onClick={() => { nav(r.path); setQ(""); }}>
                <Layers size={14} className="c-primary" /> {r.label}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={`ai-ready ${health?.llm ? "" : "off"}`} title={health?.llm ? "AI viết kịch bản đã sẵn sàng" : "AI viết kịch bản chưa bật: đang dùng mẫu có sẵn"}>
        <span className="dot" /> {health?.llm ? "AI sẵn sàng" : "AI hạn chế"}
      </div>
      <div className="hw-mini">
        <span>CPU <b>{live ? `${Math.round(live.cpu_pct)}%` : "—"}</b></span>
        <span>RAM <b>{live ? `${live.ram_used_gb}/${live.ram_total_gb} GB` : "—"}</b></span>
      </div>
      <HelpButton />
      <button className="icon-btn" title="Hoạt động gần đây" onClick={() => nav("/production/queue")}>
        <Bell size={17} />
      </button>
      <div className="avatar" title="Admin (Owner)">AD</div>
    </header>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useApp();
  const nav = useNavigate();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <div className="row between">
            <b>{t.title}</b>
            <X size={14} style={{ cursor: "pointer" }} onClick={() => dismiss(t.id)} />
          </div>
          {t.body && <div className="small t2 mt8">{t.body}</div>}
          {t.code && <div className="xs mono muted mt8">Mã lỗi: {t.code}</div>}
          {t.hint && <div className="small mt8" style={{ color: "#ffd38a" }}>Cách khắc phục: {t.hint}</div>}
          {t.kind === "error" && (
            <button className="btn xs ghost mt8" onClick={() => nav("/settings?tab=logs")}>Xem log</button>
          )}
        </div>
      ))}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <TourProvider>
      <div className="app">
        <Sidebar />
        <div className="main">
          <Topbar />
          <main className="content">{children}</main>
        </div>
        <Toasts />
      </div>
    </TourProvider>
  );
}
