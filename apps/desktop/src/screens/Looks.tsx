/** Phong cách & phụ đề: chọn phong cách edit (màu phim + hiệu ứng cắt), kiểu phụ đề chạy chữ và font mặc định cho mọi video. */
import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";
import { API, api, useApi } from "../lib/api";
import { useApp } from "../lib/store";
import { Btn, Card, InfoNote, Loading, PageHead } from "../components/ui";

const pv = (o: { edit?: string; caption?: string; font?: string }) =>
  `${API}/looks/preview?${new URLSearchParams(Object.entries(o).filter(([, v]) => v) as any).toString()}`;

export default function Looks() {
  const { toast, toastError } = useApp();
  const q = useApi<any>("/looks");
  const [pick, setPick] = useState<{ edit?: string; caption?: string; font?: string }>({});
  useEffect(() => { if (q.data && !Object.keys(pick).length) setPick(q.data.saved || {}); }, [q.data]);
  if (!q.data) return <Loading rows={5} h={22} />;
  const d = q.data;
  const cur = { edit: pick.edit || "clean", caption: pick.caption, font: pick.font };
  const editOf = d.edit_styles[cur.edit];
  const capId = cur.caption || editOf.caption;
  const fontId = cur.font || (cur.caption ? d.caption_styles[cur.caption].font : editOf.font);
  const dirty = JSON.stringify(pick) !== JSON.stringify(d.saved || {});

  async function save() {
    try { await api.put("/looks/default", pick); q.reload(); toast({ kind: "success", title: "Đã lưu phong cách mặc định", body: "Áp dụng cho video dựng từ giờ trở đi ở mọi chế độ." }); return true; }
    catch (e) { toastError(e, "Không lưu được"); return undefined; }
  }
  const tile = (key: string, on: boolean, img: string, title: string, sub: string, click: () => void) => (
    <div key={key} className="inner list-item" onClick={click} style={{ display: "block", padding: 8, outline: on ? "2px solid var(--primary, #7c5cff)" : undefined, position: "relative" }}>
      <img src={img} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "9/16", objectFit: "cover", borderRadius: 8, background: "#111" }} />
      {on && <span style={{ position: "absolute", top: 14, right: 14, background: "var(--primary, #7c5cff)", borderRadius: 99, padding: 3, display: "inline-flex" }}><Check size={14} /></span>}
      <div className="small semi mt8">{title}</div>
      <div className="xs muted">{sub}</div>
    </div>
  );
  const groups: Record<string, string[]> = {};
  Object.entries(d.fonts).forEach(([k, f]: any) => { (groups[f.group] ||= []).push(k); });

  return (
    <div>
      <PageHead icon={<Palette size={22} />} title="Phong cách & phụ đề" sub="Chọn một lần, mọi video dựng sau đều theo. Ở từng tin vẫn chọn riêng được."
        actions={<Btn kind="primary" disabled={!dirty} onClick={save}>Lưu làm mặc định</Btn>} />
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) 260px", gap: 16, alignItems: "start" }}>
        <div className="col" style={{ gap: 16 }}>
          <Card title="1. Phong cách edit" sub="Gồm màu phim, hiệu ứng mỗi lần đổi cảnh, kiểu phụ đề và font đi kèm.">
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {Object.entries(d.edit_styles).map(([k, e]: any) => tile(k, cur.edit === k, pv({ edit: k }), e.name, e.desc,
                () => setPick({ edit: k })))}
            </div>
          </Card>
          <Card title="2. Kiểu phụ đề" sub="Mặc định theo phong cách edit. Chọn riêng ở đây nếu muốn đổi.">
            <div className="row mb12"><span className={`chip ${!cur.caption ? "on" : ""}`} onClick={() => setPick({ ...pick, caption: undefined, font: undefined })}>Theo phong cách: {d.caption_styles[editOf.caption].name}</span></div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
              {Object.entries(d.caption_styles).map(([k, c]: any) => tile(k, capId === k && !!cur.caption, pv({ edit: cur.edit, caption: k, font: cur.font }), c.name, c.desc,
                () => setPick({ ...pick, caption: k })))}
            </div>
          </Card>
          <Card title="3. Font chữ phụ đề" sub="19 font đủ dấu tiếng Việt, đóng kèm phần mềm, dùng được khi không có mạng.">
            <div className="row mb12"><span className={`chip ${!cur.font ? "on" : ""}`} onClick={() => setPick({ ...pick, font: undefined })}>Theo kiểu phụ đề: {d.fonts[cur.caption ? d.caption_styles[cur.caption].font : editOf.font]?.name}</span></div>
            {Object.entries(groups).map(([g, ids]) => (
              <div key={g} className="mb12">
                <div className="xs muted mb8">{g}</div>
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
                  {ids.map((k) => (
                    <div key={k} className="inner list-item" onClick={() => setPick({ ...pick, font: k })} style={{ display: "block", padding: "6px 10px", outline: fontId === k && pick.font ? "2px solid var(--primary, #7c5cff)" : undefined }}>
                      <img src={`${API}/looks/font/${k}`} alt={d.fonts[k].name} style={{ height: 34, maxWidth: "100%", objectFit: "contain", objectPosition: "left" }} />
                      <div className="xs muted">{d.fonts[k].name}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </div>
        <div className="col" style={{ gap: 12, position: "sticky", top: 12 }}>
          <Card title="Xem trước">
            <img src={pv({ edit: cur.edit, caption: cur.caption, font: cur.font })} alt="" style={{ width: "100%", aspectRatio: "9/16", borderRadius: 10, objectFit: "cover" }} />
            <div className="xs mt8"><b>{editOf.name}</b> · {d.caption_styles[capId].name} · {d.fonts[fontId]?.name}</div>
            <div className="xs muted mt4">Màu: {d.grades[editOf.grade]}. Đổi cảnh: {String(editOf.cut).split("+").map((c: string) => d.cuts[c]).join(", ")}.
              {editOf.letterbox ? " Viền đen trên dưới." : ""}{editOf.grain ? " Hạt phim." : ""}{editOf.vignette ? " Viền tối." : ""}</div>
          </Card>
          <InfoNote>Ảnh xem trước dùng một khung từ video gần nhất trong thư viện. Hiệu ứng đổi cảnh và chữ chạy theo giọng chỉ thấy khi dựng video thật.</InfoNote>
        </div>
      </div>
    </div>
  );
}
