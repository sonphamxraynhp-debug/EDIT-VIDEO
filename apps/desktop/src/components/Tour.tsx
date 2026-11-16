import { createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, CheckCircle2, Circle, CircleHelp, Compass, ListChecks, X } from "lucide-react";
import { api, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { MAIN_TOUR, screenTour, TOUR_VERSION, TourStep, TourTarget } from "../lib/tour";

/** Tutorial trong app: tour làm quen tự mở lần đầu, hướng dẫn riêng từng màn, checklist tiến độ dự án.
 *  Trạng thái "đã xem tour" lưu ở settings (bền qua cài đặt lại webview), URL ?tour=off tắt, ?tour=1 bật lại. */

interface TourCtx {
  start: (steps?: TourStep[], at?: number) => void;
  startScreen: () => void;
  openChecklist: () => void;
}

const Ctx = createContext<TourCtx>({ start: () => {}, startScreen: () => {}, openChecklist: () => {} });
export const useTour = () => useContext(Ctx);

function visible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function findTarget(t?: TourTarget): HTMLElement | null {
  if (!t) return null;
  let el: Element | null = null;
  if (t.sel) el = Array.from(document.querySelectorAll(t.sel)).find(visible) ?? null;
  if (!el && t.text) {
    const want = t.text.toLowerCase();
    el = Array.from(document.querySelectorAll(".card-title, .page-title, button, h1, h2, h3, .label"))
      .find((e) => visible(e) && (e.textContent || "").trim().toLowerCase().startsWith(want)) ?? null;
  }
  if (el && t.closest) el = el.closest(t.closest) ?? el;
  return el as HTMLElement | null;
}

type Box = { top: number; left: number; width: number; height: number };

export function TourProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [i, setI] = useState(0);
  const [checklist, setChecklist] = useState(false);
  const isMain = steps === MAIN_TOUR;

  const start = useCallback((s: TourStep[] = MAIN_TOUR, at = 0) => {
    setChecklist(false);
    setSteps(s);
    setI(Math.max(0, Math.min(at, s.length - 1)));
  }, []);
  const startScreen = useCallback(() => start(screenTour(loc.pathname)), [loc.pathname, start]);

  // Lần đầu mở app: tự chạy tour (trừ khi URL ?tour=off); ?tour=1[&tourstep=n] luôn chạy
  const autoChecked = useRef(false);
  useEffect(() => {
    if (autoChecked.current) return;
    autoChecked.current = true;
    const qs = new URLSearchParams(window.location.search);
    const flag = qs.get("tour");
    if (flag === "off") return;
    if (flag === "1") {
      start(MAIN_TOUR, Number(qs.get("tourstep") || 0));
      return;
    }
    // Không tự chạy: màn Bắt đầu đã đủ dẫn đường; tour các màn nâng cao mở từ nút trợ giúp
  }, [start]);

  const finish = useCallback((completed: boolean) => {
    if (isMain) {
      api.put("/settings", { tutorial: { done: true, version: TOUR_VERSION, completed, at: new Date().toISOString() } }).catch(() => {});
    }
    setSteps(null);
    if (isMain && completed) setChecklist(true);
  }, [isMain]);

  const step = steps?.[i];
  // chuyển màn theo bước
  useEffect(() => {
    if (step?.path && step.path !== loc.pathname) nav(step.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <Ctx.Provider value={{ start, startScreen, openChecklist: () => setChecklist(true) }}>
      {children}
      {steps && step && (
        <TourOverlay key={`${i}-${step.title}`} step={step} index={i} total={steps.length} mainTour={isMain}
          onBack={() => setI((x) => Math.max(0, x - 1))}
          onNext={() => (i + 1 >= steps.length ? finish(true) : setI(i + 1))}
          onClose={() => finish(false)} />
      )}
      {checklist && <Checklist onClose={() => setChecklist(false)} onTour={() => start(MAIN_TOUR)} />}
    </Ctx.Provider>
  );
}

function TourOverlay({ step, index, total, mainTour, onBack, onNext, onClose }: {
  step: TourStep; index: number; total: number; mainTour: boolean; onBack: () => void; onNext: () => void; onClose: () => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [searching, setSearching] = useState(!!step.target);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // chờ phần tử xuất hiện (màn lazy-load, dữ liệu đang tải), tối đa ~3s rồi hiện giữa màn
  useEffect(() => {
    if (!step.target) return;
    let tries = 0;
    let el: HTMLElement | null = null;
    const measure = () => {
      if (!el || !el.isConnected) el = findTarget(step.target);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
      return true;
    };
    const poll = window.setInterval(() => {
      tries += 1;
      if (measure()) {
        window.clearInterval(poll);
        setSearching(false);
        el?.scrollIntoView({ block: "center", behavior: "auto" });
        measure();
        window.setTimeout(measure, 300);
      } else if (tries > 30) {
        window.clearInterval(poll);
        setSearching(false);
      }
    }, 100);
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [step]);

  // đặt popover cạnh vùng sáng: dưới → trên → phải → trái, luôn nằm trong cửa sổ
  useLayoutEffect(() => {
    const p = pop.current;
    if (!p) return;
    const vw = window.innerWidth, vh = window.innerHeight, pw = p.offsetWidth, ph = p.offsetHeight, m = 14;
    if (!box) {
      setPos({ top: Math.max(m, (vh - ph) / 2), left: Math.max(m, (vw - pw) / 2) });
      return;
    }
    const clampX = (x: number) => Math.min(Math.max(m, x), vw - pw - m);
    const clampY = (y: number) => Math.min(Math.max(m, y), vh - ph - m);
    const tall = box.height > vh * 0.6;
    if (!tall && box.top + box.height + m + ph < vh) setPos({ top: box.top + box.height + m, left: clampX(box.left) });
    else if (!tall && box.top - m - ph > 0) setPos({ top: box.top - m - ph, left: clampX(box.left) });
    else if (box.left + box.width + m + pw < vw) setPos({ top: clampY(box.top), left: box.left + box.width + m });
    else if (box.left - m - pw > 0) setPos({ top: clampY(box.top), left: box.left - m - pw });
    else setPos({ top: clampY(box.top + 24), left: clampX(box.left + 24) });
  }, [box, searching]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); onNext(); }
      else if (e.key === "ArrowLeft") onBack();
    };
    window.addEventListener("keydown", h);
    pop.current?.focus();
    return () => window.removeEventListener("keydown", h);
  }, [onBack, onNext, onClose]);

  const pad = 6;
  const last = index + 1 >= total;
  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box ? (
        <div className="tour-hole" style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div ref={pop} tabIndex={-1} className="tour-pop" style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}>
        <div className="row between">
          <span className="tour-kicker"><Compass size={13} /> {mainTour ? "Tour làm quen" : "Hướng dẫn màn này"} · {index + 1}/{total}</span>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="Đóng hướng dẫn"><X size={15} /></button>
        </div>
        <h3 id="tour-title" className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        {step.tips && (
          <ul className="tour-tips">
            {step.tips.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )}
        {total > 1 && (
          <div className="tour-dots" aria-hidden="true">
            {Array.from({ length: total }, (_, k) => <span key={k} className={k === index ? "on" : k < index ? "done" : ""} />)}
          </div>
        )}
        <div className="row between mt12">
          <button className="btn ghost sm" onClick={onClose}>{index === 0 && mainTour ? "Để sau" : "Bỏ qua"}</button>
          <div className="row" style={{ gap: 8 }}>
            {index > 0 && <button className="btn sm" onClick={onBack}>Quay lại</button>}
            <button className="btn primary sm" onClick={onNext}>{last ? "Hoàn tất" : index === 0 && mainTour ? "Bắt đầu tour" : "Tiếp"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Checklist({ onClose, onTour }: { onClose: () => void; onTour: () => void }) {
  const { projectId, project } = useApp();
  const nav = useNavigate();
  const q = useApi<any>("/onboarding", { project_id: projectId }, 5000);
  const d = q.data;
  return (
    <div className="tour-drawer" role="dialog" aria-label="Checklist bắt đầu">
      <div className="row between">
        <div className="card-title"><ListChecks size={16} className="c-primary" /> Checklist bắt đầu</div>
        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="Đóng checklist"><X size={15} /></button>
      </div>
      <div className="xs muted mt8">{project ? <>Dự án <b className="t2">{project.name}</b></> : "Chưa có dự án nào"}</div>
      {d && (
        <>
          <div className="row between mt12 small"><span className="t2">Tiến độ</span><b>{d.done}/{d.total}</b></div>
          <div className="tour-progress"><span style={{ width: `${(d.done / d.total) * 100}%` }} /></div>
          <div className="tour-list">
            {d.steps.map((s: any) => {
              const isNext = d.next?.key === s.key;
              return (
                <button key={s.key} className={`tour-item ${s.done ? "done" : ""} ${isNext ? "next" : ""}`} onClick={() => { nav(s.path); onClose(); }}>
                  {s.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  <span className="grow">{s.label}</span>
                  {isNext && <span className="tour-next">Làm tiếp</span>}
                </button>
              );
            })}
          </div>
          {d.done === d.total && <div className="small c-teal mt12">Bạn đã đi hết quy trình một vòng. Lô kế tiếp tạo ở màn Phân tích.</div>}
        </>
      )}
      <div className="row mt16" style={{ gap: 8 }}>
        <button className="btn sm" onClick={onTour}><Compass size={14} /> Xem lại tour</button>
      </div>
    </div>
  );
}

/** Nút trợ giúp ở thanh trên cùng: tour, hướng dẫn màn này, checklist (kèm tiến độ). */
export function HelpButton() {
  const { start, startScreen, openChecklist } = useTour();
  const { projectId } = useApp();
  const q = useApi<any>("/onboarding", { project_id: projectId }, 30000);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const d = q.data;
  const left = d ? d.total - d.done : 0;
  const pick = (f: () => void) => { setOpen(false); f(); };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="icon-btn" data-tour="help" title="Trợ giúp và hướng dẫn" aria-label="Trợ giúp" onClick={() => setOpen(!open)}>
        <CircleHelp size={18} />
        {left > 0 && <span className="tour-badge">{left}</span>}
      </button>
      {open && (
        <div className="card tour-menu">
          <button className="list-item" onClick={() => pick(() => start(MAIN_TOUR))}><Compass size={15} className="c-primary" /><div><div className="semi">Tour làm quen</div><div className="xs muted">Đi qua quy trình 15 bước, khoảng 3 phút</div></div></button>
          <button className="list-item" onClick={() => pick(startScreen)}><BookOpen size={15} className="c-primary" /><div><div className="semi">Hướng dẫn màn này</div><div className="xs muted">Các phần chính của màn đang mở</div></div></button>
          <button className="list-item" onClick={() => pick(openChecklist)}><ListChecks size={15} className="c-primary" /><div><div className="semi">Checklist bắt đầu</div><div className="xs muted">{d ? `${d.done}/${d.total} bước đã xong${d.next ? ` · tiếp: ${d.next.label}` : ""}` : "Đang tải…"}</div></div></button>
        </div>
      )}
    </div>
  );
}
