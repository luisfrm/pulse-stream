import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { initService } from "@/lib/services/init-service";
import { getSession } from "@/lib/services/session-service";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

// La página consulta el estado del bootstrap/sesión en cada request.
export const dynamic = "force-dynamic";

export default async function PanelLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const [{ needs_init }, user] = await Promise.all([
    initService.getStatus(),
    getSession(),
  ]);

  if (needs_init) redirect("/init");
  // Solo una sesión realmente válida evita el formulario (una cookie vencida
  // no puede producir el bucle login ↔ panel). Respetamos `?next=` interno.
  if (user?.role === "admin") {
    const next =
      params.next?.startsWith("/") && !params.next.startsWith("//")
        ? params.next
        : "/panel";
    redirect(next);
  }

  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
