export type ApiResult<T> = {
  ok: boolean;
  data: T | null;
  status: number;
  error?: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export function withApiBase(url: string) {
  if (!API_BASE) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
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
