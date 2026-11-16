import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, BarChart3, Check, CheckCircle2, FileText, Info, Layers, Megaphone, MessageCircle, Play, Plus, Save, Sparkles, Target, Wand2, GraduationCap, ShoppingCart, Trash2, Clock } from "lucide-react";
import { api, useApi } from "../lib/api";
import { SHOT_TAGS } from "../lib/format";
import { useApp } from "../lib/store";
import { Badge, Btn, Card, Empty, ErrorBox, Field, InfoNote, Loading, NeedProject, PageHead, Select, Toggle, Warn } from "../components/ui";
import { Donut, PALETTE } from "../components/charts";

const GOALS: Array<{ id: string; label: string; sub: string; icon: ReactNode }> = [
  { id: "awareness", label: "Nhận diện", sub: "Tiếp cận khách hàng mới", icon: <Target size={20} /> },
  { id: "education_and_demo", label: "Giáo dục", sub: "Chia sẻ kiến thức hữu ích", icon: <GraduationCap size={20} /> },
  { id: "engagement", label: "Tương tác", sub: "Khơi gợi trao đổi", icon: <MessageCircle size={20} /> },
  { id: "conversion", label: "Chuyển đổi", sub: "Giới thiệu lựa chọn mua", icon: <ShoppingCart size={20} /> },
];

const ANGLE_ICON: Record<string, ReactNode> = {
  how_to: <FileText size={26} />,
  faq: <Info size={26} />,
  demo: <Play size={26} />,
  comparison: <BarChart3 size={26} />,
  mistakes: <AlertTriangle size={26} />,
  feature: <Layers size={26} />,
  brand_story: <Sparkles size={26} />,
  checklist: <Check size={26} />,
  qa: <Target size={26} />,
  tips: <Wand2 size={26} />,
};
const GROUP_TONE: Record<string, any> = { "Giáo dục": "teal", FAQ: "cyan", Demo: "teal", "So sánh": "cyan", "Thông tin": "teal", "Thương hiệu": "purple", "Hướng dẫn": "orange" };
const ASPECTS = [{ value: "9:16", label: "9:16 · Dọc" }, { value: "1:1", label: "1:1 · Vuông" }, { value: "4:5", label: "4:5 · Feed" }, { value: "16:9", label: "16:9 · Ngang" }];

interface Draft {
  product_id: string;
  goal: string;
  creative_angles: string[];
  audiences: string[];
  narratives: string[];
  durations_sec: number[];
  formats: string[];
  aspect: string;
  template_id: string;
  quota_ratio: number;
  seed: number;
  target_count: number;
  platforms: string[];
  industry: string;
  landing_url: string;
  allow_low_source: boolean;
}

export default function Strategy() {
  const { projectId, campaign, project } = useApp();
  return (
    <NeedProject projectId={projectId}>
      {projectId && (project === undefined ? <Loading rows={5} /> : campaign?.id ? <StrategyBody key={campaign.id} cid={campaign.id} projectId={projectId} /> : <NoCampaign projectId={projectId} name={project?.name} />)}
    </NeedProject>
  );
}

function NoCampaign({ projectId, name }: { projectId: string; name?: string }) {
  const { reloadProject, toast, toastError } = useApp();
  async function create() {
    try {
      await api.post("/campaigns", { project_id: projectId, name: name || "Chiến dịch", target_count: 10, brief_json: { aspect: "9:16", durations_sec: [30] } });
      toast({ kind: "success", title: "Đã tạo chiến dịch" });
      reloadProject();
      return true;
    } catch (e) {
      toastError(e, "Không tạo được chiến dịch");
      return undefined;
    }
  }
  return (
    <>
      <PageHead title="Chiến lược nội dung" sub="Lựa chọn mục tiêu, chân dung khách hàng và các góc khai thác có giá trị thực tế." />
      <Empty title="Dự án chưa có chiến dịch" action={<Btn kind="primary" icon={<Plus size={15} />} onClick={create}>Tạo chiến dịch</Btn>}>Chiến dịch lưu brief sáng tạo và ma trận biến thể.</Empty>
    </>
  );
}

