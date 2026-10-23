/**
 * Lógica pura del logout del web (sin `next/server`, testeable con Vitest).
 *
 * La cookie `session` es HttpOnly: solo una respuesta HTTP la borra. Estos
 * helpers construyen el `Set-Cookie` de expiración (en DOS variantes: host-only
 * y con `Domain`, para cubrir cookies seteadas con y sin dominio) y validan el
 * `?next=` para que un redirect no se convierta en un open redirect.
 */

/** Variables de entorno relevantes (espejo de las de la API). */
export interface LogoutEnv {
  ENV?: string;
  COOKIE_SAMESITE?: string;
  COOKIE_DOMAIN?: string;
}

/** Destino por defecto del logout. */
export const DEFAULT_LOGOUT_NEXT = "/login";

/**
 * `?next=` seguro: SOLO rutas locales (`/algo`).
 *
 * Rechaza URLs absolutas (`https://…`), protocol-relative (`//evil.com`) y
 * esquemas raros (`javascript:…`): cualquiera de esos sería un open redirect.
 */
export function resolveNextPath(candidate: string | null | undefined): string {
  if (typeof candidate !== "string") return DEFAULT_LOGOUT_NEXT;

  const value = candidate.trim();
  if (!value.startsWith("/")) return DEFAULT_LOGOUT_NEXT;
  if (value.startsWith("//")) return DEFAULT_LOGOUT_NEXT;
  if (value.includes("\\")) return DEFAULT_LOGOUT_NEXT;

  return value;
}

/**
 * `Set-Cookie` que borra la sesión.
 *
 * Los atributos deben reflejar los que la API usa al setearla (si no, el
 * navegador conserva la cookie):
 *   ENV            -> Secure (solo si ENV != local)
 *   COOKIE_DOMAIN  -> Domain (comparte la cookie entre subdominios)
 *   COOKIE_SAMESITE-> SameSite (default lax)
 */
export function clearedSessionCookies(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  const isLocal = (env.ENV ?? "local") === "local";
  const rawSameSite = env.COOKIE_SAMESITE ?? "";
  const sameSite = isLocal
    ? "lax"
    : ["lax", "strict", "none"].includes(rawSameSite)
      ? rawSameSite
      : "lax";
  const secure = !isLocal;
  const rawDomain = env.COOKIE_DOMAIN;
  const domain =
    isLocal || !rawDomain || rawDomain.trim() === "" ? undefined : rawDomain;

  const base = `session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=${sameSite}${secure ? "; Secure" : ""}`;

  return domain ? [base, `${base}; Domain=${domain}`] : [base];
}
