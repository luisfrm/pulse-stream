import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Logout del lado del servidor web.
 *
 * La cookie `session` es HttpOnly: solo una respuesta HTTP puede borrarla
 * (document.cookie no puede tocarla). La API responde su propio Set-Cookie de
 * expiración, pero esa respuesta es cross-origin desde el punto de vista del
 * browser y puede no aplicarse; acá el WEB emite el borrado en una respuesta
 * same-origin, que el browser procesa sí o sí.
 *
 * No llama a la API: el JWT es stateless, borrar la cookie ES cerrar sesión.
 * Los atributos del Set-Cookie deben reflejar los que la API usa al setearla:
 *   ENV           -> Secure (solo si ENV != local)
 *   COOKIE_DOMAIN -> Domain (comparte la cookie entre subdominios)
 *   COOKIE_SAMESITE -> SameSite (default lax)
 * Se emiten DOS variantes (host-only y con Domain) para cubrir cookies
 * seteadas con y sin Domain según el entorno.
 */
export async function POST(request: NextRequest) {
  const samesite = ["lax", "strict", "none"].includes(
    process.env.COOKIE_SAMESITE ?? ""
  )
    ? process.env.COOKIE_SAMESITE!
    : "lax";
  const secure = (process.env.ENV ?? "local") !== "local";
  const domain = process.env.COOKIE_DOMAIN;

  const base = `session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=${samesite}${secure ? "; Secure" : ""}`;

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