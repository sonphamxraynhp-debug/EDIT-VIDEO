import { useNavigate } from "react-router-dom";
import { CheckCircle2, FileText, Film, Folder, Layers, MonitorCog, Plus, Rocket, Sparkles, Upload, Wand2, Zap } from "lucide-react";
import { useApi } from "../lib/api";
import { JOB_KIND, dt } from "../lib/format";
import { useApp } from "../lib/store";
import { Async, Badge, Bar, Btn, Card, Empty, Kpi, PageHead, Thumb } from "../components/ui";
import { AreaChart, Donut, PALETTE, Ring } from "../components/charts";

const PHASE_TONE: Record<string, any> = { "Đang dựng video": "cyan", "Đang phân tích": "purple", "Đang viết kịch bản": "purple", "Hoàn thành": "teal", "Đã xuất một phần": "teal", "Chờ bạn chọn video": "orange", "Chờ duyệt kịch bản": "orange", "Đã chọn, chờ xuất": "orange", "Đã có video nguồn": "gray", "Mới tạo": "gray", "Đã lưu trữ": "gray" };

export default function Dashboard() {
  const nav = useNavigate();
  const { hw, setProjectId } = useApp();
  const q = useApi<any>("/dashboard", undefined, 5000);
  const live = hw?.live;
  return (
    <>
      <PageHead
        title="Tổng quan sản xuất"
        sub="Điều hành toàn bộ dây chuyền sáng tạo video AI trên máy tính"
        actions={<Btn kind="primary" size="lg" icon={<Wand2 size={18} />} onClick={() => nav("/")}>Tạo video mới</Btn>}
      />
      <Async q={q}>
        {(d) => {
          const days = Array.from({ length: 7 }).map((_, i) => {
            const x = new Date();
            x.setDate(x.getDate() - 6 + i);
            return x.toISOString().slice(0, 10);
          });
          const weekly = days.map((dd) => d.weekly.find((w: any) => w.d === dd)?.n || 0);
          const labels = days.map((dd) => ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][new Date(dd).getDay()]);
          const st = d.recent_projects.reduce((acc: Record<string, number>, p: any) => ({ ...acc, [p.phase]: (acc[p.phase] || 0) + 1 }), {});
          const statusData = Object.entries(st).map(([label, value], i) => ({ label, value: value as number, color: PALETTE[i] }));
          const angleTotal = d.angles.reduce((a: number, x: any) => a + x.n, 0) || 1;
          return (
            <>
              <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr) 1.25fr" }}>
                <Kpi icon={<Folder size={22} />} value={d.projects_active} label="Dự án đang chạy" />
                <Kpi icon={<FileText size={22} />} value={d.scripts.toLocaleString("vi-VN")} label="Kịch bản" />
                <Kpi icon={<Film size={22} />} value={d.videos_done} label="Video hoàn tất" tone="cyan" />
                <Kpi icon={<Layers size={22} />} value={d.success_rate === null ? "—" : `${d.success_rate}%`} label="Tác vụ thành công" tone="teal" />
                <Card title={`Tác vụ đang hoạt động (${d.active_jobs.length})`} icon={<Zap size={16} className="c-primary" />} style={{ gridRow: "span 2" }}>
                  {d.active_jobs.length === 0 && <div className="small muted">Không có tác vụ nào đang chạy.</div>}
                  <div className="col" style={{ gap: 12 }}>
                    {d.active_jobs.map((j: any) => (
                      <div key={j.id}>
                        <div className="row between small">
                          <span>{JOB_KIND[j.kind] || j.kind} {j.code ? `· ${j.code}` : ""}</span>
                          <b>{Math.round(j.progress * 100)}%</b>
                        </div>
                        <Bar value={j.progress * 100} tone={j.status === "PENDING" ? "" : "teal"} thin style={{ marginTop: 6 }} />
                      </div>
                    ))}
                  </div>
                  <div className="divider" />
                  <div className="card-title" style={{ fontSize: 14 }}><MonitorCog size={15} /> Tình trạng thiết bị (Local)</div>
                  <div className="row mt12" style={{ justifyContent: "space-around" }}>
                    <div className="center"><Ring value={live?.cpu_pct ?? 0} color="#8b6cff" label={<span>CPU<br />{Math.round(live?.cpu_pct ?? 0)}%</span>} size={74} /></div>
                    <div className="center"><Ring value={live?.ram_pct ?? 0} color="#4fc3ff" label={<span className="small">RAM<br />{live?.ram_used_gb}/{live?.ram_total_gb}</span>} size={74} /></div>
                    <div className="center inner" style={{ padding: "10px 12px" }}><Layers size={18} className="c-primary" /><div className="bold" style={{ fontSize: 18 }}>{d.queue}</div><div className="xs muted">Queue</div></div>
                  </div>
                </Card>
                <Card title="Sản lượng video theo tuần" sub="Số video final render thành công 7 ngày qua" style={{ gridColumn: "span 2" }}>
                  <AreaChart series={[weekly]} labels={labels} height={180} />
                </Card>
                <Card title="Trạng thái xử lý dự án" sub={`Tổng ${d.recent_projects.length} dự án gần nhất`}>
                  {statusData.length ? (
                    <div className="row" style={{ gap: 18 }}>
                      <Donut data={statusData} size={130} center={<div><div className="bold" style={{ fontSize: 22 }}>{d.recent_projects.length}</div><div className="xs muted">Dự án</div></div>} />
                      <div className="chart-legend grow">
                        {statusData.map((s) => (
                          <div key={s.label} className="legend-row"><span className="legend-dot" style={{ background: s.color }} />{s.label}<b>{s.value}</b></div>
                        ))}
                      </div>
                    </div>
                  ) : <div className="small muted">Chưa có dự án.</div>}
                </Card>
                <Card title="Phân bổ góc nội dung" sub={`Theo ${angleTotal === 1 && !d.angles.length ? 0 : angleTotal} biến thể`}>
                  {d.angles.length ? (
                    <div className="col" style={{ gap: 9 }}>
                      {d.angles.slice(0, 6).map((a: any, i: number) => (
                        <div key={a.angle}>
                          <div className="row between small"><span>{a.label}</span><span>{Math.round((a.n / angleTotal) * 100)}%</span></div>
                          <Bar value={(a.n / angleTotal) * 100} thin style={{ marginTop: 4 }} tone={["teal", "purple", "cyan", "orange", "", "red"][i]} />
                        </div>
                      ))}
                    </div>
                  ) : <div className="small muted">Chưa lập ma trận sáng tạo.</div>}
                </Card>
              </div>

              <div className="card mt16 row" style={{ gap: 14, background: "linear-gradient(90deg, rgba(123,86,255,.22), rgba(17,25,54,.9))" }}>
                <Rocket size={30} className="c-primary" />
                <div style={{ minWidth: 190 }}>
                  <div className="bold" style={{ fontSize: 16 }}>Quy trình bắt đầu nhanh</div>
                  <div className="small t2">Một luồng duy nhất, bấm để bắt đầu</div>
                </div>
                {[
                  { n: "1. Tải video", s: "Nhập video quay thật", icon: <Upload size={18} />, to: "/flow" },
                  { n: "2. Hồ sơ sản phẩm", s: "Cập nhật thông tin, USP", icon: <Sparkles size={18} />, to: "/flow" },
                  { n: "3. AI tạo nội dung", s: "Sinh kịch bản, phân cảnh", icon: <Wand2 size={18} />, to: "/flow" },
                  { n: "4. Render", s: "Dựng và xuất video", icon: <Film size={18} />, to: "/flow" },
                ].map((s, i) => (
                  <div key={s.n} className="row grow" style={{ gap: 8 }}>
                    <div className="list-item grow" onClick={() => nav(s.to)}>
                      <div className="kpi-icon" style={{ width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", background: "var(--primary-soft)", color: "var(--primary-2)" }}>{s.icon}</div>
                      <div><div className="semi">{s.n}</div><div className="xs muted">{s.s}</div></div>
                    </div>
                    {i < 3 && <span className="muted">→</span>}
                  </div>
                ))}
              </div>

              <Card className="mt16" title="Danh sách dự án gần đây" icon={<Layers size={16} />} right={<span className="link small" onClick={() => nav("/projects")}>Xem tất cả dự án →</span>}>
                {d.recent_projects.length === 0 ? (
                  <Empty title="Chưa có dự án" action={<Btn kind="primary" onClick={() => nav("/")}>Tạo video đầu tiên</Btn>} />
                ) : (
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead><tr><th>Dự án</th><th>Sản phẩm</th><th className="center">Kế hoạch (Video)</th><th style={{ width: 200 }}>Hoàn tất</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead>
                      <tbody>
                        {d.recent_projects.map((p: any) => (
                          <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => { setProjectId(p.id); nav("/flow"); }}>
                            <td><div className="row"><Thumb src={p.thumbnail} ratio="1/1" style={{ width: 40 }} /><div><div className="semi">{p.name}</div><div className="xs muted ellipsis" style={{ maxWidth: 260 }}>{p.description || "—"}</div></div></div></td>
                            <td>{p.product?.name || "—"}</td>
                            <td className="center bold">{p.target}</td>
                            <td><div className="small">{p.completed} ({p.progress}%)</div><Bar value={p.progress} tone="teal" thin style={{ marginTop: 4 }} /></td>
                            <td><Badge tone={PHASE_TONE[p.phase] || "gray"} icon={p.phase === "Hoàn thành" ? <CheckCircle2 size={12} /> : undefined}>{p.phase}</Badge></td>
                            <td className="small t2">{dt(p.updated_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          );
        }}
      </Async>
    </>
  );
}