function StrategyBody({ cid, projectId }: { cid: string; projectId: string }) {
  const nav = useNavigate();
  const { toast, toastError, reloadProject } = useApp();
  const q = useApi<any>(`/campaigns/${cid}`);
  const products = useApi<any[]>("/products", { project_id: projectId });
  const scale = useApi<any>("/scale/options");
  const templates = useApi<any[]>("/templates");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);

  const c = q.data;
  useEffect(() => {
    if (!c || dirty) return;
    const b = c.brief_json || {};
    setDraft({
      product_id: b.product_id || c.product?.id || "",
      goal: b.goal || "education_and_demo",
      creative_angles: b.creative_angles || [],
      audiences: b.audiences || [],
      narratives: b.narratives || [],
      durations_sec: b.durations_sec || [30],
      formats: b.formats || [],
      aspect: b.aspect || "9:16",
      template_id: b.template_id || "",
      quota_ratio: b.quota_ratio ?? 0.25,
      seed: b.seed ?? 42,
      target_count: c.target_count,
      platforms: b.platforms || ["meta", "tiktok"],
      industry: b.industry || "",
      landing_url: b.landing_url || "",
      allow_low_source: !!b.allow_low_source,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    setDirty(true);
  };
  const toggle = <K extends "creative_angles" | "audiences" | "narratives" | "formats" | "durations_sec" | "platforms">(k: K, v: Draft[K][number]) => {
    if (!draft) return;
    const arr = draft[k] as any[];
    set(k, (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]) as Draft[K]);
  };

  async function save(silent = false) {
    if (!draft || !c) return undefined;
    const brief = {
      ...(c.brief_json || {}),
      product_id: draft.product_id || undefined,
      goal: draft.goal,
      creative_angles: draft.creative_angles,
      audiences: draft.audiences,
      narratives: draft.narratives,
      durations_sec: draft.durations_sec,
      formats: draft.formats,
      aspect: draft.aspect,
      template_id: draft.template_id || undefined,
      quota_ratio: draft.quota_ratio,
      seed: draft.seed,
      platforms: draft.platforms,
      industry: draft.industry || undefined,
      landing_url: draft.landing_url.trim() || undefined,
      allow_low_source: draft.allow_low_source,
      platform_presets: ((c.brief_json?.platform_presets as string[]) || ["tiktok_9_16"]).map((p) => p.replace(/_\d+_\d+$/, "") + "_" + draft.aspect.replace(":", "_")),
    };
    try {
      const r = await api.put(`/campaigns/${cid}`, { brief_json: brief, target_count: Math.max(1, Math.round(draft.target_count)) });
      setDirty(false);
      q.setData(r);
      reloadProject();
      if (!silent) toast({ kind: "success", title: "Đã lưu chiến lược" });
      return r;
    } catch (e) {
      toastError(e, "Không lưu được chiến lược");
      return undefined;
    }
  }

  async function saveAndMatrix() {
    const r = await save(true);
    if (r) {
      toast({ kind: "success", title: "Đã lưu chiến lược", body: "Chuyển sang Ma trận nội dung." });
      nav("/creative/matrix");
    }
    return r;
  }

  const blockers = useMemo(() => {
    if (!draft) return [];
    const b: string[] = [];
    if (!draft.creative_angles.length) b.push("Chọn ít nhất 1 góc nội dung");
    if (!draft.audiences.length) b.push("Chọn ít nhất 1 nhóm khách hàng");
    if (!draft.durations_sec.length) b.push("Chọn ít nhất 1 thời lượng");
    if (!draft.formats.length) b.push("Chọn ít nhất 1 định dạng");
    return b;
  }, [draft]);

  if (q.loading && !c) return <><PageHead title="Chiến lược nội dung" /><Loading rows={6} /></>;
  if (q.error && !c) return <><PageHead title="Chiến lược nội dung" /><ErrorBox error={q.error} onRetry={q.reload} /></>;
  if (!c || !draft) return null;

  const o = c.options;
  const cov: Record<string, any> = c.angle_coverage;
  const angleKeys = Object.keys(o.angles);
  const feasibleCount = angleKeys.filter((k) => cov[k]?.feasible).length;
  const blockTitle = blockers.join(" · ") || undefined;

  return (
    <>
      <PageHead
        title="Chiến lược nội dung"
        sub="Lựa chọn mục tiêu, chân dung khách hàng và các góc khai thác có giá trị thực tế."
        actions={<Btn kind="primary" size="lg" icon={<Sparkles size={17} />} onClick={saveAndMatrix} disabled={blockers.length > 0} title={blockTitle}>Tạo ma trận nội dung</Btn>}
      />

      <Card title="Thiết lập chiến dịch" right={<Badge tone="cyan">{c.name}</Badge>}>
        <div className="grid g6" style={{ gap: 12 }}>
          <Field label="Sản phẩm (Product Brain)">
            <Select value={draft.product_id} onChange={(v) => set("product_id", v)} options={[{ value: "", label: products.data?.length ? "Sản phẩm đầu tiên" : "Chưa có sản phẩm" }, ...(products.data || []).map((p) => ({ value: p.id, label: `${p.name}${p.locked ? ` · v${p.version} (khoá)` : ""}` }))]} />
          </Field>
          <Field label="Mục tiêu">
            <Select value={draft.goal} onChange={(v) => set("goal", v)} options={GOALS.map((g) => ({ value: g.id, label: g.label }))} />
          </Field>
          <Field label="Khung hình">
            <Select value={draft.aspect} onChange={(v) => set("aspect", v)} options={ASPECTS} />
          </Field>
          <Field label="Template">
            <Select value={draft.template_id} onChange={(v) => set("template_id", v)} options={[{ value: "", label: "Tự chọn theo góc" }, ...(templates.data || []).map((t) => ({ value: t.id, label: t.name }))]} />
          </Field>
          <Field label="Ngân sách nội dung" hint="Số video mục tiêu">
            <input className="input" type="number" min={1} max={5000} value={draft.target_count} onChange={(e) => set("target_count", Number(e.target.value))} />
          </Field>
          <Field label={`Tối đa mỗi góc: ${Math.round(draft.quota_ratio * 100)}%`} hint={`≈ ${Math.max(1, Math.ceil(draft.target_count * draft.quota_ratio))} video / góc`}>
            <input type="range" className="range" min={0.1} max={1} step={0.05} value={draft.quota_ratio} onChange={(e) => set("quota_ratio", Number(e.target.value))} style={{ marginTop: 10 }} />
          </Field>
        </div>
        <div className="grid g4 mt16" style={{ gap: 14 }}>
          <ChipGroup label="Nhóm khách hàng" items={Object.entries(o.audiences).map(([k, l]) => ({ k, l: l as string }))} on={draft.audiences} onToggle={(k) => toggle("audiences", k)} />
          <ChipGroup label="Thông điệp / mạch kể" items={Object.entries(o.narratives).map(([k, l]) => ({ k, l: l as string }))} on={draft.narratives} onToggle={(k) => toggle("narratives", k)} hint={draft.narratives.length ? undefined : "Để trống = dùng tất cả"} />
          <ChipGroup label="Thời lượng" items={(o.durations as number[]).map((d) => ({ k: d, l: `${d} giây` }))} on={draft.durations_sec} onToggle={(k) => toggle("durations_sec", k as number)} />
          <ChipGroup label="Định dạng" items={Object.entries(scale.data?.formats || o.formats).map(([k, l]) => ({ k, l: l as string }))} on={draft.formats} onToggle={(k) => toggle("formats", k)} />
        </div>
        <div className="grid g4 mt16" style={{ gap: 14, alignItems: "start" }}>
          <ChipGroup label="Nền tảng" items={Object.entries(scale.data?.platforms || { meta: "Facebook / Instagram", tiktok: "TikTok" }).map(([k, l]) => ({ k, l: l as string }))} on={draft.platforms} onToggle={(k) => toggle("platforms", k)} />
          <Field label="Ngành hàng" hint="Để trống = tự nhận diện">
            <Select value={draft.industry} onChange={(v) => set("industry", v)} options={[{ value: "", label: "Tự nhận diện" }, ...Object.entries(scale.data?.industries || {}).map(([k, l]) => ({ value: k, label: l as string }))]} />
          </Field>
          <Field label="Landing URL">
            <input className="input" type="text" placeholder="https://…" value={draft.landing_url} onChange={(e) => set("landing_url", e.target.value)} />
          </Field>
          <div>
            <div className="label mb8">Cho phép ít nguồn (không khuyến nghị)</div>
            <Toggle on={draft.allow_low_source} onChange={(v) => set("allow_low_source", v)} />
            <div className="xs c-orange mt8"><AlertTriangle size={11} /> Ít nguồn video/cảnh quay sẽ khiến các video trông giống nhau.</div>
          </div>
        </div>
      </Card>

      <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0,.85fr) minmax(0,2.6fr) minmax(0,1.15fr)", alignItems: "start" }}>
        <Card title="Mục tiêu chiến dịch">
          <div className="col">
            {GOALS.map((g) => (
              <div key={g.id} className={`list-item ${draft.goal === g.id ? "on" : ""}`} style={{ padding: 12 }} onClick={() => set("goal", g.id)}>
                <div style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--primary-soft)", color: "var(--primary-2)", flexShrink: 0 }}>{g.icon}</div>
                <div><div className="semi">{g.label}</div><div className="xs muted">{g.sub}</div></div>
              </div>
            ))}
            <InfoNote>Các nội dung phải bám sát bằng chứng trong Product Brain ({c.approved_claims} tuyên bố đã duyệt).</InfoNote>
          </div>
        </Card>

        <Card title={`${angleKeys.length} góc nội dung được đề xuất`} right={<span className="small muted">Chọn góc khai thác · đã chọn {draft.creative_angles.length}</span>}>
          <div className="grid g5" style={{ gap: 12 }}>
            {angleKeys.map((k) => {
              const a = o.angles[k];
              const cv = cov[k] || {};
              const on = draft.creative_angles.includes(k);
              return (
                <div
                  key={k}
                  className={`card ${on ? "glow" : "flat"}`}
                  style={{ padding: 10, cursor: "pointer", opacity: cv.feasible ? 1 : 0.75 }}
                  onClick={() => toggle("creative_angles", k)}
                  title={cv.feasible ? "Bấm để chọn / bỏ chọn" : `Thiếu cảnh: ${cv.missing.map((t: string) => SHOT_TAGS[t] || t).join(", ")}`}
                >
                  <div style={{ aspectRatio: "4/3", borderRadius: 10, display: "grid", placeItems: "center", background: `radial-gradient(circle at 50% 50%, ${on ? "rgba(123,86,255,.45)" : "rgba(123,86,255,.18)"}, rgba(9,14,34,.6) 70%)`, border: "1px solid var(--border)", color: on ? "#fff" : "var(--text-2)", position: "relative" }}>
                    {ANGLE_ICON[k] || <Sparkles size={26} />}
                    {on && <CheckCircle2 size={16} className="c-teal" style={{ position: "absolute", top: 6, right: 6 }} />}
                  </div>
                  <div className="row between mt8" style={{ alignItems: "flex-start", gap: 6 }}>
                    <span className="semi small">{a.label}</span>
                    <Badge tone={GROUP_TONE[a.group] || "gray"}>{a.group}</Badge>
                  </div>
                  <div className="xs mt8">
                    {cv.feasible ? <span className="c-teal">Đủ tư liệu{a.needs.length ? ` · cần ${a.needs.map((t: string) => SHOT_TAGS[t] || t).join(", ")}` : ""}</span> : <span className="c-orange">Thiếu: {cv.missing.map((t: string) => SHOT_TAGS[t] || t).join(", ")}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="inner row mt12 small">
            {feasibleCount === angleKeys.length ? <CheckCircle2 size={15} className="c-teal" /> : <AlertTriangle size={15} className="c-orange" />}
            {c.scene_count === 0 ? (
              <span>Chưa có cảnh nào trong thư viện — tất cả góc đều chưa khả thi. <span className="link" onClick={() => nav("/media")}>Nhập & phân tích video</span></span>
            ) : (
              <span>{feasibleCount}/{angleKeys.length} góc khai thác đã có đủ tư liệu minh hoạ (từ {c.scene_count} cảnh chưa bị loại).{feasibleCount < angleKeys.length ? ` ${angleKeys.length - feasibleCount} góc cần quay bổ sung cảnh mới.` : ""}</span>
            )}
          </div>
        </Card>

        <DirectorPanel c={c} draft={draft} />
      </div>

      <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", alignItems: "start" }}>
        <HookLibrary cid={cid} angles={o.angles} />
        <PlanCard cid={cid} initialTarget={draft.target_count} />
      </div>

      <div className="row mt16" style={{ justifyContent: "flex-end" }}>
        {dirty && <span className="small c-orange" style={{ marginRight: "auto" }}><AlertTriangle size={13} /> Có thay đổi chưa lưu</span>}
        {blockers.length > 0 && <span className="small muted">{blockers[0]}</span>}
        <Btn icon={<Save size={15} />} onClick={() => save()} disabled={!dirty} title={dirty ? undefined : "Không có thay đổi"}>Lưu chiến lược</Btn>
        <Btn kind="primary" icon={<ArrowRight size={15} />} onClick={saveAndMatrix} disabled={blockers.length > 0} title={blockTitle}>Tạo ma trận nội dung</Btn>
      </div>
    </>
  );
}

function ChipGroup<T extends string | number>({ label, items, on, onToggle, hint }: { label: string; items: Array<{ k: T; l: string }>; on: T[]; onToggle: (k: T) => void; hint?: string }) {
  return (
    <div>
      <div className="label mb8">{label} <span className="muted">· {on.length || 0} đã chọn</span></div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {items.map((i) => (
          <span key={String(i.k)} className={`chip ${on.includes(i.k) ? "on" : ""}`} onClick={() => onToggle(i.k)}>
            {on.includes(i.k) && <Check size={12} />} {i.l}
          </span>
        ))}
      </div>
      {hint && <div className="xs muted mt8">{hint}</div>}
    </div>
  );
}

/** Ước tính phân bổ: chia đều mục tiêu cho các góc khả thi đã chọn, giới hạn bởi quota (mô phỏng plan_matrix). */
function projectMix(c: any, d: Draft) {
  const feasible = d.creative_angles.filter((k) => c.angle_coverage[k]?.feasible);
  const per: Record<string, number> = {};
  if (!feasible.length || c.approved_claims === 0) return { per, overflow: 0, feasible };
  const quota = Math.max(1, Math.ceil(d.target_count * d.quota_ratio));
  let left = Math.max(0, Math.round(d.target_count));
  let progress = true;
  while (left > 0 && progress) {
    progress = false;
    for (const k of feasible) {
      if (left <= 0) break;
      if ((per[k] || 0) < quota) {
        per[k] = (per[k] || 0) + 1;
        left--;
        progress = true;
      }
    }
  }
  let overflow = 0;
  while (left > 0) {
    for (const k of feasible) {
      if (left <= 0) break;
      per[k] += 1;
      left--;
      overflow++;
    }
  }
  return { per, overflow, feasible };
}

function DirectorPanel({ c, draft }: { c: any; draft: Draft }) {
  const nav = useNavigate();
  const { per, overflow, feasible } = projectMix(c, draft);
  const total = Object.values(per).reduce((a, b) => a + b, 0);
  const byGroup: Record<string, number> = {};
  Object.entries(per).forEach(([k, n]) => {
    const g = c.options.angles[k]?.group || k;
    byGroup[g] = (byGroup[g] || 0) + n;
  });
  const groups = Object.entries(byGroup).sort((a, b) => b[1] - a[1]);
  const data = groups.map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));

  const missingTags = Array.from(new Set(draft.creative_angles.flatMap((k) => c.angle_coverage[k]?.missing || [])));
  const infeasibleSel = draft.creative_angles.filter((k) => !c.angle_coverage[k]?.feasible);
  const combos = Math.max(1, draft.audiences.length) * draft.creative_angles.length * (draft.narratives.length || Object.keys(c.options.narratives).length) * draft.durations_sec.length * Math.max(1, draft.formats.length);
  const warnings: ReactNode[] = [];
  if (c.scene_count === 0) warnings.push(<>Chưa có cảnh quay nào — <span className="link" onClick={() => nav("/media")}>nhập video</span></>);
  missingTags.forEach((t) => warnings.push(<>Cần cảnh quay “{SHOT_TAGS[t] || t}” cho {draft.creative_angles.filter((k) => c.angle_coverage[k]?.missing?.includes(t)).map((k) => c.options.angles[k].label).join(", ")}</>));
  if (c.approved_claims === 0) warnings.push(<>Chưa có tuyên bố đã duyệt — <span className="link" onClick={() => nav("/brain")}>bổ sung Product Brain</span></>);
  if (!c.product) warnings.push(<>Chiến dịch chưa gắn sản phẩm</>);
  if (feasible.length && combos < draft.target_count) warnings.push(<>Chỉ có {combos} tổ hợp lý thuyết, ít hơn mục tiêu {draft.target_count} video</>);

  return (
    <Card title={<><Sparkles size={15} className="c-primary" /> AI Creative Director</>} right={<Badge tone="purple">Kế hoạch ước tính</Badge>}>
      {total === 0 ? (
        <div className="small muted">{draft.creative_angles.length === 0 ? "Chọn góc nội dung để xem phân bổ dự kiến." : infeasibleSel.length === draft.creative_angles.length ? "Các góc đã chọn đều thiếu tư liệu." : "Chưa đủ điều kiện lập kế hoạch (cần tuyên bố đã duyệt)."}</div>
      ) : (
        <div className="row" style={{ gap: 14 }}>
          <Donut data={data} size={128} thickness={18} center={<div><div className="bold" style={{ fontSize: 20 }}>{total}</div><div className="xs muted">video</div></div>} />
          <div className="chart-legend grow">
            {data.map((s) => (
              <div key={s.label} className="legend-row"><span className="legend-dot" style={{ background: s.color }} />{s.label}<b>{Math.round((s.value / total) * 100)}%</b></div>
            ))}
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="inner mt12">
          <div className="semi small mb8">Gợi ý cơ cấu nội dung</div>
          <div className="col" style={{ gap: 6 }}>
            {Object.entries(per).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <div key={k} className="row xs"><Check size={13} className="c-teal" /><span className="grow">{c.options.angles[k].label}</span><b>{n} video · {Math.round((n / total) * 100)}%</b></div>
            ))}
          </div>
          {overflow > 0 && <div className="xs c-orange mt8">{overflow} video vượt quota {Math.round(draft.quota_ratio * 100)}%/góc — nên chọn thêm góc hoặc tăng quota.</div>}
        </div>
      )}

      <div className="inner mt12" style={{ borderColor: warnings.length ? "rgba(245,165,36,.5)" : undefined }}>
        <div className={`semi small mb8 ${warnings.length ? "c-orange" : "c-teal"}`}>{warnings.length ? <><AlertTriangle size={14} /> Thiếu tư liệu / dữ liệu nguồn</> : <><CheckCircle2 size={14} /> Đủ tư liệu cho các góc đã chọn</>}</div>
        {warnings.length > 0 && <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.6 }} className="xs t2">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      </div>

      <div className="mt12"><InfoNote>Tỷ trọng là kế hoạch ước tính theo quota và các góc khả thi, không phải dự báo hiệu quả nền tảng. Ma trận thật được tính khi tạo ở bước sau.</InfoNote></div>
      <div className="xs muted mt8"><Megaphone size={11} /> Mục tiêu hiện tại: {GOALS.find((g) => g.id === draft.goal)?.label || draft.goal}</div>
    </Card>
  );
}


