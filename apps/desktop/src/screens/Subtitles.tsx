import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Captions, Download, Layers, Mic, Pause, Play, Plus, RefreshCw, Save, SpellCheck, Trash2, Type, WandSparkles,
} from "lucide-react";
import { api, fileUrl } from "../lib/api";
import { useApp } from "../lib/store";
import { msPrecise } from "../lib/format";
import { Badge, Btn, Card, Empty, Field, InfoNote, Loading, PageHead, Select, Tabs, Toggle, Warn, ErrorBox } from "../components/ui";
import {
  activeAt, CaptionItem, CaptionStyle, download, hexA, isTyping, NumInput, PreviewCanvas, toSrt, useCaptionStyle, usePlayer,
  useProjectMedia, useTimelineDoc, VariantGate, wrapCaption,
} from "../components/c_timeline";

const PRESETS: Array<{ id: string; label: string; sample: string; style: Partial<CaptionStyle> }> = [
  { id: "classic", label: "Classic", sample: "Phụ đề tiêu chuẩn rõ ràng, dễ đọc", style: { font_size: 54, color: "#FFFFFF", highlight_color: "#FFD700", stroke: 3, stroke_color: "#000000", box: false, caption_y: 0.7, max_lines: 2 } },
  { id: "minimal", label: "Minimal", sample: "Phụ đề tối giản", style: { font_size: 44, color: "#FFFFFF", highlight_color: "#FFFFFF", stroke: 0, box: false, caption_y: 0.78, max_lines: 2 } },
  { id: "kinetic", label: "Kinetic", sample: "Phụ đề chuyển động năng động", style: { font_size: 60, color: "#FFFFFF", highlight_color: "#19D3B5", stroke: 4, stroke_color: "#000000", box: false, caption_y: 0.62, max_lines: 2 } },
  { id: "karaoke", label: "Karaoke", sample: "Từng từ được làm nổi bật", style: { font_size: 54, color: "#FFFFFF", highlight_color: "#FFD700", stroke: 3, stroke_color: "#000000", box: false, caption_y: 0.7, max_lines: 2 } },
  { id: "educational", label: "Educational", sample: "Phụ đề dạng học tập kèm nhấn mạnh", style: { font_size: 48, color: "#FFFFFF", highlight_color: "#4FC3FF", stroke: 0, box: true, box_color: "#1B2440", caption_y: 0.72, max_lines: 2 } },
  { id: "bold_review", label: "Bold Review", sample: "PHỤ ĐỀ NỔI BẬT CHO VIDEO REVIEW", style: { font_size: 66, color: "#FFFFFF", highlight_color: "#FF3B5C", stroke: 6, stroke_color: "#000000", box: false, caption_y: 0.66, max_lines: 2 } },
];
const PAGE = 8;

