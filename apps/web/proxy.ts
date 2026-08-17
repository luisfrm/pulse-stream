import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Chequeo de sesión a nivel de request (solo presencia de la cookie).
// La validación REAL del usuario ocurre en el layout del dashboard vía /users/me.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("session");

  // Protege el panel: sin cookie -> login (recordando a dónde iba)
  if (pathname.startsWith("/dashboard") && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Usuario ya logueado no necesita ver login/register
  if (hasSession && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
