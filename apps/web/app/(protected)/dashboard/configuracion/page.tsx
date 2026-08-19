import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut, User } from "lucide-react";

import LogoutButton from "@/components/logout-button";
import { getSession } from "@/lib/services/session-service";

import { CacheSection } from "./cache-section";

export const metadata: Metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

/**
 * Configuración: lista de opciones estilo settings de mobile (una fila por
 * opción, icono + flecha). Cuenta → /account (página existente), Cache →
 * sección inline con peso + limpieza de descargas offline, Cerrar sesión →
 * LogoutButton (form POST al route handler que expira la cookie HttpOnly).
 */
export default async function SettingsPage() {
  const user = await getSession();
  if (!user) return null; // el layout redirige a /login

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          Configuración
        </h1>
        <p className="mt-1.5 text-sm text-text-subdued">
          Tu cuenta, el almacenamiento offline y la sesión.
        </p>
      </header>

      <div className="mt-8 overflow-hidden rounded-2xl border border-bg-highlight bg-bg-elevated">
        {/* Cuenta → /account */}
        <Link
          href="/account"
          className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-bg-highlight/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-highlight text-brand-400">
            <User size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Cuenta</span>
            <span className="block truncate text-xs text-text-subdued">
              {user.email}
            </span>
          </span>
          <ChevronRight
            size={18}
            aria-hidden
            className="shrink-0 text-text-subdued transition-transform group-hover:translate-x-0.5"
          />
        </Link>

        <div className="border-t border-bg-highlight" />

        {/* Cache: peso + limpieza de descargas offline (cliente) */}
        <CacheSection />

        <div className="border-t border-bg-highlight" />

        {/* Cerrar sesión → LogoutButton (form POST /api/logout) */}
        <div className="flex items-center gap-4 px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-highlight text-brand-400">
            <LogOut size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Cerrar sesión</span>
            <span className="block text-xs text-text-subdued">
              Salí de Pulse Stream en este dispositivo
            </span>
          </span>
          <LogoutButton variant="icon" />
        </div>
      </div>
    </div>
  );
}