const fixPunct = (s: string) => {
  let t = s.replace(/\s+/g, " ").replace(/\s+([,.!?;:…])/g, "$1").replace(/([,.!?;:])(?=[^\s\d,.!?;:…"”)])/g, "$1 ").trim();
  if (t) t = t[0].toLocaleUpperCase("vi") + t.slice(1);
  return t;
};
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export default function Subtitles() {
  return <VariantGate title="chỉnh phụ đề">{(g) => <SubInner key={g.variantId} variantId={g.variantId} picker={g.picker} />}</VariantGate>;
}

function SubInner({ variantId, picker }: { variantId: string; picker: React.ReactNode }) {
  const nav = useNavigate();
  const { projectId, toast, toastError } = useApp();
  const doc = useTimelineDoc(variantId);
  const { tl, commit } = doc;
  const media = useProjectMedia(projectId);
  const cap = useCaptionStyle(tl?.template_id);
  const voiceUrl = tl?.tracks.voice_mix ? fileUrl(tl.tracks.voice_mix) : undefined;
  const player = usePlayer(tl?.duration_ms || 0, voiceUrl);
  const [style, setStyle] = useState<CaptionStyle | null>(null);
  const [styleDirty, setStyleDirty] = useState(false);
  const [selI, setSelI] = useState(0);
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [setTab, setSetTab] = useState("display");
  const [bottomTab, setBottomTab] = useState("karaoke");
  const [showSafe, setShowSafe] = useState(true);

  // khởi tạo style từ brand kit hiệu lực (một lần sau khi tải)
  useEffect(() => {
    if (!styleDirty && cap.brands.data && cap.kit) setStyle({ ...cap.style, preset: (cap.kit.caption?.preset as string) || cap.style.preset || "classic" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cap.brands.data, cap.kit?.id, JSON.stringify(cap.tmpl?.caption)]);

  // con trỏ phát theo phụ đề
  const playI = tl ? activeAt(tl.tracks.captions, player.t) : -1;
  useEffect(() => {
    if (player.playing && playI >= 0) setSelI(playI);
  }, [player.playing, playI]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.code === "Space") {
        e.preventDefault();
        player.toggle();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doc.redo();
        else doc.undo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const caps: CaptionItem[] = tl?.tracks.captions || [];
  const st = style || cap.style;
  const issues = useMemo(
    () =>
      caps
        .map((c, i) => {
          const lines = wrapCaption(c.text, st);
          const perLine = Math.max(...lines.map(wordCount), 0);
          const probs: string[] = [];
          if (lines.length > st.max_lines) probs.push(`${lines.length} dòng > ${st.max_lines}`);
          if (perLine > 16) probs.push(`${perLine} từ/dòng`);
          if (c.end_ms - c.start_ms < 700) probs.push("hiển thị < 0,7s");
          const cps = c.text.length / Math.max(0.1, (c.end_ms - c.start_ms) / 1000);
          if (cps > 22) probs.push(`${Math.round(cps)} ký tự/giây`);
          if (i > 0 && c.start_ms < caps[i - 1].end_ms) probs.push("chồng lấn phụ đề trước");
          return { i, probs, lines: lines.length };
        })
        .filter((x) => x.probs.length),
    [caps, st],
  );

  if (doc.q.loading && !doc.variant) return <Loading rows={6} h={22} />;
  if (doc.q.error && !doc.variant) return <ErrorBox error={doc.q.error} onRetry={doc.q.reload} />;
  if (!tl && doc.storyboard) return <Loading rows={6} h={22} />;
  if (!tl) {
    return (
      <Empty title="Biến thể này chưa có storyboard" action={<button className="btn primary" onClick={() => nav(`/creative/storyboard?v=${variantId}`)}>Dựng storyboard</button>}>
        {picker}
      </Empty>
    );
  }

  const sel = caps[selI];
  const upd = (patch: Partial<CaptionStyle>) => {
    setStyle((s) => ({ ...(s || cap.style), ...patch }));
    setStyleDirty(true);
  };
  const pages = Math.max(1, Math.ceil(caps.length / PAGE));
  const pageRows = caps.slice((page - 1) * PAGE, page * PAGE);
  const voice = tl.tracks.voice || [];

  const syncVoice = () => {
    commit((d) => {
      d.tracks.captions.forEach((c, i) => {
        const v = voice[c.beat ?? i];
        if (v) {
          c.start_ms = v.start_ms;
          c.end_ms = v.end_ms;
        }
      });
    });
    toast({ kind: "success", title: "Đã đồng bộ mốc phụ đề theo giọng đọc" });
  };
  const fixAll = () => {
    const targets = checked.size ? Array.from(checked) : caps.map((_, i) => i);
    let n = 0;
    commit((d) => {
      for (const i of targets) {
        const c = d.tracks.captions[i];
        const f = fixPunct(c.text);
        if (f !== c.text) {
          c.text = f;
          n++;
        }
      }
    });
    toast({ kind: "success", title: n ? `Đã chuẩn hoá dấu câu ${n} phụ đề` : "Dấu câu đã chuẩn" });
  };
  const saveStyle = async () => {
    if (!cap.kit || !style) return undefined;
    try {
      const { preset, ...rest } = style;
      await api.put("/brands", { ...cap.kit, caption: { ...(cap.kit.caption || {}), ...rest, preset } });
      setStyleDirty(false);
      cap.brands.reload();
      toast({ kind: "success", title: `Đã áp dụng kiểu phụ đề cho brand kit “${cap.kit.name}”`, body: "Mọi lần render preview/final sau sẽ dùng kiểu này." });
      return true;
    } catch (e) {
      toastError(e, "Không lưu được kiểu phụ đề");
      return undefined;
    }
  };
  const exportSrt = () => {
    download(`${doc.variant?.code || "variant"}.srt`, toSrt(caps), "application/x-subrip;charset=utf-8");
    toast({ kind: "success", title: `Đã xuất ${caps.length} phụ đề ra SRT` });
  };
  const addCaption = () => {
    const last = caps[caps.length - 1];
    const s = last ? last.end_ms : 0;
    commit((d) => {
      d.tracks.captions.push({ start_ms: s, end_ms: s + 2000, text: "Phụ đề mới" });
    });
    setSelI(caps.length);
    setPage(Math.ceil((caps.length + 1) / PAGE));
  };
  const delRows = (idx: number[]) => {
    commit((d) => {
      d.tracks.captions = d.tracks.captions.filter((_, i) => !idx.includes(i));
    });
    setChecked(new Set());
    setSelI(0);
  };

  return (
    <>
      <PageHead
        title="Subtitle Studio"
        sub="Tạo, chỉnh sửa và đồng bộ phụ đề cho video – xem trước trực tiếp trên khung 9:16."
        icon={<Captions size={22} />}
        actions={
          <>
            {picker}
            <Btn icon={<Mic size={15} />} disabled title="Phụ đề lấy từ kịch bản + giọng TTS. Nhận diện lời nói (whisper.cpp) chạy ở bước Phân tích video.">Nhận diện lời nói</Btn>
            <Btn icon={<RefreshCw size={15} />} disabled={!voice.length} title={voice.length ? "Đặt mốc vào/ra theo từng đoạn giọng đọc" : "Chưa có giọng đọc – tạo ở Voice Studio"} onClick={syncVoice}>Tự động đồng bộ</Btn>
            <Btn icon={<SpellCheck size={15} />} disabled title="Chưa có từ điển chính tả tiếng Việt offline">Kiểm tra chính tả</Btn>
            <Btn icon={<WandSparkles size={15} />} title={checked.size ? `Chuẩn hoá dấu câu cho ${checked.size} dòng đã chọn` : "Chuẩn hoá dấu câu, khoảng trắng, viết hoa đầu câu"} onClick={fixAll}>Sửa dấu câu</Btn>
            <Btn icon={<Layers size={15} />} disabled={!styleDirty || !cap.kit} title={cap.kit ? "Lưu kiểu phụ đề vào brand kit đang dùng – áp dụng cho mọi video render sau" : "Chưa có brand kit"} onClick={saveStyle}>Áp dụng hàng loạt</Btn>
            <Btn icon={<Download size={15} />} disabled={!caps.length} onClick={exportSrt}>Xuất SRT</Btn>
          </>
        }
      />

      <div className="grid" style={{ gridTemplateColumns: "250px minmax(0,1fr) 300px", alignItems: "start" }}>
        {/* ---------------- style library */}
        <Card title="Thư viện kiểu phụ đề">
          <div className="col" style={{ gap: 8 }}>
            {PRESETS.map((p) => {
              const s = { ...st, ...p.style } as CaptionStyle;
              const on = st.preset === p.id;
              return (
                <div key={p.id} className={`list-item ${on ? "on" : ""}`} style={{ padding: 8 }} onClick={() => upd({ ...p.style, preset: p.id })}>
                  <div className="semi small" style={{ width: 72 }}>{p.label}</div>
                  <div className="grow" style={{ background: "#0b1026", borderRadius: 8, padding: "8px 6px", textAlign: "center", minHeight: 46, display: "grid", placeItems: "center" }}>
                    <span style={{
                      fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 800, fontSize: Math.max(10, s.font_size / 4.6), color: s.color, lineHeight: 1.3,
                      WebkitTextStroke: s.stroke ? `${Math.max(0.4, s.stroke / 4)}px ${s.stroke_color}` : undefined, paintOrder: "stroke fill",
                      background: s.box ? hexA(s.box_color, 0.7) : undefined, padding: s.box ? "2px 6px" : undefined, borderRadius: 6,
                    } as React.CSSProperties}>
                      {p.sample.split(" ").map((w, i, arr) => (
                        <span key={i} style={{ color: i === arr.length - 2 || (p.id === "karaoke" && i < 2) ? s.highlight_color : undefined }}>{w}{i < arr.length - 1 ? " " : ""}</span>
                      ))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="xs muted mt12">Kiểu đang lưu trong brand kit: <b className="t2">{(cap.kit?.caption?.preset as string) || "mặc định template"}</b></div>
        </Card>

        {/* ---------------- preview + table */}
        <div className="col" style={{ gap: 16 }}>
          <Card>
            <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
              <div className="col" style={{ gap: 8, alignItems: "center" }}>
                <PreviewCanvas tl={tl} assetsById={media.assetsById} t={player.t} playing={player.playing} captionStyle={st} accent={cap.accent} karaoke={st.preset === "karaoke" || st.preset === "kinetic"} showSafe={showSafe} width={230} hideTitles />
                {player.audio}
                <div className="row" style={{ width: 230 }}>
                  <button className="btn icon sm" onClick={player.toggle} title="Phát/Dừng (Space)">{player.playing ? <Pause size={14} /> : <Play size={14} />}</button>
                  <span className="mono xs">{msPrecise(player.t)} / {msPrecise(tl.duration_ms)}</span>
                </div>
                <input className="range" style={{ width: 230 }} type="range" min={0} max={tl.duration_ms} value={player.t} onChange={(e) => player.setT(Number(e.target.value))} />
                <div className="row xs t2" style={{ width: 230 }}><Toggle on={showSafe} onChange={setShowSafe} /> Lưới vùng an toàn</div>
              </div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row between mb8">
                  <div className="card-title">Bảng phụ đề <Badge tone="gray">{caps.length}</Badge></div>
                  <div className="row" style={{ gap: 6 }}>
                    {checked.size > 0 && <Btn size="sm" kind="danger" icon={<Trash2 size={13} />} onClick={() => delRows(Array.from(checked))}>Xoá {checked.size}</Btn>}
                    <Btn size="sm" icon={<Plus size={13} />} onClick={addCaption}>Thêm dòng</Btn>
                    <Btn size="sm" kind="primary" icon={<Save size={13} />} disabled={!doc.dirty} title={doc.dirty ? "Lưu nội dung & thời gian phụ đề vào timeline" : "Không có thay đổi"} onClick={() => doc.save().then(() => true).catch(() => undefined)}>Lưu phụ đề</Btn>
                  </div>
                </div>
                {!caps.length ? <Empty title="Timeline chưa có phụ đề" action={<Btn onClick={addCaption}>Thêm phụ đề</Btn>} /> : (
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead><tr><th style={{ width: 28 }}><input type="checkbox" className="check" checked={checked.size === caps.length} onChange={(e) => setChecked(e.target.checked ? new Set(caps.map((_, i) => i)) : new Set())} /></th><th>#</th><th style={{ width: 92 }}>Vào (ms)</th><th style={{ width: 92 }}>Ra (ms)</th><th>Nội dung phụ đề</th><th>Từ</th><th /></tr></thead>
                      <tbody>
                        {pageRows.map((c, k) => {
                          const i = (page - 1) * PAGE + k;
                          const bad = issues.find((x) => x.i === i);
                          return (
                            <tr key={i} className={i === selI ? "sel" : ""} onClick={() => { setSelI(i); player.setT(c.start_ms); }} style={{ cursor: "pointer" }}>
                              <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="check" checked={checked.has(i)} onChange={(e) => { const n = new Set(checked); if (e.target.checked) n.add(i); else n.delete(i); setChecked(n); }} /></td>
                              <td>{i + 1}</td>
                              <td><NumInput value={c.start_ms} min={0} step={50} onChange={(v) => commit((d) => { const x = d.tracks.captions[i]; x.start_ms = Math.min(v, x.end_ms - 100); })} /></td>
                              <td><NumInput value={c.end_ms} min={0} step={50} onChange={(v) => commit((d) => { const x = d.tracks.captions[i]; x.end_ms = Math.max(v, x.start_ms + 100); })} /></td>
                              <td><input className="input" style={{ height: 32, borderColor: bad ? "rgba(245,165,36,.7)" : undefined }} value={c.text} title={bad?.probs.join(" · ")} onChange={(e) => { const v = e.target.value; commit((d) => { d.tracks.captions[i].text = v; delete d.tracks.captions[i].words; }); }} /></td>
                              <td>{bad ? <span className="c-orange row" style={{ gap: 3 }} title={bad.probs.join(" · ")}><AlertTriangle size={12} />{wordCount(c.text)}</span> : wordCount(c.text)}</td>
                              <td><button className="btn xs ghost" title="Xoá dòng" onClick={(e) => { e.stopPropagation(); delRows([i]); }}><Trash2 size={12} /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {pages > 1 && (
                  <div className="row mt8" style={{ justifyContent: "flex-end", gap: 4 }}>
                    {Array.from({ length: pages }).map((_, i) => (
                      <button key={i} className={`btn xs ${page === i + 1 ? "primary" : ""}`} onClick={() => setPage(i + 1)}>{i + 1}</button>
                    ))}
                  </div>
                )}
                {doc.dirty && <div className="xs c-orange mt8">Có thay đổi phụ đề chưa lưu (⌘/Ctrl+Z để hoàn tác).</div>}
              </div>
            </div>
          </Card>
        </div>

        {/* ---------------- display settings */}
        <Card>
          <Tabs value={setTab} onChange={setSetTab} tabs={[{ id: "display", label: "Cài đặt hiển thị" }, { id: "adv", label: "Nâng cao" }]} />
          {!style && cap.brands.loading ? <Loading /> : setTab === "display" ? (
            <div className="col" style={{ gap: 11 }}>
              <Field label="Phông chữ">
                <select className="select" disabled title="Engine render dùng font hệ thống Arial Bold (có dấu tiếng Việt)"><option>Arial Bold (engine)</option></select>
              </Field>
              <Row label="Kích thước"><NumInput value={st.font_size} min={24} max={96} step={2} onChange={(v) => upd({ font_size: v })} suffix="px" /></Row>
              <Row label="Màu chữ"><ColorIn value={st.color} onChange={(v) => upd({ color: v })} /></Row>
              <Row label="Màu nhấn (Karaoke)"><ColorIn value={st.highlight_color} onChange={(v) => upd({ highlight_color: v })} /></Row>
              <Row label="Viền chữ"><Toggle purple on={st.stroke > 0} onChange={(v) => upd({ stroke: v ? 3 : 0 })} /></Row>
              {st.stroke > 0 && (
                <>
                  <Row label="Độ dày"><NumInput value={st.stroke} min={1} max={10} step={1} onChange={(v) => upd({ stroke: v })} suffix="px" /></Row>
                  <Row label="Màu viền"><ColorIn value={st.stroke_color} onChange={(v) => upd({ stroke_color: v })} /></Row>
                </>
              )}
              <Row label="Hộp nền"><Toggle purple on={st.box} onChange={(v) => upd({ box: v })} /></Row>
              {st.box && <Row label="Màu hộp"><ColorIn value={st.box_color} onChange={(v) => upd({ box_color: v })} /></Row>}
              <Row label="Số dòng tối đa"><Select value={st.max_lines} onChange={(v) => upd({ max_lines: Number(v) })} options={[{ value: 1, label: "1 dòng" }, { value: 2, label: "2 dòng" }, { value: 3, label: "3 dòng" }]} /></Row>
              <Btn kind="primary" icon={<Layers size={14} />} disabled={!styleDirty || !cap.kit} onClick={saveStyle} title="Lưu vào brand kit đang dùng">Lưu kiểu vào Brand Kit</Btn>
              {styleDirty && <div className="xs c-orange">Kiểu phụ đề đang xem trước – chưa lưu.</div>}
            </div>
          ) : (
            <div className="col" style={{ gap: 11 }}>
              <Field label={`Vị trí dọc: ${Math.round(st.caption_y * 100)}% chiều cao`}>
                <input className="range" type="range" min={50} max={85} value={Math.round(st.caption_y * 100)} onChange={(e) => upd({ caption_y: Number(e.target.value) / 100 })} />
              </Field>
              <Field label={<span className="row">Lề an toàn <Badge tone="orange">Xem trước – chưa áp dụng khi render</Badge></span>} hint="Engine hiện dùng lề cố định 8%; giá trị này được lưu kèm kiểu phụ đề.">
                <Select value={String(st.safe_margin)} onChange={(v) => upd({ safe_margin: Number(v) })} options={[{ value: "0.05", label: "5%" }, { value: "0.08", label: "8% (mặc định)" }, { value: "0.1", label: "10%" }, { value: "0.12", label: "12%" }]} />
              </Field>
              <div className="kv">
                <span>Brand kit</span><span>{cap.kit?.name || "—"}</span>
                <span>Template</span><span>{cap.tmpl?.name || "—"}</span>
                <span>Nhấn từ khoá</span><span className="xs t2">Render tô màu nhấn cho từ khoá; karaoke theo từng từ chỉ có ở xem trước.</span>
              </div>
              <Btn size="sm" onClick={() => { setStyle({ ...cap.style }); setStyleDirty(false); }} disabled={!styleDirty}>Khôi phục từ Brand Kit</Btn>
            </div>
          )}
        </Card>
      </div>

      {/* ---------------- karaoke / segments */}
      <div className="grid mt16" style={{ gridTemplateColumns: "minmax(0,1fr) 300px" }}>
        <Card>
          <Tabs value={bottomTab} onChange={setBottomTab} tabs={[{ id: "karaoke", label: "Karaoke (xem trước)" }, { id: "segments", label: "Phân đoạn phụ đề" }]} />
          {bottomTab === "karaoke" ? (
            sel ? (
              sel.words?.length ? (
                <>
                  <div className="xs muted mb8">Phụ đề {selI + 1} · {sel.words.length} từ có mốc thời gian từ giọng đọc</div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {sel.words.map((w, i) => {
                      const on = player.t >= w.start_ms && player.t < w.end_ms;
                      return (
                        <button key={i} className={`chip ${on ? "on" : ""}`} onClick={() => player.setT(w.start_ms)} style={on ? { borderColor: st.highlight_color, color: st.highlight_color } : undefined}>
                          <b>{w.w}</b> <span className="xs muted mono">{msPrecise(w.start_ms)}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : <Empty title="Phụ đề này chưa có mốc từng từ">Mốc từ được tạo khi sinh giọng đọc (Voice Studio) – sửa nội dung sẽ xoá mốc cũ.</Empty>
            ) : <Empty title="Chọn một phụ đề" />
          ) : null}
          <div className="mt12" style={{ position: "relative", height: 64, background: "rgba(9,14,34,.55)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", cursor: "pointer" }}
            onMouseDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); player.setT(((e.clientX - r.left) / r.width) * tl.duration_ms); }}>
            {caps.map((c, i) => (
              <div key={i} title={c.text} onMouseDown={(e) => { e.stopPropagation(); setSelI(i); setPage(Math.floor(i / PAGE) + 1); player.setT(c.start_ms); }}
                style={{ position: "absolute", top: 8, bottom: 8, left: `${(c.start_ms / tl.duration_ms) * 100}%`, width: `calc(${((c.end_ms - c.start_ms) / tl.duration_ms) * 100}% - 3px)`, borderRadius: 8, padding: "4px 6px", fontSize: 11, overflow: "hidden", lineHeight: 1.25,
                  border: `1px solid ${i === selI ? "#FFD700" : "var(--border-2)"}`, background: i === selI ? "rgba(255,215,0,.12)" : "var(--panel-2)", color: issues.some((x) => x.i === i) ? "#ffd38a" : "var(--text-2)" }}>
                {c.text}
              </div>
            ))}
            <div style={{ position: "absolute", top: 0, bottom: 0, width: 2, background: "var(--primary-2)", left: `${(player.t / Math.max(1, tl.duration_ms)) * 100}%`, pointerEvents: "none" }} />
          </div>
          {bottomTab === "segments" && (
            <div className="xs muted mt8">Bấm một đoạn để chọn & nhảy tới; kéo mốc vào/ra trong bảng phụ đề.</div>
          )}
        </Card>
        <Card title={<span className="row"><AlertTriangle size={15} className="c-orange" /> Lưu ý ({issues.length})</span>}>
          {issues.length ? (
            <div className="col" style={{ gap: 6, maxHeight: 200, overflowY: "auto" }}>
              {issues.map((x) => (
                <div key={x.i} className="list-item" style={{ padding: 8 }} onClick={() => { setSelI(x.i); setPage(Math.floor(x.i / PAGE) + 1); player.setT(caps[x.i].start_ms); }}>
                  <Type size={13} className="c-orange" />
                  <span className="small grow">#{x.i + 1}: {x.probs.join(" · ")}</span>
                </div>
              ))}
              <div className="xs muted">Phụ đề quá dài khó đọc trên di động. Nên dưới {st.max_lines} dòng, ~14–16 từ/dòng (TC-009).</div>
            </div>
          ) : (
            <InfoNote>Tất cả phụ đề trong giới hạn {st.max_lines} dòng, ≤ 16 từ/dòng và tốc độ đọc hợp lý.</InfoNote>
          )}
          {issues.some((x) => x.lines > st.max_lines) && <div className="mt8"><Warn title="Sẽ bị cắt khi render">Engine cắt bớt dòng thừa và thêm “…”.</Warn></div>}
        </Card>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row between" style={{ gap: 10 }}>
      <span className="small t2" style={{ flexShrink: 0 }}>{label}</span>
      <div style={{ width: 150 }}>{children}</div>
    </div>
  );
}

function ColorIn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} style={{ width: 30, height: 30, border: 0, background: "none", padding: 0, cursor: "pointer" }} />
      <input className="input mono" style={{ height: 30 }} value={value} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value.toUpperCase())} />
    </div>
  );
}
