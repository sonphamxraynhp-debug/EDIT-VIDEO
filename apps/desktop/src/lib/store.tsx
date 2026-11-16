import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, useApi } from "./api";

export interface Toast {
  id: number;
  kind: "success" | "error" | "warn";
  title: string;
  body?: string;
  code?: string;
  hint?: string | null;
}

interface Ctx {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  project: any;
  campaign: any;
  product: any;
  reloadProject: () => void;
  projects: any[];
  reloadProjects: () => void;
  hw: any;
  health: any;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  toastError: (e: unknown, title?: string) => void;
  dismiss: (id: number) => void;
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

const KEY = "avf.projectId";

export function AppProvider({ children }: { children: ReactNode }) {
  const [projectId, setPid] = useState<string | null>(() => {
    // ?project=<id> mở thẳng một dự án (liên kết chia sẻ, ảnh chụp tài liệu)
    const fromUrl = new URLSearchParams(window.location.search).get("project");
    try {
      if (fromUrl) localStorage.setItem(KEY, fromUrl);
      return fromUrl || localStorage.getItem(KEY);
    } catch {
      return fromUrl;
    }
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const projects = useApi<any[]>("/projects", undefined, 15000);
  const projectQ = useApi<any>(projectId ? `/projects/${projectId}` : null, undefined, 10000);
  const hw = useApi<any>("/system/hardware", undefined, 3000);
  const health = useApi<any>("/system/health", undefined, 20000);

  // Chọn dự án đầu tiên nếu chưa có / dự án đã bị xoá
  useEffect(() => {
    const list = projects.data;
    if (!list) return;
    if (!projectId || !list.some((p) => p.id === projectId)) {
      const first = list[0]?.id ?? null;
      if (first !== projectId) setProjectId(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.data]);

  const setProjectId = useCallback((id: string | null) => {
    setPid(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage bị chặn: vẫn chạy */
    }
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.kind === "error" ? 9000 : 4000);
  }, []);

  const toastError = useCallback(
    (e: unknown, title?: string) => {
      const b = e instanceof ApiError ? e.body : { code: "UNKNOWN", message: String(e), hint: null };
      toast({ kind: "error", title: title || b.message, body: title ? b.message : undefined, code: b.code, hint: b.hint });
    },
    [toast],
  );

  const value = useMemo<Ctx>(
    () => ({
      projectId,
      setProjectId,
      project: projectQ.data,
      campaign: projectQ.data?.campaign,
      product: projectQ.data?.product,
      reloadProject: projectQ.reload,
      projects: projects.data || [],
      reloadProjects: projects.reload,
      hw: hw.data,
      health: health.data,
      toasts,
      toast,
      toastError,
      dismiss: (id: number) => setToasts((x) => x.filter((y) => y.id !== id)),
    }),
    [projectId, setProjectId, projectQ.data, projectQ.reload, projects.data, projects.reload, hw.data, health.data, toasts, toast, toastError],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/** Gọi API có trạng thái loading + toast lỗi/thành công. */
export function useAction() {
  const { toast, toastError } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        if (success) toast({ kind: "success", title: success });
        return r;
      } catch (e) {
        toastError(e);
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [toast, toastError],
  );
  return { busy, run, api };
}
