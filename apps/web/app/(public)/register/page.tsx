import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Crear cuenta" };

/**
 * OAuth-only (Fase 4): no hay registro con email/contraseña. La cuenta se crea
 * con el primer login de Google, así que `/register` solo redirige a `/login`
 * conservando `next`.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;

  redirect(
    rawNext ? `/login?next=${encodeURIComponent(rawNext)}` : "/login"
  );
}
