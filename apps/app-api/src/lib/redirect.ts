/**
 * Sanitiza `returnTo` para evitar open redirects.
 *
 * Solo se aceptan paths absolutos del propio frontend:
 * - empieza con `/`;
 * - no empieza con `//` (protocol-relative);
 * - sin backslashes (algunos navegadores normalizan `\` a `/`);
 * - sin caracteres de control (CR/LF/header injection);
 * - sin esquema (`https:`, `javascript:`, ...).
 */
export const DEFAULT_RETURN_TO = "/dashboard";

export function safeReturnTo(
  value: string | null | undefined,
  fallback: string = DEFAULT_RETURN_TO,
): string {
  if (typeof value !== "string") return fallback;

  const candidate = value.trim();
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//")) return fallback;
  if (candidate.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return fallback;

  return candidate;
}

/** `${APP_URL}${returnTo}` con `returnTo` ya saneado. */
export function absoluteAppRedirect(appUrl: string, returnTo: string): string {
  return `${appUrl.replace(/\/+$/, "")}${safeReturnTo(returnTo)}`;
}