function HookLibrary({ cid, angles }: { cid: string; angles: Record<string, any> }) {
  const { toast, toastError } = useApp();
  const q = useApi<any>(`/campaigns/${cid}/hooks`);
  const [n, setN] = useState(10);
  const [text, setText] = useState("");
  const [rejected, setRejected] = useState<Record<string, number> | null>(null);
  const reuseMax = q.data?.reuse_max;

  async function generate() {
    try {
      const r = await api.post(`/campaigns/${cid}/hooks/generate`, { n: Math.max(1, Math.round(n) || 1), use_llm: true });
      setRejected(r.rejected || {});
      toast({ kind: "success", title: `Đã sinh ${r.created} hook`, body: `Tổng ${r.total_active} hook đang dùng` });
      q.reload();
      return true;
    } catch (e) {
      toastError(e, "Không sinh được hook");
      return undefined;
    }
  }
  async function add() {
    if (!text.trim()) return undefined;
    try {
      await api.post(`/campaigns/${cid}/hooks`, { text: text.trim() });
      setText("");
      toast({ kind: "success", title: "Đã thêm hook" });
      q.reload();
      return true;
    } catch (e) {
      const b = (e as any)?.body;
      const det = b?.details && Object.keys(b.details).length ? ` (${Object.entries(b.details).map(([k, v]) => `${k}: ${String(v)}`).join(", ")})` : "";
      toastError(b ? Object.assign(e as object, { body: { ...b, message: b.message + det } }) : e, "Không thêm được hook");
      return undefined;
    }
  }
  async function remove(id: string) {
    try {
      await api.del(`/hooks/${id}`);
      q.reload();
    } catch (e) {
      toastError(e, "Không xoá được hook");
    }
  }

  const items: any[] = q.data?.items || [];
  return (
    <Card title="Thư viện hook" right={<Badge tone="purple">{items.length} hook</Badge>}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input className="input" type="number" min={1} max={200} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ width: 80 }} />
        <Btn kind="primary" icon={<Sparkles size={15} />} onClick={generate}>Sinh hook (LLM)</Btn>
      </div>
      {rejected && Object.keys(rejected).length > 0 && (
        <div className="xs muted mt8">Bị loại: {Object.entries(rejected).map(([k, v]) => `${k} · ${v}`).join(", ")}</div>
      )}
      <div className="row mt12" style={{ gap: 8 }}>
        <input className="input grow" placeholder="Nhập hook của bạn…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Btn icon={<Plus size={15} />} onClick={add} disabled={!text.trim()}>Thêm hook</Btn>
      </div>
      <div className="xs muted mt8">Mỗi hook chỉ dùng cho tối đa {reuseMax ?? "—"} biến thể và phải khác các hook hiện có (độ tương đồng &lt; {q.data?.sim_max ?? "—"}).</div>
      <div className="col mt12" style={{ gap: 6, maxHeight: 340, overflowY: "auto" }}>
        {q.loading && !q.data && <Loading rows={3} />}
        {q.error && !q.data && <ErrorBox error={q.error} onRetry={q.reload} />}
        {q.data && items.length === 0 && <div className="small muted">Chưa có hook nào.</div>}
        {items.map((h) => (
          <div key={h.id} className="inner row" style={{ padding: "8px 10px", gap: 8, alignItems: "flex-start" }}>
            <div className="grow small">
              {h.text}
              <div className="row mt8" style={{ gap: 6, flexWrap: "wrap" }}>
                {h.angle && <Badge tone="cyan">{angles?.[h.angle]?.label || h.angle}</Badge>}
                <Badge tone={reuseMax && h.used_count >= reuseMax ? "orange" : "teal"}>{h.used_count}/{reuseMax ?? "?"}</Badge>
                <Badge tone="gray">{h.source}</Badge>
              </div>
            </div>
            <Btn size="xs" kind="ghost" icon={<Trash2 size={13} />} title="Xoá hook" onClick={() => remove(h.id)} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function PlanCard({ cid, initialTarget }: { cid: string; initialTarget: number }) {
  const nav = useNavigate();
  const { toast, toastError } = useApp();
  const [target, setTarget] = useState(Math.min(1000, Math.max(1, Math.round(initialTarget) || 10)));
  const [deb, setDeb] = useState(target);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => setDeb(target), 400);
    return () => clearTimeout(t);
  }, [target]);
  const plan = useApi<any>(`/campaigns/${cid}/plan`, { target: deb });
  const [genErr, setGenErr] = useState<any>(null);

  async function generate() {
    setGenErr(null);
    try {
      const r = await api.post(`/campaigns/${cid}/variants/generate`, { target });
      toast({ kind: "success", title: `Đã tạo ${r.created} biến thể`, body: `Lô ${r.batch_no}` });
      nav("/creative/matrix");
      return true;
    } catch (e) {
      setGenErr(e);
      toastError(e, "Không sinh được biến thể");
      return undefined;
    }
  }

  const p = plan.data;
  const tone = (ok: boolean) => (ok ? "c-teal" : "c-orange");
  const dims = p?.dimensions || {};
  const dimLabel: Record<string, string> = { audiences: "Khách hàng", angles: "Góc", narratives: "Mạch kể", durations: "Thời lượng", formats: "Định dạng", voices: "Giọng", voice_rates: "Tốc độ", music: "Nhạc", fonts: "Font" };
  return (
    <Card title="Kế hoạch & ước tính" right={<Badge tone="cyan"><Clock size={11} /> ước tính</Badge>}>
      <div className="row" style={{ gap: 8 }}>
        <Field label="Số biến thể mục tiêu (≤ 1000)">
          <input className="input" type="number" min={1} max={1000} value={target} onChange={(e) => setTarget(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))} />
        </Field>
        <div className="grow" />
        <Btn kind="primary" icon={<Sparkles size={15} />} onClick={generate}>Sinh {target} biến thể</Btn>
      </div>
      {genErr?.body?.code === "NEED_MORE_SOURCE" && (
        <div className="mt12"><Warn title={genErr.body.message}>Cần {genErr.body.details?.required?.assets} video / {genErr.body.details?.required?.scenes} cảnh, hiện có {genErr.body.details?.have?.assets} / {genErr.body.details?.have?.scenes}.{genErr.body.hint ? ` ${genErr.body.hint}` : ""}</Warn></div>
      )}
      {plan.loading && !p && <div className="mt12"><Loading rows={4} /></div>}
      {plan.error && !p && <div className="mt12"><ErrorBox error={plan.error} onRetry={plan.reload} /></div>}
      {p && (
        <div className="col mt12" style={{ gap: 8 }}>
          <div className="inner small col" style={{ gap: 4 }}>
            <div className={tone(p.source.assets >= p.requirement.assets)}>Video nguồn: {p.source.assets} / cần {p.requirement.assets}</div>
            <div className={tone(p.source.scenes >= p.requirement.scenes)}>Cảnh quay: {p.source.scenes} / cần {p.requirement.scenes}</div>
            <div className={tone(p.hooks.have >= p.hooks.need)}>Hook: {p.hooks.have} / cần {p.hooks.need} <span className="muted">(dùng lại tối đa {p.hooks.reuse_max})</span></div>
            <div className={tone(p.claims_approved > 0)}>Tuyên bố đã duyệt: {p.claims_approved}</div>
            <div className={tone(p.feasible_combos >= p.target)}>Tổ hợp khả thi: {p.feasible_combos} / mục tiêu {p.target}</div>
            <div className="muted">Sức chứa hình + âm thanh: {String(p.visual_audio_capacity)}</div>
          </div>
          <div className="inner xs">
            <div className="semi small mb8">Các chiều biến thể</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {Object.entries(dims).map(([k, v]) => <Badge key={k} tone="gray">{dimLabel[k] || k}: {String(v)}</Badge>)}
            </div>
          </div>
          <div className="inner small">
            Kịch bản ~{p.eta?.script_hours}h · Render ~{p.eta?.render_hours}h · Tổng ~{p.eta?.total_hours}h <span className="muted">(song song {p.eta?.parallel})</span> · Dung lượng ~{p.disk_gb} GB
          </div>
          {(p.warnings || []).length > 0 ? (
            <div className="col" style={{ gap: 6 }}>
              {p.warnings.map((w: any, i: number) => (
                <div key={i} className={`small ${w.severity === "critical" ? "c-red" : "c-orange"}`}>
                  <AlertTriangle size={13} /> <b>{w.message}</b>
                  {w.hint && <div className="xs muted">{w.hint}</div>}
                </div>
              ))}
            </div>
          ) : <div className="small c-teal"><CheckCircle2 size={14} /> Không có cảnh báo.</div>}
        </div>
      )}
    </Card>
  );
}
