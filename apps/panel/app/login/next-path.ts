/** Destino por defecto del panel cuando `?next=` falta o es inválido. */
export const DEFAULT_PANEL_NEXT = "/panel";

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const LOGIN_PATH = /^\/login(?:[/?#]|$)/;

/**
 * Sanitiza el `next` del login del panel.
 *
 * Solo acepta rutas internas del panel (`/panel`, `/panel/...`,
 * `/panel?query` o `/panel#hash`). Rechaza:
 * - arrays ambiguos (`?next=a&next=b`) y valores no-string;
 * - URLs externas/esquemas (`https:`, `javascript:`), `//host`;
 * - backslashes (los navegadores/Next pueden normalizarlos a `/`);
 * - caracteres de control;
 * - segmentos `.`/`..` (path traversal);
 * - cualquier variante de `/login` (evita el bucle login → login).
 *
 * Un `string[]` de un solo elemento se trata como string; con más de uno se
 * usa el fallback para no elegir un valor arbitrario.
 */
export function sanitizeNextPath(
  value: string | string[] | null | undefined,
): string {
  const raw = Array.isArray(value)
    ? value.length === 1
      ? value[0]
      : null
    : value;

  if (typeof raw !== "string" || raw.length === 0) {
    return DEFAULT_PANEL_NEXT;
  }
  if (CONTROL_CHARS.test(raw) || raw.includes("\\")) {
    return DEFAULT_PANEL_NEXT;
  }
  if (SCHEME.test(raw) || raw.startsWith("//") || raw.includes("//")) {
    return DEFAULT_PANEL_NEXT;
  }
  if (!raw.startsWith("/panel")) {
    return DEFAULT_PANEL_NEXT;
  }

  const boundary = raw.charAt("/panel".length);
  if (boundary !== "" && boundary !== "/" && boundary !== "?" && boundary !== "#") {
    return DEFAULT_PANEL_NEXT;
  }

  const path = raw.split(/[?#]/, 1)[0] ?? "";
  if (path.split("/").some((segment) => segment === "." || segment === "..")) {
    return DEFAULT_PANEL_NEXT;
  }
  if (LOGIN_PATH.test(path)) {
    return DEFAULT_PANEL_NEXT;
  }

  return raw;
}
