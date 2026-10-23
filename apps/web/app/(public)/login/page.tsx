"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { authService } from "@/lib/services/auth-service";
import { friendlyError } from "@/lib/utils/error";
import { AuthBackground } from "@/components/auth-background";
import { BrandLogo } from "@/components/brand-logo";
import { Checkbox, Input } from "@/components/ui";
import { toast } from "sonner";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  // `/login?reset=1`: el formulario de reset terminó bien y redirigió acá.
  const justReset = searchParams.get("reset") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await authService.login(email, password, remember);
      router.push(next);
      router.refresh();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  async function onForgotPassword() {
    const target = email.trim();
    if (!target) {
      toast.error("Escribí tu email para enviarte el enlace.");
      return;
    }

    setSendingReset(true);
    try {
      await authService.forgotPassword(target);
      setResetSentTo(target);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSendingReset(false);
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
            Bienvenido de nuevo
          </h1>
          <p className="mt-2 text-center text-sm text-text-subdued">
            Iniciá sesión para seguir escuchando.
          </p>

          {justReset ? (
            <p
              role="status"
              className="mt-6 rounded-xl border border-brand-400/40 bg-brand-400/10 px-4 py-3 text-sm text-text-primary"
            >
              Contraseña actualizada. Iniciá sesión con la nueva.
            </p>
          ) : null}

          {resetSentTo ? (
            <p
              role="status"
              className="mt-6 rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-sm text-text-subdued"
            >
              Si existe una cuenta con{" "}
              <strong className="font-semibold text-text-primary">
                {resetSentTo}
              </strong>
              , te enviamos un correo para restablecer tu contraseña. Revisá
              también la carpeta de spam; el enlace vence en 1 hora.
            </p>
          ) : null}

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

          <div className="-mt-2 flex justify-end">
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={sendingReset || pending}
              className="text-sm font-medium text-brand-400 transition-colors hover:text-brand-200 hover:underline disabled:opacity-60 disabled:no-underline"
            >
              {sendingReset ? "Enviando…" : "¿Olvidaste tu contraseña?"}
            </button>
          </div>

          <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-text-subdued">
            <Checkbox
              checked={remember}
              onCheckedChange={(v) => setRemember(v === true)}
              aria-label="Recordarme"
            />
            Recordarme
          </label>

          <button
            type="submit"
            disabled={pending}
            className="rounded-pill bg-brand-400 px-6 py-3 font-semibold text-bg-base transition-all hover:bg-brand-200 active:scale-[0.99] disabled:opacity-60"
          >
            {pending ? "Entrando…" : "Iniciar sesión"}
          </button>
        </form>
        </div>

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
