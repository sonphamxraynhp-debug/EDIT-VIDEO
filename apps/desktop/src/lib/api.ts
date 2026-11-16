import { useCallback, useEffect, useRef, useState } from "react";

export const API = "/api/v1";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  hint?: string | null;
  trace_id?: string;
}

export class ApiError extends Error {
  body: ApiErrorBody;
  status: number;
  constructor(body: ApiErrorBody, status: number) {
    super(body.message);
    this.body = body;
    this.status = status;
  }
}

async function handle<T>(r: Response): Promise<T> {
  if (r.ok) {
    const ct = r.headers.get("content-type") || "";
    return (ct.includes("json") ? r.json() : r.text()) as Promise<T>;
  }
  let body: ApiErrorBody = { code: `HTTP_${r.status}`, message: r.statusText || "Lỗi kết nối" };
  try {
    const j = await r.json();
    if (j.error) body = j.error;
    else if (j.detail) body = { code: "VALIDATION", message: "Dữ liệu không hợp lệ", details: { detail: j.detail } };
  } catch {
    /* body không phải JSON */
  }
  throw new ApiError(body, r.status);
}

function wrapNetwork(e: unknown): never {
  if (e instanceof ApiError) throw e;
  throw new ApiError(
    { code: "BACKEND_OFFLINE", message: "Không kết nối được dịch vụ local", hint: "Đóng app rồi mở lại. Nếu vẫn lỗi, khởi động lại máy." },
    0,
  );
}

export const api = {
  get: <T = any>(path: string, params?: Record<string, unknown>) => {
    const qs = params
      ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString()
      : "";
    return fetch(API + path + qs).then((r) => handle<T>(r)).catch(wrapNetwork);
  },
  send: <T = any>(method: string, path: string, body?: unknown, params?: Record<string, unknown>) => {
    const qs = params ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : "";
    return fetch(API + path + qs, {
      method,
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)).catch(wrapNetwork);
  },
  post: <T = any>(path: string, body?: unknown, params?: Record<string, unknown>) => api.send<T>("POST", path, body, params),
  put: <T = any>(path: string, body?: unknown) => api.send<T>("PUT", path, body),
  patch: <T = any>(path: string, body?: unknown) => api.send<T>("PATCH", path, body),
  del: <T = any>(path: string, params?: Record<string, unknown>) => api.send<T>("DELETE", path, undefined, params),
};

/** URL phục vụ file local (proxy, keyframe, output) qua backend. */
export function fileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  return `${API}/files?path=${encodeURIComponent(path)}`;
}

/** Hook đọc dữ liệu có loading/error/reload; poll tùy chọn (ms). */
export function useApi<T = any>(path: string | null, params?: Record<string, unknown>, poll?: number) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const key = path ? path + JSON.stringify(params || {}) : null;
  // Mỗi lần đổi key là một "đời" mới: phản hồi chậm của key cũ không được ghi đè dữ liệu của key mới
  const gen = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!path) return;
      const mine = gen.current;
      if (!silent) setLoading(true);
      try {
        const d = await api.get<T>(path, params);
        if (mine === gen.current) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (mine === gen.current) setError(e as ApiError);
      } finally {
        if (mine === gen.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const firstKey = useRef(key);
  useEffect(() => {
    if (firstKey.current !== key) {       // đổi dự án/đường dẫn: bỏ dữ liệu cũ để không hiện nhầm
      firstKey.current = key;
      setData(undefined);
      setError(null);
    }
    load();
    if (!poll) return () => { gen.current++; };
    const t = setInterval(() => { if (!document.hidden) load(true); }, poll);
    return () => {
      gen.current++;
      clearInterval(t);
    };
  }, [load, poll]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, reload: () => load(true), setData };
}

/** Theo dõi tiến độ hàng đợi qua Server-Sent Events. */
export function useQueueEvents(onEvent: (e: { jobs: any[]; stats: Record<string, number> }) => void) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  useEffect(() => {
    const es = new EventSource(`${API}/render/events`);
    es.onmessage = (m) => {
      try {
        cb.current(JSON.parse(m.data));
      } catch {
        /* bỏ qua gói lỗi */
      }
    };
    return () => es.close();
  }, []);
}
