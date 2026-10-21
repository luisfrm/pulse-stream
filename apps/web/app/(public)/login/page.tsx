import type { Metadata } from "next";
import Link from "next/link";

import { AuthBackground, BrandLogo } from "@pulse-stream/ui";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

/**
 * Login con email/usuario + contraseña. No hay registro público ni OAuth: las
 * cuentas las crea el seed del panel.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const returnTo = sanitizeReturnTo(rawNext);

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
      <AuthBackground />
      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-3xl border border-white/10 bg-bg-base/70 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-6 flex justify-center">
            <BrandLogo size={44} />
          </div>
          <h1 className="text-center font-display text-3xl font-bold">
            Bienvenido de nuevo
          </h1>
          <p className="mt-2 text-center text-sm text-text-subdued">
            Entrá con tu email o usuario y contraseña.
          </p>

          <LoginForm next={returnTo} />

          <p className="mt-5 text-center text-xs text-text-subdued">
            ¿No tenés cuenta? El acceso es por invitación; pedile a un
            administrador que te cree una.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-text-subdued">
          <Link
            href="/"
            className="font-medium text-brand-400 hover:underline"
          >
            Volver al inicio
          </Link>
        </p>
      </div>
    </main>
  );
}

/** `returnTo` solo acepta paths internos (misma regla que el backend Hono). */
function sanitizeReturnTo(value?: string): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/dashboard";
  }
  return value;
}
