import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Cookie de sesión de la app (Fase 4: la emite Hono). */
const SESSION_COOKIE = process.env.SESSION_COOKIE ?? "session";

// Chequeo de sesión a nivel de request (solo presencia de la cookie).
// La validación REAL ocurre en los layouts vía /users/me:
// - (protected)/layout.tsx exige sesión (cualquier usuario)
// El panel admin vive en `apps/panel` (otro deploy) y NO se matchea acá.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  // Protege el área de usuario y las páginas de catálogo
  // (artista/álbum/canción + rutas top-level en inglés viven en el grupo
  // protegido): sin cookie -> login.
  if (
    (pathname.startsWith("/dashboard") ||
      pathname.startsWith("/artist") ||
      pathname.startsWith("/album") ||
      pathname.startsWith("/song") ||
      pathname.startsWith("/catalog") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/search") ||
      pathname.startsWith("/playlists") ||
      pathname.startsWith("/recently-played")) &&
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
  matcher: [
    "/dashboard/:path*",
    "/artist/:path*",
    "/album/:path*",
    "/song/:path*",
    "/catalog/:path*",
    "/songs/:path*",
    "/settings/:path*",
    "/search/:path*",
    "/playlists/:path*",
    "/recently-played/:path*",
    "/login",
    "/register",
  ],
};
