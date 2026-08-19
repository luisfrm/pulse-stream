import { redirect } from "next/navigation";

export const metadata = { title: "Canciones" };

/**
 * Fase 5.5: explorar canciones vive en `/songs` (top-level). Esta ruta queda
 * como redirect para no romper links viejos.
 */
export default function CancionesRedirect() {
  redirect("/songs");
}