import Link from "next/link";

import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { sessionService } from "@/lib/services/session-service";

export const dynamic = "force-dynamic";

/** Home del usuario normal: sus configuraciones de cuenta y acceso al catálogo. */
export default async function DashboardHome() {
  const user = await sessionService.getSession();
  if (!user) return null; // el layout redirige

  const isAdmin = user.role === "admin" || user.is_superuser;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-3xl font-bold">Mi cuenta</h1>
      <p className="mt-3 text-text-subdued">
        Tus configuraciones de usuario en Pulse Stream.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <p className="text-xs text-text-subdued">Email</p>
              <p className="mt-0.5 font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-xs text-text-subdued">Rol</p>
              <div className="mt-0.5">
                {isAdmin ? (
                  <Badge>admin</Badge>
                ) : (
                  <Badge variant="glass">usuario</Badge>
                )}
              </div>
            </div>
            {isAdmin && (
              <Link
                href="/panel"
                className="mt-2 text-sm font-medium text-brand-400 hover:underline"
              >
                Ir al panel de administración →
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Biblioteca</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link
              href="/dashboard/favorites"
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-sm transition-colors hover:border-brand-400"
            >
              ♥ Tus favoritos
            </Link>
            <Link
              href="/dashboard/playlists"
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-sm transition-colors hover:border-brand-400"
            >
              📋 Tus playlists
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-sm transition-colors hover:border-brand-400"
            >
              🎧 Catálogo público
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
