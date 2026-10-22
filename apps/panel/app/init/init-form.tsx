"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import {
  AuthBackground,
  BrandLogo,
  Button,
  Input,
} from "@pulse-stream/ui";
import { friendlyError } from "@pulse-stream/shared";

import { initService } from "@/lib/services/init-service";

/**
 * Bootstrap del panel: crea la primera cuenta administradora. El backend
 * rechaza (409) si ya existe al menos una cuenta, así que esta pantalla solo es
 * alcanzable cuando `GET /init/status` devuelve `needs_init: true`.
 */
export function InitForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await initService.init({
        email,
        password,
        username: username.trim() || undefined,
      });
      router.push("/login");
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
            Inicializar panel
          </h1>
          <p className="mt-2 text-center text-sm text-text-subdued">
            Creá la primera cuenta administradora. Solo se puede hacer una vez.
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
              label="Usuario (opcional)"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="panel-admin"
            />

            <Input
              label="Contraseña"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
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

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200"
              >
                {error}
              </p>
            )}

            <Button type="submit" loading={pending}>
              {pending ? "Creando…" : "Crear administrador"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
