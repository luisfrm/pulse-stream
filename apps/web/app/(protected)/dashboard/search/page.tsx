import { redirect } from "next/navigation";

export const metadata = { title: "Buscar" };

/**
 * Fase 5.5: la búsqueda vive en `/search` (top-level). Esta ruta queda como
 * redirect para no romper links viejos.
 */
export default function SearchRedirect() {
  redirect("/search");
}