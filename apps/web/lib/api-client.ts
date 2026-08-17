import type { components } from "@pulse-stream/api-types";

// Tipos generados desde el OpenAPI de apps/api (AGENTS.md: nunca a mano).
export type User = components["schemas"]["UserRead"];
export type Artist = components["schemas"]["ArtistRead"];
export type Song = components["schemas"]["SongRead"];
export type PresignResponse = components["schemas"]["PresignResponse"];
export type SongGenre = components["schemas"]["SongGenre"];

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiInit = RequestInit;

/**
 * Fetch tipado contra la API FastAPI. Las cookies de sesión viajan solas
 * (credentials: "include") — nunca se guardan tokens en localStorage.
 */
export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const isForm = init.body instanceof URLSearchParams;
  const headers = new Headers(init.headers);
  if (init.body && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      detail =
        typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail ?? body);
    } catch {
      // sin cuerpo JSON
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const authApi = {
  register: (email: string, password: string) =>
    apiFetch<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    apiFetch<void>("/auth/login", {
      method: "POST",
      body: new URLSearchParams({ username: email, password }),
    }),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
  me: () => apiFetch<User>("/users/me"),
};

export const artistsApi = {
  list: (q?: string) =>
    apiFetch<Page<Artist>>(`/artists${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  create: (name: string) =>
    apiFetch<Artist>("/artists", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) =>
    apiFetch<void>(`/artists/${id}`, { method: "DELETE" }),
};

export const songsApi = {
  list: (q?: string) =>
    apiFetch<Page<Song>>(`/songs${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  create: (payload: {
    title: string;
    artist_id?: string;
    artist_name?: string;
    genres: string[];
    lyrics?: string;
    object_key: string;
  }) => apiFetch<Song>("/songs", { method: "POST", body: JSON.stringify(payload) }),
  remove: (id: string) => apiFetch<void>(`/songs/${id}`, { method: "DELETE" }),
};

export const genresApi = {
  list: () => apiFetch<string[]>("/genres"),
};

export const uploadsApi = {
  presign: (filename: string, contentType: string, size: number) =>
    apiFetch<PresignResponse>("/uploads/presign", {
      method: "POST",
      body: JSON.stringify({
        filename,
        content_type: contentType,
        size,
      }),
    }),
};

/** Sube el archivo directo a R2 con la presigned URL (el audio no pasa por la API). */
export async function uploadToR2(presignedUrl: string, file: File): Promise<void> {
  const res = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "audio/mpeg" },
    body: file,
  });
  if (!res.ok) {
    throw new ApiError(res.status, `La subida a R2 falló (HTTP ${res.status})`);
  }
}

// Mensajes amigables para los códigos de error de fastapi-users y del backend.
const ERROR_MESSAGES: Record<string, string> = {
  LOGIN_BAD_CREDENTIALS: "Email o contraseña incorrectos.",
  REGISTER_USER_ALREADY_EXISTS: "Ya existe una cuenta con ese email.",
  REGISTER_INVALID_PASSWORD: "La contraseña no es válida (mínimo 3 caracteres).",
};

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    return ERROR_MESSAGES[err.message] ?? err.message;
  }
  return "Error inesperado. Intentá de nuevo.";
}
