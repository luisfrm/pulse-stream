"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { authService } from "@/lib/services/auth-service";
import { friendlyError } from "@/lib/utils/error";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await authService.login(email, password, remember);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-bold">Bienvenido de nuevo</h1>
        <p className="mt-2 text-sm text-text-subdued">
          Iniciá sesión para seguir escuchando.
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400"
              placeholder="vos@ejemplo.com"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Contraseña
            <span className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-bg-highlight bg-bg-elevated py-3 pl-4 pr-11 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-pill p-1.5 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-text-subdued">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 accent-brand-400"
            />
            Recordarme
          </label>

          {error && (
            <p className="rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="rounded-pill bg-brand-400 px-6 py-3 font-semibold text-bg-base transition-colors hover:bg-brand-200 disabled:opacity-60"
          >
            {pending ? "Entrando…" : "Iniciar sesión"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-subdued">
          ¿No tenés cuenta?{" "}
          <Link href="/register" className="font-medium text-brand-400 hover:underline">
            Crear cuenta
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
