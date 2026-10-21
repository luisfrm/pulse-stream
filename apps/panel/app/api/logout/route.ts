import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Cookie de sesión del panel. En Fase 1 es la misma que setea Python. */
const PANEL_COOKIE = process.env.PANEL_SESSION_COOKIE ?? "session";

/**
 * Logout del lado del servidor del panel.
 *
 * La cookie es HttpOnly: solo una respuesta HTTP puede borrarla. La API
 * responde su propio Set-Cookie de expiración, pero esa respuesta es
 * cross-origin y puede no aplicarse; acá el PANEL emite el borrado en una
 * respuesta same-origin.
 *
 * No llama a la API: el JWT es stateless, borrar la cookie ES cerrar sesión.
 * Los atributos del Set-Cookie reflejan los que usa la API al setearla:
 *   ENV -> Secure (solo si ENV != local)
 *   COOKIE_DOMAIN -> Domain (comparte la cookie entre subdominios)
 *   COOKIE_SAMESITE -> SameSite (default lax)
 * Se emiten DOS variantes (host-only y con Domain) para cubrir cookies
 * seteadas con y sin Domain según el entorno.
 */
export async function POST(request: NextRequest) {
  const isLocal = (process.env.ENV ?? "local") === "local";
  const rawSamesite = process.env.COOKIE_SAMESITE ?? "";
  const samesite = isLocal
    ? "lax"
    : ["lax", "strict", "none"].includes(rawSamesite)
      ? rawSamesite!
      : "lax";
  const secure = !isLocal;
  const rawDomain = process.env.COOKIE_DOMAIN;
  const domain =
    isLocal || !rawDomain || rawDomain.trim() === ""
      ? undefined
      : rawDomain;

  const base = `${PANEL_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=${samesite}${secure ? "; Secure" : ""}`;

  const response = NextResponse.redirect(
    new URL("/login", request.url),
    303
  );
  response.headers.append("Set-Cookie", base);
  if (domain) {
    response.headers.append("Set-Cookie", `${base}; Domain=${domain}`);
  }
  return response;
}
