import { redirect } from "next/navigation";

export const metadata = { title: "Mi catálogo" };

/**
 * Fase 5.5: la biblioteca vive en `/catalog` (top-level). Esta ruta queda
 * como redirect para no romper links viejos.
 */
export default function CatalogoRedirect() {
  redirect("/catalog");
}