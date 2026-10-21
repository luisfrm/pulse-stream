import { argon2idAsync } from "@noble/hashes/argon2.js";

/**
 * Verificación de passwords locales (argon2id, PHC string de `pwdlib`).
 *
 * El panel Python hashea con `pwdlib.PasswordHash.recommended()`. Usamos
 * `@noble/hashes` (JS puro) en vez de una librería WASM porque `hash-wasm`
 * verifica en Node pero falla en el runtime de Workers.
 *
 * ⚠️ CPU: argon2id (64 MB, 3 pasadas) tarda cientos de ms. En Workers Free el
 * límite es 10 ms → el login con password requiere Workers Paid en producción.
 * En local (`wrangler dev`) no hay ese límite.
 */

const ARGON2ID = "argon2id";
const VERSION_19 = "v=19";

function decodeBase64(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function parseNumber(params: string, key: string): number | null {
  const match = new RegExp(`(?:^|,)${key}=(\\d+)`).exec(params);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  // PHC: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
  const parts = hash.split("$");
  if (
    parts.length !== 6 ||
    parts[0] !== "" ||
    parts[1] !== ARGON2ID ||
    parts[2] !== VERSION_19
  ) {
    return false;
  }

  const [, , , params, saltEncoded, hashEncoded] = parts;
  if (!params || !saltEncoded || !hashEncoded) return false;

  const memory = parseNumber(params, "m");
  const iterations = parseNumber(params, "t");
  const parallelism = parseNumber(params, "p");
  if (memory === null || iterations === null || parallelism === null) {
    return false;
  }

  const salt = decodeBase64(saltEncoded);
  const expected = decodeBase64(hashEncoded);
  if (!salt || !expected || expected.length === 0) return false;

  try {
    const derived = await argon2idAsync(
      new TextEncoder().encode(password),
      salt,
      {
        m: memory,
        t: iterations,
        p: parallelism,
        version: 0x13,
        dkLen: expected.length,
      },
    );
    return constantTimeEqual(derived, expected);
  } catch (error) {
    // Hash corrupto, parámetros fuera de rango o memoria insuficiente.
    console.error("[auth] password verify error", error);
    return false;
  }
}
