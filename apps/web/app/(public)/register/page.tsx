import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Iniciar sesión" };

/**
 * No hay registro público: las cuentas las crea el seed del panel. Se mantiene
 * `/register` como redirect por compatibilidad con links viejos.
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
