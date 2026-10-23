import { FetchError } from "ofetch";

// Mensajes amigables para los códigos de error de fastapi-users y del backend.
const ERROR_MESSAGES: Record<string, string> = {
  LOGIN_BAD_CREDENTIALS: "Email o contraseña incorrectos.",
  // El backend lo usa también para username duplicado (mismo código).
  REGISTER_USER_ALREADY_EXISTS:
    "Ya existe una cuenta con ese email o nombre de usuario.",
  REGISTER_INVALID_PASSWORD: "La contraseña no es válida (mínimo 8 caracteres).",
  RESET_PASSWORD_BAD_TOKEN: "El enlace venció o ya se usó. Pedí uno nuevo.",
  RESET_PASSWORD_INVALID_PASSWORD:
    "La contraseña no es válida (mínimo 8 caracteres).",
};

/**
 * Código de error de la API.
 *
 * `fastapi-users` usa dos shapes: `{"detail": "CODE"}` (login, reset con token
 * inválido) y `{"detail": {"code": "CODE", "reason": "..."}}` (passwords
 * inválidas). El segundo se resuelve por `code` con el mismo mapa.
 */
function errorCode(detail: unknown): string | undefined {
  if (typeof detail === "string") return detail;
  if (typeof detail === "object" && detail !== null && "code" in detail) {
    const code = detail.code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Extrae el mensaje de error de la API desde un FetchError de ofetch.
 * Devuelve null si no hay un detalle formateable.
 */
export function formatApiErrorMessage(error: unknown): string | null {
  if (error instanceof FetchError) {
    const data = error.data as { detail?: unknown } | undefined;
    const code = errorCode(data?.detail);
    if (code) return ERROR_MESSAGES[code] ?? code;
  }
  return null;
}

export function friendlyError(error: unknown): string {
  const formatted = formatApiErrorMessage(error);
  if (formatted) return formatted;
  if (error instanceof Error && error.message) return error.message;
  return "Error inesperado. Intentá de nuevo.";
}
