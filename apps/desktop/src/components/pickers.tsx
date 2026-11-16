import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { useApp } from "../lib/store";

/** Danh sách biến thể của chiến dịch hiện tại (poll nhẹ). */
export function useVariants(params?: Record<string, unknown>, poll = 8000) {
  const { campaign } = useApp();
  return useApi<{ total: number; items: any[] }>(campaign ? `/campaigns/${campaign.id}/variants` : null, { size: 500, ...params }, poll);
}

/** Biến thể đang chọn lưu trên URL (?v=…) để breadcrumb/liên kết giữa màn hình giữ ngữ cảnh. */
export function useSelectedVariant(items: any[] | undefined, prefer?: (v: any) => boolean) {
  const [sp, setSp] = useSearchParams();
  const id = sp.get("v");
  useEffect(() => {
    if (!items?.length) return;
    if (!id || !items.some((v) => v.id === id)) {
      const pick = (prefer && items.find(prefer)) || items[0];
      const next = new URLSearchParams(sp);
      next.set("v", pick.id);
      setSp(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, id]);
  const select = (vid: string) => {
    const next = new URLSearchParams(sp);
    next.set("v", vid);
    setSp(next, { replace: true });
  };
  return { id, select, variant: items?.find((v) => v.id === id) };
}

export function VariantSelect({ items, value, onChange, filter }: { items: any[]; value: string | null; onChange: (id: string) => void; filter?: (v: any) => boolean }) {
  const list = filter ? items.filter(filter) : items;
  return (
    <select className="select" value={value || ""} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 220 }}>
      {list.map((v) => (
        <option key={v.id} value={v.id}>
          {v.code} – {v.angle_label} · {v.audience_label}
        </option>
      ))}
    </select>
  );
}
