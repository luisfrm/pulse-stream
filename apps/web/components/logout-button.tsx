"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { cn } from "@/components/ui";
import { authService } from "@/lib/services/auth-service";

interface LogoutButtonProps {
  /** "icon" muestra solo el ícono (para chips de sidebar con poco espacio). */
  variant?: "default" | "icon";
  className?: string;
}

export default function LogoutButton({
  variant = "default",
  className,
}: LogoutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await authService.logout();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        className={cn(
          "shrink-0 rounded-full p-2 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400",
          className
        )}
      >
        <LogOut size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className={cn(
        "rounded-pill border border-bg-highlight px-4 py-2 text-sm font-medium text-text-subdued transition-colors hover:border-brand-400 hover:text-text-primary disabled:opacity-50",
        className
      )}
    >
      {pending ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}