import { redirect } from "next/navigation";

import { PanelShell } from "@/components/panel-shell";
import { sessionService } from "@/lib/services/session-service";

/**
 * Panel de administración — SOLO role="admin".
 *
 * Guards (en orden):
 * 1. Sin sesión          -> /login (recordando a dónde iba)
 * 2. Logueado sin rol    -> / (home público; el usuario normal no ve el panel)
 *
 * El shell (sidebar + drawer móvil) vive en `PanelShell` para no duplicar el
 * patrón del dashboard.
 */
export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await sessionService.getSession();
  if (!user) redirect("/login?next=/panel");

  const isAdmin = user.role === "admin" || user.is_superuser;
  if (!isAdmin) redirect("/");

  return <PanelShell user={user}>{children}</PanelShell>;
}