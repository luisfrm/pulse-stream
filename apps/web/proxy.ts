import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Chequeo de sesión a nivel de request (solo presencia de la cookie).
// La validación REAL ocurre en los layouts vía /users/me:
// - (protected)/layout.tsx exige sesión (cualquier usuario)
// - (panel)/layout.tsx exige sesión + role=admin (si no, -> home)
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("session");

  // Protege el panel y el área de usuario: sin cookie -> login (recordando a dónde iba)
  if (
    (pathname.startsWith("/dashboard") || pathname.startsWith("/panel")) &&
    !hasSession
  ) {
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
  matcher: ["/dashboard/:path*", "/panel/:path*", "/login", "/register"],
};
