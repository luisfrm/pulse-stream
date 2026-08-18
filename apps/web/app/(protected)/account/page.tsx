import type { Metadata } from "next";

import { getSession } from "@/lib/services/session-service";

import { AccountForm } from "./account-form";

export const metadata: Metadata = { title: "Mi cuenta" };
export const dynamic = "force-dynamic";

/** Página de perfil: username, email, contraseña y foto de portada. */
export default async function AccountPage() {
  const user = await getSession();
  if (!user) return null; // el layout redirige a /login

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          Mi cuenta
        </h1>
        <p className="mt-1.5 text-sm text-text-subdued">
          Tus datos de perfil y cómo te ve el resto de Pulse Stream.
        </p>
      </header>

      <div className="mt-8">
        <AccountForm user={user} />
      </div>
    </div>
  );
}
