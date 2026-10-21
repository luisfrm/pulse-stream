import type { Metadata } from "next";
import Link from "next/link";

import { authService } from "@/lib/services/auth-service";
import { AuthBackground, BrandLogo } from "@pulse-stream/ui";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

/**
 * Login OAuth-only (Fase 4): la app no maneja email/contraseña. El botón lleva
 * al flow de Google de la API Hono, que crea o vincula la cuenta en el primer
 * login y vuelve a `returnTo` con la cookie `session` seteada.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const returnTo = sanitizeReturnTo(rawNext);
  const googleUrl = authService.googleAuthUrl(returnTo);

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
            Entrá con Google o con tu email/usuario y contraseña.
          </p>

          <a
            href={googleUrl}
            className="mt-8 flex items-center justify-center gap-3 rounded-pill bg-text-primary px-6 py-3 font-semibold text-bg-base transition-all hover:bg-text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 active:scale-[0.99]"
          >
            <GoogleIcon />
            Continuar con Google
          </a>

          <div
            className="mt-7 flex items-center gap-3 text-xs text-text-subdued"
            aria-hidden
          >
            <span className="h-px flex-1 bg-white/10" />
            <span>o</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <LoginForm next={returnTo} />

          <p className="mt-5 text-center text-xs text-text-subdued">
            ¿Primera vez? Creá tu cuenta con Google. El login con contraseña es
            para cuentas existentes.
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

/** Isotipo de Google (multicolor) para el botón de OAuth. */
function GoogleIcon() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.55-5.17 3.55-8.86Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.26a12 12 0 0 0 0 10.74l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.35.61 4.59 1.8l3.44-3.44A11.6 11.6 0 0 0 12 0 11.99 11.99 0 0 0 1.26 6.63l4.01 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}
