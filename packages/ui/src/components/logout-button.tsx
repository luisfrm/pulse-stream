import { LogOut } from "lucide-react";

import { cn } from "./ui";

interface LogoutButtonProps {
  /** "icon" muestra solo el ícono (para chips de sidebar con poco espacio). */
  variant?: "default" | "icon";
  /**
   * Route handler same-origin que borra la cookie de sesión y redirige.
   * Cada app tiene el suyo (`/api/logout`), por eso es prop: el panel no debe
   * pegarle al handler de la app.
   */
  action?: string;
  className?: string;
}

/**
 * Logout vía POST a `/api/logout` (route handler de la app): el servidor emite
 * el Set-Cookie de expiración de la cookie de sesión (HttpOnly, JS no puede
 * borrarla) y redirige con 303 a /login. Es una navegación dura: el proxy
 * re-corre sin cookie y el estado queda limpio en todos los entornos.
 */
export default function LogoutButton({
  variant = "default",
  action = "/api/logout",
  className,
}: LogoutButtonProps) {
  if (variant === "icon") {
    return (
      <form method="POST" action={action}>
        <button
          type="submit"
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className={cn(
            "shrink-0 rounded-full p-2 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400",
            className
          )}
        >
          <LogOut size={16} />
        </button>
      </form>
    );
  }

  return (
    <form method="POST" action={action}>
      <button
        type="submit"
        className={cn(
          "rounded-pill border border-bg-highlight px-4 py-2 text-sm font-medium text-text-subdued transition-colors hover:border-brand-400 hover:text-text-primary",
          className
        )}
      >
        Cerrar sesión
      </button>
    </form>
  );
}
