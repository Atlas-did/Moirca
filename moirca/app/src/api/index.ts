/**
 * Moirca API 客户端
 *
 * 后端: http://localhost:8000/api
 * 前端通过 Vite proxy 转发 /api/* → localhost:8000
 */

const BASE = '/api';

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = body?.error as ApiError | undefined;
    throw new Error(err?.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function uploadFile<T>(path: string, file: File, extra?: Record<string, string>): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => form.append(key, value));
  }

  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = body?.error as ApiError | undefined;
    throw new Error(err?.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = { get, post, uploadFile };
