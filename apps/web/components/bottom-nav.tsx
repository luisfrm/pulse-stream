"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Home, Plus, Search, Sparkles, X } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Button, Input, cn } from "@/components/ui";
import { playlistsService } from "@/lib/services/playlists-service";
import { friendlyError } from "@/lib/utils/error";

interface NavItem {
  href: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  /** El Catálogo usa el logo de Pulse Stream en vez de un icono. */
  brand?: boolean;
  exact?: boolean;
}

/**
 * Barra de navegación inferior (móvil) — el estándar en pantallas chicas:
 * Inicio / Explorar / Catálogo / Crear (+). "Panel" y "Cuenta" viven en el
 * sidebar (y en el drawer móvil): así la barra queda como la de Spotify.
 * El botón "+" abre un popup justo encima de la barra (con overlay) para crear
 * playlists y un acceso a Blend (próximamente, disabled).
 */
export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [view, setView] = React.useState<"menu" | "form">("menu");
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Bloquea el scroll del body mientras el popup está abierto.
  React.useEffect(() => {
    if (!createOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [createOpen]);

  const items: NavItem[] = [
    { href: "/dashboard", label: "Inicio", icon: Home, exact: true },
    { href: "/search", label: "Explorar", icon: Search },
    { href: "/catalog", label: "Catálogo", brand: true },
  ];

  function isActive(item: NavItem): boolean {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  function close() {
    setCreateOpen(false);
    setView("menu");
    setName("");
    setError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const pl = await playlistsService.create({ name: name.trim() });
      close();
      router.push(`/playlists/${pl.id}`);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:hidden">
      {/* Popup de creación: overlay + panel justo encima del pill del nav
          (12px de aire del wrapper + 66px del nav + 6px de gap = 4.5rem sobre
          el safe-area, misma derivación que el bottom del player bar). */}
      {createOpen && (
        <div
          className="pointer-events-auto fixed inset-0"
          role="dialog"
          aria-modal="true"
          aria-label="Crear"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
          />
          <div className="animate-rise absolute inset-x-4 bottom-[calc(4.5rem+max(env(safe-area-inset-bottom),0.75rem))] overflow-hidden rounded-2xl border border-bg-highlight bg-bg-elevated shadow-2xl">
            {view === "menu" ? (
              <>
                <button
                  type="button"
                  onClick={() => setView("form")}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-bg-highlight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-400 text-bg-base">
                    <Plus size={18} aria-hidden />
                  </span>
                  <span className="text-sm font-medium">Crear playlist</span>
                </button>
                <div className="border-t border-bg-highlight" />
                <button
                  type="button"
                  disabled
                  title="Disponible próximamente"
                  className="flex w-full cursor-not-allowed items-center gap-3 px-4 py-3.5 text-left opacity-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-highlight text-text-subdued">
                    <Sparkles size={18} aria-hidden />
                  </span>
                  <span className="text-sm font-medium">Blend</span>
                  <span className="ml-auto text-xs text-text-subdued">
                    Disponible próximamente
                  </span>
                </button>
              </>
            ) : (
              <form onSubmit={handleCreate} className="flex flex-col gap-3 p-4">
                <p className="font-display text-sm font-bold">Crear playlist</p>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre (ej. Para el gimnasio)"
                  autoFocus
                  required
                />
                {error && (
                  <p className="rounded-xl bg-brand-900/30 px-3 py-2 text-xs text-brand-200">
                    {error}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setView("menu")}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" size="sm" loading={pending} disabled={!name.trim()}>
                    Crear
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Barra: pill flotante con el lenguaje de las cards */}
      <nav className="pointer-events-auto rounded-3xl border border-bg-highlight bg-bg-elevated/95 shadow-xl shadow-black/20 backdrop-blur-md">
        <div className="flex h-16 items-stretch justify-around px-2">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                  active ? "text-brand-400" : "text-text-subdued hover:text-text-primary"
                )}
              >
                {item.brand ? (
                  <span className="flex h-7 w-7 items-center justify-center">
                    <BrandLogo size={22} />
                  </span>
                ) : (
                  item.icon && (
                    <span className="flex h-7 w-7 items-center justify-center">
                      <item.icon size={22} className={cn(active && "text-brand-400")} />
                    </span>
                  )
                )}
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          {/* Crear: + ↔ X con bg blanco */}
          <button
            type="button"
            onClick={() => {
              if (createOpen) close();
              else {
                setCreateOpen(true);
                setView("menu");
              }
            }}
            aria-expanded={createOpen}
            aria-label={createOpen ? "Cerrar menú de creación" : "Crear"}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full shadow-lg transition-all",
                createOpen
                  ? "bg-white text-bg-base shadow-black/30"
                  : "bg-brand-400 text-bg-base shadow-brand-900/40"
              )}
            >
              {createOpen ? <X size={16} aria-hidden /> : <Plus size={18} aria-hidden />}
            </span>
            <span
              className={cn(
                "text-[10px] font-medium",
                createOpen ? "text-text-primary" : "text-text-subdued"
              )}
            >
              Crear
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}