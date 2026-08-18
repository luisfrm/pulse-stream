"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListMusic,
  Menu,
  Mic2,
  Music,
  Upload,
  X,
} from "lucide-react";

import LogoutButton from "@/components/logout-button";
import { cn } from "@/components/ui";
import type { User } from "@/lib/services/types";
import { formatRole } from "@/lib/utils/format";
import { BrandLogo } from "./brand-logo";

interface PanelShellProps {
  user: User;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/panel", label: "Panel", icon: LayoutDashboard, exact: true },
  { href: "/panel/artists", label: "Artistas", icon: Mic2 },
  { href: "/panel/songs", label: "Canciones", icon: Music },
  { href: "/panel/playlists", label: "Playlists", icon: ListMusic },
];

function PanelNav({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const pathname = usePathname();

  function isActive(item: NavItem): boolean {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <nav className="flex flex-1 flex-col overflow-y-auto">
      <ul className="space-y-1">
        {NAV.map((item) => {
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

      <div className="mt-4 border-t border-bg-highlight pt-4">
        <Link
          href="/panel/songs/new"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-pill bg-brand-400 px-4 py-2.5 text-sm font-semibold text-bg-base transition-colors hover:bg-brand-200"
        >
          <Upload size={16} /> Subir canción
        </Link>
      </div>

      <div className="mt-auto">
        <div className="flex items-center gap-3 rounded-xl border border-bg-highlight bg-bg-elevated/60 px-3 py-2.5">
          <Link
            href="/account"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg transition-colors hover:opacity-80"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-gradient font-display text-sm font-extrabold text-bg-base">
              {user.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.cover_url} alt="" className="h-full w-full object-cover" />
              ) : (
                (user.username ?? user.email).charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.username ?? user.email}</p>
              <p className="truncate text-xs text-text-subdued">{formatRole(user.role)}</p>
            </div>
          </Link>
          <LogoutButton variant="icon" />
        </div>
      </div>
    </nav>
  );
}

/** App shell del panel de administración: sidebar (desktop) + drawer (móvil). */
export function PanelShell({ user, children }: PanelShellProps) {
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
                href="/panel"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-2 font-display text-lg font-bold text-text-primary"
              >
                <BrandLogo size={30} />
                Pulse Stream <span className="text-brand-400">· Panel</span>
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
            <PanelNav user={user} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-bg-highlight bg-bg-base/60 px-4 py-5 backdrop-blur lg:flex">
        <Link
          href="/panel"
          className="mb-6 flex items-center gap-2 px-3 font-display text-lg font-bold text-text-primary"
        >
          <BrandLogo size={32} />
          Pulse Stream
        </Link>
        <PanelNav user={user} />
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
          href="/panel"
          className="flex items-center gap-2 font-display text-base font-bold text-text-primary"
        >
          <BrandLogo size={24} />
          Pulse Stream <span className="text-brand-400">· Panel</span>
        </Link>
        <span className="w-9" />
      </header>

      {/* Contenido */}
      <main className="min-w-0 flex-1 px-4 pb-16 pt-5 lg:px-8 lg:pt-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}