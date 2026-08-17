"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authService } from "@/lib/services/auth-service";

export default function LogoutButton() {
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

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="rounded-pill border border-bg-highlight px-4 py-2 text-sm font-medium text-text-subdued transition-colors hover:border-brand-400 hover:text-text-primary disabled:opacity-50"
    >
      {pending ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
