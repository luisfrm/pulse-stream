/**
 * Resetea la password de un usuario directamente en la base (out-of-band).
 *
 * Para qué: las passwords legacy del backend Python son argon2 y NO se migran
 * (better-auth usa scrypt en `account.password`). Un usuario migrado no puede
 * loguearse hasta que se le asigne una password nueva; esto lo hace sin pasar
 * por el flujo de email (que hoy es log-only).
 *
 * Uso (desde `apps/api-worker`):
 *   pnpm user:set-password <email>                  # genera una password
 *   pnpm user:set-password <email> --password <pwd>
 *   CONFIRM_TARGET=yes pnpm user:set-password ...   # destino ≠ test
 *
 * Destino: `DATABASE_URL` de `.dev.vars`. Si el host/base NO coincide con
 * `TEST_DATABASE_URL` exige `CONFIRM_TARGET=yes` (mismo guard que el migrador).
 * La password generada se imprime UNA sola vez.
 */

import { randomBytes } from "node:crypto";

import { config as loadEnv } from "dotenv";

import { setUserPassword } from "../src/auth/passwords";
import { createConfig, type Bindings } from "../src/env";
import { findUserByEmail } from "../src/repositories/users";

loadEnv({ path: ".dev.vars" });

interface Target {
  host: string;
  database: string;
  endpoint: string;
}

function parseTarget(raw: string | undefined, label: string): Target | undefined {
  if (!raw || raw.trim() === "") return undefined;
  try {
    const url = new URL(raw.trim());
    return {
      host: url.host,
      database: url.pathname.replace(/^\//, "") || "<sin base>",
      endpoint: (url.hostname.split(".")[0] ?? "").replace(/-pooler$/, ""),
    };
  } catch {
    throw new Error(`${label} no es una URL válida.`);
  }
}

function parseArgs(argv: readonly string[]): {
  email: string;
  password?: string;
} {
  const positional: string[] = [];
  let password: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--password" || arg === "-p") {
      password = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg !== undefined) positional.push(arg);
  }

  const email = positional[0]?.trim();
  if (!email) {
    throw new Error(
      "Falta el email. Uso: pnpm user:set-password <email> [--password <pwd>]",
    );
  }
  return { email, ...(password ? { password } : {}) };
}

/** 18 chars base64url + sufijo: cumple el mínimo de 8 de better-auth. */
function generatePassword(): string {
  return `${randomBytes(13).toString("base64url")}Aa1`;
}

const { email, password: providedPassword } = parseArgs(
  process.argv.slice(2),
);

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  throw new Error(
    "Falta DATABASE_URL en .dev.vars (o en el entorno): no hay destino.",
  );
}

const target = parseTarget(url, "DATABASE_URL");
if (!target) throw new Error("DATABASE_URL vacía en .dev.vars.");

const testTarget = parseTarget(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL");
const matchesTest =
  testTarget !== undefined &&
  testTarget.endpoint === target.endpoint &&
  testTarget.database === target.database;

console.log(`Destino: host=${target.host} base=${target.database}`);

if (!matchesTest) {
  console.log(
    testTarget
      ? `Referencia de test: host=${testTarget.host} base=${testTarget.database}`
      : "TEST_DATABASE_URL no está definida: no hay destino de referencia.",
  );
  if (process.env.CONFIRM_TARGET !== "yes") {
    throw new Error(
      "El destino de DATABASE_URL NO coincide con TEST_DATABASE_URL. " +
        "Si realmente querés cambiar una password ahí, corré con CONFIRM_TARGET=yes.",
    );
  }
  console.log("CONFIRM_TARGET=yes: operando sobre un destino distinto al de test.");
}

const bindings: Bindings = {
  ENV: "local",
  DATABASE_URL: url,
  ...(process.env.AUTH_SECRET ? { AUTH_SECRET: process.env.AUTH_SECRET } : {}),
};
const config = createConfig(bindings);

const user = await findUserByEmail(config, email);
if (!user) {
  throw new Error(`No existe un usuario con email ${email}.`);
}

const password = providedPassword ?? generatePassword();
await setUserPassword(config, user.id, password);

console.log(`Password actualizada para ${user.email} (id=${user.id}).`);
if (providedPassword) {
  console.log("Se usó la password provista por --password.");
} else {
  console.log("");
  console.log(`  password: ${password}`);
  console.log("");
  console.log("Guardala ahora: no se vuelve a mostrar.");
}
