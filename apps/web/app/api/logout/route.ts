import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { clearedSessionCookies, resolveNextPath } from "./session-cookie";

/**
 * Logout del lado del servidor web.
 *
 * La cookie `session` es HttpOnly: solo una respuesta HTTP puede borrarla
 * (document.cookie no puede tocarla). La API responde su propio Set-Cookie de
 * expiración, pero esa respuesta es cross-origin desde el punto de vista del
 * browser y puede no aplicarse; acá el WEB emite el borrado en una respuesta
 * same-origin, que el browser procesa sí o sí.
 *
 * No llama a la API: la sesión es stateless, borrar la cookie ES cerrar sesión.
 * Los atributos del Set-Cookie salen de `clearedSessionCookies` (espejo de los
 * que usa la API al setearla).
 *
 * `GET` existe para CORTAR EL LOOP de cookies viejas: un usuario con un JWT de
 * fastapi-users (7 días) hace que `proxy.ts` lo mande a `/dashboard`, el layout
 * pide `/users/me`, recibe 401 y redirige acá. Esta respuesta borra la cookie y
 * manda a `/login`, así el siguiente request ya no la tiene (antes: redirect a
 * `/login` → el proxy veía la cookie → `/dashboard` → ERR_TOO_MANY_REDIRECTS).
 */

function logoutResponse(request: NextRequest, next?: string | null) {
  const response = NextResponse.redirect(
    new URL(resolveNextPath(next), request.url),
    303,
  );
  for (const cookie of clearedSessionCookies()) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}

/** Botón de logout (`<form method="POST" action="/api/logout">`). */
export async function POST(request: NextRequest) {
  return logoutResponse(request);
}

/**
 * GET de limpieza: lo usan los layouts cuando `getSession()` devuelve null
 * (cookie vencida o de otro backend). Acepta `?next=/ruta-local`.
 */
export async function GET(request: NextRequest) {
  return logoutResponse(request, request.nextUrl.searchParams.get("next"));
}
