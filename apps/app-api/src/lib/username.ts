/**
 * Generador de `username` para cuentas creadas por Google OAuth.
 *
 * Reglas (alineadas con `UserCreate` de Python: `^[\w.\- ]+$`, 2..50 chars):
 * - se parte del local-part del email, en lowercase;
 * - se quitan acentos y se reemplaza cualquier caracter no permitido por `-`;
 * - nunca queda vacío (`user` como fallback);
 * - las colisiones se resuelven con sufijos `-2`, `-3`, ... y, agotados los
 *   intentos, con un sufijo aleatorio corto.
 */
export const USERNAME_MAX_LENGTH = 50;
const BASE_MAX_LENGTH = 40;
const MAX_ATTEMPTS = 10;

export function sanitizeUsername(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    // Colapsa separadores repetidos: "a--b" -> "a-b".
    .replace(/[-_.]{2,}/g, (match) => match.charAt(0))
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, BASE_MAX_LENGTH)
    .replace(/[-_.]+$/g, "");

  return normalized || "user";
}

export function usernameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  return sanitizeUsername(localPart);
}

/** Candidatos determinísticos: base, base-2, base-3, ... */
export function usernameCandidates(
  base: string,
  maxAttempts = MAX_ATTEMPTS,
): string[] {
  const root = sanitizeUsername(base);
  const candidates: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt === 0) {
      candidates.push(root);
      continue;
    }
    const suffix = `-${attempt + 1}`;
    candidates.push(
      `${root.slice(0, USERNAME_MAX_LENGTH - suffix.length)}${suffix}`,
    );
  }

  return candidates;
}

/**
 * Devuelve el primer candidato libre según `isTaken`.
 * Si todos están tomados, agrega un sufijo aleatorio (no adivinable, sin
 * colisiones prácticas).
 */
export async function generateUsername(
  base: string,
  isTaken: (candidate: string) => boolean | Promise<boolean>,
  maxAttempts = MAX_ATTEMPTS,
): Promise<string> {
  for (const candidate of usernameCandidates(base, maxAttempts)) {
    if (!(await isTaken(candidate))) return candidate;
  }

  const root = sanitizeUsername(base).slice(0, BASE_MAX_LENGTH);
  const suffix = `-${crypto.randomUUID().slice(0, 8)}`;
  return `${root}${suffix}`;
}
