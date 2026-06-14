export type ApiResult<T> = {
  ok: boolean;
  data: T | null;
  status: number;
  error?: string;
};

const API_BASE = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.VITE_API_BASE_URL ?? "" : "";

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getEffectiveApiBase() {
  if (!API_BASE || typeof window === "undefined") return API_BASE;

  try {
    const configuredUrl = new URL(API_BASE, window.location.origin);
    const currentHost = window.location.hostname;

    // A stale build-time localhost API base breaks deployed pages. When that
    // happens, fall back to same-origin /api requests routed by Nginx.
    if (!isLoopbackHost(currentHost) && isLoopbackHost(configuredUrl.hostname)) {
      return "";
    }
  } catch {
    return API_BASE;
  }

  return API_BASE;
}

export function withApiBase(url: string) {
  const effectiveApiBase = getEffectiveApiBase();
  if (!effectiveApiBase) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${effectiveApiBase}${url}`;
  return `${effectiveApiBase}/${url}`;
}

export async function requestJson<T>(url: string, options?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(withApiBase(url), options);
  let data: T | null = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const error = (data as { error?: string } | null)?.error || res.statusText || "Request failed";
    return { ok: false, data, status: res.status, error };
  }

  return { ok: true, data, status: res.status };
}
