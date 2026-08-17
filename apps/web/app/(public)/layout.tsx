import Link from "next/link";

import { Badge, Button } from "@/components/ui";
import { sessionService } from "@/lib/services/session-service";

/**
 * Área pública: nav N5 (píldora flotante, estilo atmospheric) + contenido.
 * La píldora flota sobre la página con backdrop blur para que el fondo
 * atmosférico se vea a través de ella.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await sessionService.getSession();
  const isAdmin = Boolean(user && (user.role === "admin" || user.is_superuser));

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Nav N5 — píldora flotante */}
      <header className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex w-full max-w-lg items-center justify-between gap-2 rounded-pill border border-bg-highlight/60 bg-bg-base/70 px-4 py-2 shadow-lg shadow-black/20 backdrop-blur-xl">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-base font-bold text-text-primary"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient font-display text-sm font-extrabold text-bg-base">
              P
            </span>
            <span className="hidden sm:inline">Pulse Stream</span>
          </Link>

          <nav className="flex items-center gap-2">
            {user ? (
              <>
                {isAdmin && (
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/panel">Panel</Link>
                  </Button>
                )}
                <Badge variant="glass" className="hidden sm:inline-flex">
                  {user.email}
                </Badge>
                <Button asChild size="sm">
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
        </div>
      </header>

      {children}
    </div>
  );
}