import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Iniciar sesión" };

/**
 * No hay registro público: el seed del panel crea `panel_users` (admins), no
 * cuentas de la app. Se mantiene `/register` como redirect por compatibilidad
 * con links viejos.
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
