import Link from "next/link";
import { redirect } from "next/navigation";

import LogoutButton from "@/components/logout-button";
import { Badge } from "@/components/ui";
import { sessionService } from "@/lib/services/session-service";

/**
 * Panel de administración — SOLO role="admin".
 *
 * Guards (en orden):
 * 1. Sin sesión          -> /login (recordando a dónde iba)
 * 2. Logueado sin rol    -> / (home público; el usuario normal no ve el panel)
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

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-bg-highlight px-6 py-4">
        <div className="flex items-center gap-6">
          <Link
            href="/panel"
            className="font-display text-lg font-bold text-text-primary hover:text-brand-400"
          >
            Pulse Stream <span className="text-brand-400">· Panel</span>
          </Link>
          <nav className="hidden gap-4 text-sm text-text-subdued sm:flex">
            <Link href="/panel/artists" className="hover:text-text-primary">
              Artistas
            </Link>
            <Link href="/panel/songs" className="hover:text-text-primary">
              Canciones
            </Link>
            <Link href="/panel/songs/new" className="hover:text-brand-400">
              + Subir canción
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-text-subdued sm:inline">
            {user.email}
          </span>
          <Badge>admin</Badge>
          <Link href="/" className="text-sm text-text-subdued hover:text-text-primary">
            Ver sitio
          </Link>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
