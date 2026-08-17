import Link from "next/link";
import { User } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
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

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Nav N5 — píldora flotante */}
      <header className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex w-full max-w-lg items-center justify-between gap-2 rounded-pill border border-bg-highlight/60 bg-bg-base/70 px-4 py-2 shadow-lg shadow-black/20 backdrop-blur-xl">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 font-display text-base font-bold text-text-primary"
          >
            <BrandLogo size={28} />
            {/* nowrap: el nombre no se parte en dos líneas en pantallas chicas */}
            <span className="hidden whitespace-nowrap sm:inline">Pulse Stream</span>
          </Link>

          <nav className="flex min-w-0 items-center gap-2">
            {user ? (
              <>
                <Badge
                  variant="glass"
                  className="hidden max-w-32 truncate sm:inline-flex"
                  title={user.email}
                >
                  {user.username ?? user.email}
                </Badge>
                <Button asChild size="sm" className="shrink-0">
                  <Link href="/account">
                    <User size={15} aria-hidden />
                    Mi cuenta
                  </Link>
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
