import { Suspense } from "react";
import { redirect } from "next/navigation";

import { FullScreenLoader } from "@pulse-stream/ui";
import { PanelShell } from "@/components/panel-shell";
import { getInitStatus } from "@/lib/services/init-service";
import { getSession } from "@/lib/services/session-service";

/** La app es otro deploy en Fase 1: el no-admin vuelve al home de la app. */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Panel de administración — SOLO role="admin".
 *
 * Guards (en orden):
 * 1. Panel sin cuentas  -> /init (bootstrap del primer admin)
 * 2. Sin sesión         -> /login (recordando a dónde iba)
 * 3. Logueado sin rol   -> / (home público; el usuario normal no ve el panel)
 *
 * Permisos: SOLO `role="admin"`. `is_superuser` existe porque fastapi-users lo
 * exige, pero no autoriza.
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
  const { needs_init } = await getInitStatus();
  if (needs_init) redirect("/init");

  const user = await getSession();
  if (!user) redirect("/login?next=/panel");

  if (user.role !== "admin") redirect(APP_URL);

  return <PanelShell user={user}>{children}</PanelShell>;
}