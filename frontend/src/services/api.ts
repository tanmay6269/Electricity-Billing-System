import axios, { AxiosError } from "axios";

const TOKEN_KEY = "ebms_token";

export const tokenStore = {
  get: (): string | null => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* storage unavailable */
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const t = tokenStore.get();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    const url = error.config?.url || "";
    if (error.response?.status === 401 && !url.includes("/auth/login")) {
      tokenStore.clear();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

/** Turn any API error into a short, human message. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return "Cannot reach the server. Is the backend running?";
    const data = err.response.data as { detail?: unknown } | Blob | undefined;
    if (data && typeof data === "object" && "detail" in data) {
      const d = data.detail;
      if (typeof d === "string") return d;
      if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
    }
  }
  return fallback;
}

/** Download a file (CSV/PDF) from an authenticated endpoint. */
export async function downloadFile(url: string, params?: Record<string, unknown>, fallbackName = "download") {
  const res = await api.get(url, { params: clean(params), responseType: "blob" });
  const disp = (res.headers["content-disposition"] as string | undefined) || "";
  const match = /filename="?([^";]+)"?/.exec(disp);
  const name = match?.[1] || fallbackName;
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Open a PDF in a new tab (for printing). */
export async function openPdf(url: string) {
  const win = window.open("", "_blank");
  const res = await api.get(url, { params: { inline: true }, responseType: "blob" });
  const href = URL.createObjectURL(new Blob([res.data as Blob], { type: "application/pdf" }));
  if (win) win.location.href = href;
  else window.location.href = href;
}

/** Drop empty filter values so they are not sent as query params. */
export function clean(params?: Record<string, unknown>) {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== undefined && v !== null) out[k] = v;
  });
  return out;
}
