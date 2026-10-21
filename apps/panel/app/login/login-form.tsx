"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import {
  AuthBackground,
  BrandLogo,
  Button,
  Checkbox,
  Input,
} from "@pulse-stream/ui";
import { friendlyError } from "@pulse-stream/shared";

import { authService } from "@/lib/services/auth-service";

/**
 * Login del panel: mismo formulario email/password que la app, contra el
 * `panelApi`. El destino por defecto es /panel (`?next=` permite volver a la
 * página que el proxy bloqueó).
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/panel";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
      <AuthBackground />
      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-3xl border border-white/10 bg-bg-base/70 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-6 flex justify-center">
            <BrandLogo size={44} />
          </div>
          <h1 className="text-center font-display text-3xl font-bold">
            Panel de administración
          </h1>
          <p className="mt-2 text-center text-sm text-text-subdued">
            Ingresá con una cuenta administradora.
          </p>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@ejemplo.com"
            />

            <Input
              label="Contraseña"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="rounded-pill p-1.5 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />

            <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-text-subdued">
              <Checkbox
                checked={remember}
                onCheckedChange={(v) => setRemember(v === true)}
                aria-label="Recordarme"
              />
              Recordarme
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200"
              >
                {error}
              </p>
            )}

            <Button type="submit" loading={pending}>
              {pending ? "Entrando…" : "Iniciar sesión"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-text-subdued">
          Los usuarios del panel son administradores. La app de música vive en
          otro sitio.
        </p>
      </div>
    </main>
  );
}
