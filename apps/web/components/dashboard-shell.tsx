"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  Heart,
  Home,
  ListMusic,
  Menu,
  Search,
  Shield,
  X,
} from "lucide-react";

import LogoutButton from "@/components/logout-button";
import { cn } from "@/components/ui";
import type { User } from "@/lib/services/types";
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
    { href: "/dashboard", label: "Inicio", icon: Home, exact: true },
    { href: "/dashboard/search", label: "Buscar", icon: Search },
    { href: "/dashboard/favorites", label: "Canciones", icon: Heart, group: "Tu biblioteca" },
    { href: "/dashboard/playlists", label: "Playlists", icon: ListMusic, group: "Tu biblioteca" },
    { href: "/dashboard/recently-played", label: "Recientes", icon: Clock, group: "Tu biblioteca" },
    ...(isAdmin
      ? [{ href: "/panel", label: "Panel admin", icon: Shield, group: "Administración" }]
      : []),
  ];
}

function SidebarNav({
  user,
  isAdmin,
  onNavigate,
}: {
  user: User;
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

      <div className="mt-auto">
        <div className="flex items-center gap-3 rounded-xl border border-bg-highlight bg-bg-elevated/60 px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient font-display text-sm font-extrabold text-bg-base">
            {user.email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.email}</p>
            <p className="text-xs text-text-subdued">
              {isAdmin ? "Administrador" : "Oyente"}
            </p>
          </div>
          <LogoutButton variant="icon" />
        </div>
      </div>
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
              user={user}
              isAdmin={isAdmin}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-bg-highlight bg-bg-base/60 px-4 py-5 backdrop-blur lg:flex">
        <Link
          href="/dashboard"
          className="mb-6 flex items-center gap-2 px-3 font-display text-lg font-bold text-text-primary"
        >
          <BrandLogo size={32} />
          Pulse Stream
        </Link>
        <SidebarNav user={user} isAdmin={isAdmin} />
      </aside>

      {/* Barra superior móvil */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-bg-highlight bg-bg-base/90 px-4 py-3 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menú"
          className="rounded-pill p-2 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
        >
          <Menu size={22} />
        </button>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-display text-base font-bold text-text-primary"
        >
          <BrandLogo size={24} />
          Pulse Stream
        </Link>
        <span className="w-9" />
      </header>

      {/* Contenido */}
      <main className="min-w-0 flex-1 px-4 pb-32 pt-5 lg:px-8 lg:pt-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}