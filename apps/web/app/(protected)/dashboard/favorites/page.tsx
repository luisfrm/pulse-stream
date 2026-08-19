import { redirect } from "next/navigation";

export const metadata = { title: "Mi catálogo" };

/**
 * Fase 5: los favoritos viven en "Mi catálogo" (`/catalog`).
 * Esta ruta queda como redirect para no romper links viejos.
 */
export default function FavoritesRedirect() {
  redirect("/catalog");
}