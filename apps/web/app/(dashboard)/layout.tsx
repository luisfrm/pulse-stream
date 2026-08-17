import Link from "next/link";
import { redirect } from "next/navigation";

import LogoutButton from "@/components/logout-button";
import { sessionService } from "@/lib/services/session-service";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Validación REAL de la sesión (el proxy solo chequea la presencia de cookie).
  const user = await sessionService.getSession();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-bg-highlight px-6 py-4">
        <Link
          href="/dashboard"
          className="font-display text-lg font-bold text-text-primary hover:text-brand-400"
        >
          Pulse Stream
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-text-subdued sm:inline">
            {user.email}
          </span>
          {user.is_superuser && (
            <span className="rounded-pill bg-brand-900/50 px-3 py-1 text-xs font-semibold text-brand-200">
              admin
            </span>
          )}
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
