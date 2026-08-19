import { redirect } from "next/navigation";

export const metadata = { title: "Recientes" };

/**
 * Fase 5.5: los recientes viven en `/recently-played` (top-level). Esta ruta
 * queda como redirect para no romper links viejos.
 */
export default function RecentlyPlayedRedirect() {
  redirect("/recently-played");
}