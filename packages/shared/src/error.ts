import { FetchError } from "ofetch";

// Mensajes amigables para los códigos de error de fastapi-users y del backend.
const ERROR_MESSAGES: Record<string, string> = {
  LOGIN_BAD_CREDENTIALS: "Email o contraseña incorrectos.",
  // El backend lo usa también para username duplicado (mismo código).
  REGISTER_USER_ALREADY_EXISTS:
    "Ya existe una cuenta con ese email o nombre de usuario.",
  REGISTER_INVALID_PASSWORD: "La contraseña no es válida (mínimo 3 caracteres).",
};

/**
 * Extrae el mensaje de error de la API desde un FetchError de ofetch.
 * Devuelve null si no hay un detalle formateable.
 */
export function formatApiErrorMessage(error: unknown): string | null {
  if (error instanceof FetchError) {
    const data = error.data as { detail?: unknown } | undefined;
    const detail = typeof data?.detail === "string" ? data.detail : undefined;
    if (detail) return ERROR_MESSAGES[detail] ?? detail;
  }
  return null;
}

export function friendlyError(error: unknown): string {
  const formatted = formatApiErrorMessage(error);
  if (formatted) return formatted;
  if (error instanceof Error && error.message) return error.message;
  return "Error inesperado. Intentá de nuevo.";
}
