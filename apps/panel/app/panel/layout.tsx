import { Suspense } from "react";
import { redirect } from "next/navigation";

import { FullScreenLoader } from "@pulse-stream/ui";
import { PanelShell } from "@/components/panel-shell";
import { getSession } from "@/lib/services/session-service";

/** La app es otro deploy en Fase 1: el no-admin vuelve al home de la app. */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Panel de administración — SOLO role="admin".
 *
 * Guards (en orden):
 * 1. Sin sesión          -> /login (recordando a dónde iba)
 * 2. Logueado sin rol    -> / (home público; el usuario normal no ve el panel)
 *
 * El shell (sidebar + drawer móvil) vive en `PanelShell` para no duplicar el
 * patrón del dashboard. Igual que el layout protegido: la sesión se resuelve
 * dentro de un Suspense (sin bloquear el primer chunk) y el redirect sigue
 * siendo server-side.
 */
export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <PanelGate>{children}</PanelGate>
    </Suspense>
  );
}

async function PanelGate({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login?next=/panel");

  const isAdmin = user.role === "admin" || user.is_superuser;
  if (!isAdmin) redirect(APP_URL);

  return <PanelShell user={user}>{children}</PanelShell>;
}