import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Cookie de sesión del panel (Fase 4: `panel_session`, la emite Python). */
const PANEL_COOKIE = process.env.PANEL_SESSION_COOKIE ?? "panel_session";

/**
 * Guard a nivel request: chequea SOLO la presencia de la cookie de sesión.
 * La validación REAL ocurre en `app/panel/layout.tsx` vía `getSession()`
 * (GET /users/me) + chequeo de `role=admin`.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(PANEL_COOKIE);

  if (pathname.startsWith("/panel") && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Un admin ya logueado no necesita ver el login.
  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/panel", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/panel/:path*", "/login"],
};
