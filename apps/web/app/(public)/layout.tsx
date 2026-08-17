import Link from "next/link";

import { Badge, Button } from "@/components/ui";
import { sessionService } from "@/lib/services/session-service";

/** Área pública: header de navegación + contenido. */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await sessionService.getSession();
  const isAdmin = Boolean(user && (user.role === "admin" || user.is_superuser));

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="font-display text-lg font-bold text-text-primary hover:text-brand-400"
        >
          Pulse Stream
        </Link>

        <nav className="flex items-center gap-3">
          {user ? (
            <>
              {isAdmin && (
                <Link
                  href="/panel"
                  className="text-sm text-text-subdued hover:text-brand-400"
                >
                  Panel
                </Link>
              )}
              <Badge variant="glass">{user.email}</Badge>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard">Mi cuenta</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/login">Iniciar sesión</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Crear cuenta</Link>
              </Button>
            </>
          )}
        </nav>
      </header>
      {children}
    </div>
  );
}
