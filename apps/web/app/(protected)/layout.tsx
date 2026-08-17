import Link from "next/link";
import { redirect } from "next/navigation";

import LogoutButton from "@/components/logout-button";
import { Badge } from "@/components/ui";
import { sessionService } from "@/lib/services/session-service";

/**
 * Área protegida — usuarios logueados (sin requisito de rol).
 * Cualquier usuario autenticado accede a sus configuraciones normales.
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
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-bg-highlight px-6 py-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="font-display text-lg font-bold text-text-primary hover:text-brand-400"
          >
            Pulse Stream
          </Link>
          <nav className="hidden gap-4 text-sm text-text-subdued sm:flex">
            <Link href="/dashboard" className="hover:text-text-primary">
              Mi cuenta
            </Link>
            <Link href="/dashboard/favorites" className="hover:text-text-primary">
              Favoritos
            </Link>
            <Link href="/dashboard/playlists" className="hover:text-text-primary">
              Playlists
            </Link>
            {isAdmin && (
              <Link href="/panel" className="hover:text-brand-400">
                Panel admin
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-text-subdued sm:inline">
            {user.email}
          </span>
          {isAdmin && <Badge>admin</Badge>}
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
