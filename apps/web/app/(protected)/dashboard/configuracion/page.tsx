import { redirect } from "next/navigation";

export const metadata = { title: "Configuración" };

/**
 * Fase 5.5: la configuración vive en `/settings` (top-level). Esta ruta queda
 * como redirect para no romper links viejos.
 */
export default function ConfiguracionRedirect() {
  redirect("/settings");
}