import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { sessionService } from "@/lib/services/session-service";

/**
 * Área protegida — usuarios logueados (sin requisito de rol).
 * Layout con sidebar (desktop) + drawer (móvil) en vez del top-nav viejo.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await sessionService.getSession();
  if (!user) redirect("/login");

  const isAdmin = user.role === "admin" || user.is_superuser;

  return (
    <DashboardShell user={user} isAdmin={isAdmin}>
      {children}
    </DashboardShell>
  );
}