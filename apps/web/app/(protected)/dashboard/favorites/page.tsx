import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Mi catálogo" };

/**
 * Fase 5: los favoritos viven en "Mi catálogo" (`/dashboard/catalogo`).
 * Esta ruta queda como redirect para no romper links viejos.
 */
export default function FavoritesRedirect() {
  redirect("/dashboard/catalogo");
}
