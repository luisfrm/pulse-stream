import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { initService } from "@/lib/services/init-service";

import { InitForm } from "./init-form";

export const metadata: Metadata = { title: "Inicializar panel" };

// La página consulta la API en cada request; sin esto Next intentaría
// prerenderizarla durante el build (la API no está levantada).
export const dynamic = "force-dynamic";

export default async function PanelInitPage() {
  const { needs_init } = await initService.getStatus();
  if (!needs_init) redirect("/login");

  return (
    <Suspense fallback={null}>
      <InitForm />
    </Suspense>
  );
}
