"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  Home,
  LibraryBig,
  ListMusic,
  Menu,
  Music2,
  Search,
  Settings,
  Shield,
  X,
} from "lucide-react";

import { cn } from "@/components/ui";
import type { User } from "@/lib/services/types";
import { BottomNav } from "./bottom-nav";
import { BrandLogo } from "./brand-logo";

interface DashboardShellProps {
  user: User;
  isAdmin: boolean;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  group?: string;
  exact?: boolean;
}

function useNavItems(isAdmin: boolean): NavItem[] {
  return [
    // "Mi catálogo" primero: la biblioteca del usuario es el destino principal.
    { href: "/catalog", label: "Mi catálogo", icon: LibraryBig },
    { href: "/dashboard", label: "Inicio", icon: Home, exact: true },
    { href: "/search", label: "Buscar", icon: Search },
    { href: "/songs", label: "Canciones", icon: Music2, group: "Biblioteca" },
    { href: "/playlists", label: "Playlists", icon: ListMusic, group: "Biblioteca" },
    { href: "/recently-played", label: "Recientes", icon: Clock, group: "Biblioteca" },
    // Configuración es para TODOS los usuarios; el panel sigue siendo admin-only.
    { href: "/settings", label: "Configuración", icon: Settings, group: "Administración" },
    ...(isAdmin
      ? [{ href: "/panel", label: "Panel admin", icon: Shield, group: "Administración" }]
      : []),
  ];
}

function SidebarNav({
  isAdmin,
  onNavigate,
}: {
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = useNavItems(isAdmin);
  const groups = [...new Set(items.map((i) => i.group ?? "Principal"))];

  function isActive(item: NavItem): boolean {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <nav className="flex flex-1 flex-col overflow-y-auto">
      {groups.map((group) => (
        <div key={group} className="mb-6">
          {group !== "Principal" && (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-text-subdued/70">
              {group}
            </p>
          )}
          <ul className="space-y-1">
            {items
              .filter((i) => (i.group ?? "Principal") === group)
              .map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                        active
                          ? "bg-bg-highlight text-text-primary"
                          : "text-text-subdued hover:bg-bg-highlight/60 hover:text-text-primary"
                      )}
                    >
                      <Icon size={18} className={cn(active && "text-brand-400")} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** App shell del área protegida: sidebar (desktop) + drawer (móvil). */
export function DashboardShell({ user, isAdmin, children }: DashboardShellProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Drawer móvil */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
          />
          <div className="animate-fade-in absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-bg-base px-4 py-5 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <Link
                href="/dashboard"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-2 font-display text-lg font-bold text-text-primary"
              >
                <BrandLogo size={30} />
                Pulse Stream
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar menú"
                className="rounded-pill p-2 text-text-subdued hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
              >
                <X size={20} />
              </button>
            </div>
            <SidebarNav
              isAdmin={isAdmin}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Sidebar desktop. `lg:pb-24` deja aire bajo el último item: la barra del
          reproductor (fixed bottom, z-40) lo taparía sin esto. El chip de
          usuario ya no vive acá (logout pasó a Configuración). */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-bg-highlight bg-bg-base/60 px-4 pb-24 pt-5 backdrop-blur lg:flex">
        <Link
          href="/dashboard"
          className="mb-6 flex items-center gap-2 px-3 font-display text-lg font-bold text-text-primary"
        >
          <BrandLogo size={32} />
          Pulse Stream
        </Link>
        <SidebarNav isAdmin={isAdmin} />
      </aside>

      {/* Barra superior móvil: la hamburguesa abre el drawer (la cuenta vive en
          la bottom nav y en Configuración). */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-bg-highlight bg-bg-base/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-display text-lg font-bold text-text-primary"
        >
          <BrandLogo size={28} />
          Pulse Stream
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menú"
          className="rounded-pill p-2 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Contenido */}
      <main className="min-w-0 flex-1 px-4 pb-44 pt-5 lg:px-8 lg:pb-32 lg:pt-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      {/* Navegación inferior (móvil) */}
      <BottomNav user={user} isAdmin={isAdmin} />
    </div>
  );
}