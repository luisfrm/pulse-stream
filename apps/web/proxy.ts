import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Cookie de sesión de la app (Fase 4: la emite Hono en `apps/app-api`). */
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

  // No redirigir /login → /dashboard SOLO por presencia de la cookie: una
  // cookie vencida/inválida hace que el layout protegido vuelva a /login y el
  // proxy a /dashboard (loop infinito). La sesión real se valida contra
  // `/users/me` en el layout; el home también redirige si hay sesión válida.
  // Un usuario logueado que entra a /login simplemente ve el botón de Google.
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
