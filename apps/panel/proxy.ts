import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Cookie de sesión del panel (Fase 4: `panel_session`, la emite Python). */
const PANEL_COOKIE = process.env.PANEL_SESSION_COOKIE ?? "panel_session";

/**
 * Guard a nivel request: chequea SOLO la presencia de la cookie de sesión.
 * La validación REAL ocurre en `app/panel/layout.tsx` vía `getSession()`
 * (GET /users/me) + chequeo de `role=admin`.
 *
 * `/login` e `/init` NO redirigen por presencia de cookie: una cookie vencida
 * o inválida produciría un bucle login → panel → login. Esas páginas validan
 * la sesión server-side y redirigen solo si es real. El estado de bootstrap se
 * consulta en las páginas server-side, no en el proxy (sin fetch por request).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(PANEL_COOKIE);

  if (pathname.startsWith("/panel") && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/panel/:path*", "/login", "/init"],
};
