import { Suspense } from "react";
import Link from "next/link";
import { User } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Badge, Button, Skeleton } from "@/components/ui";
import { getSession } from "@/lib/services/session-service";

/**
 * Área pública: nav N5 (píldora flotante, estilo atmospheric) + contenido.
 * La píldora flota sobre la página con backdrop blur para que el fondo
 * atmosférico se vea a través de ella.
 *
 * El nav resuelve la sesión dentro de un Suspense (fallback = píldora con
 * skeleton) para no bloquear el primer chunk del contenido.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={<PillSkeleton />}>
        <PublicNav />
      </Suspense>
      {children}
    </div>
  );
}

/** Píldora del nav con skeleton mientras resuelve la sesión. */
function PillSkeleton() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-lg items-center justify-between gap-2 rounded-pill border border-bg-highlight/60 bg-bg-base/70 px-4 py-2 shadow-lg shadow-black/20 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <BrandLogo size={28} />
        </div>
        <Skeleton className="h-8 w-28" shape="pill" />
      </div>
    </header>
  );
}

async function PublicNav() {
  const user = await getSession();

  return (
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
  );
}