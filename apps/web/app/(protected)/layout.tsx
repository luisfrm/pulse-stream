import { Suspense } from "react";
import { redirect } from "next/navigation";

import { FullScreenLoader } from "@/components/full-screen-loader";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSession } from "@/lib/services/session-service";

/**
 * Área protegida — usuarios logueados (sin requisito de rol).
 *
 * El layout NO hace await de la sesión: envuelve el shell en un Suspense que
 * muestra el full-screen mientras `GET /users/me` resuelve. El redirect por
 * falta de sesión sigue siendo server-side (en `ProtectedShell`), la seguridad
 * no cambia. `getSession` está deduplicada con React.cache: la página reusa
 * esta misma llamada.
 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <ProtectedShell>{children}</ProtectedShell>
    </Suspense>
  );
}

async function ProtectedShell({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const isAdmin = user.role === "admin" || user.is_superuser;

  return <DashboardShell user={user} isAdmin={isAdmin}>{children}</DashboardShell>;
}