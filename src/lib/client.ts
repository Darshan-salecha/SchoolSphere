'use client';

export type ApiError = { error: string; code?: string; details?: Record<string, string[]> };

export class ApiRequestError extends Error {
  constructor(message: string, readonly details?: Record<string, string[]>, readonly status?: number) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as T & ApiError) : ({} as T & ApiError);
  if (!res.ok) throw new ApiRequestError(json.error ?? 'Something went wrong. Please try again.', json.details, res.status);
  return json as T;
}

export const api = {
  get: <T,>(url: string) => request<T>('GET', url),
  post: <T,>(url: string, body?: unknown) => request<T>('POST', url, body),
  patch: <T,>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  put: <T,>(url: string, body?: unknown) => request<T>('PUT', url, body),
  del: <T,>(url: string) => request<T>('DELETE', url),
};
