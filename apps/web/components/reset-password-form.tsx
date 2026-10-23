"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { AuthBackground } from "@/components/auth-background";
import { BrandLogo } from "@/components/brand-logo";
import { Input } from "@/components/ui";
import { authService } from "@/lib/services/auth-service";
import { friendlyError } from "@/lib/utils/error";

const MIN_PASSWORD = 8;

/** El backend responde `{"detail": "RESET_PASSWORD_BAD_TOKEN"}` (400). */
function isBadToken(error: unknown): boolean {
  const data = (error as { data?: { detail?: unknown } } | undefined)?.data;
  if (data?.detail === "RESET_PASSWORD_BAD_TOKEN") return true;
  return (
    error instanceof Error && error.message.includes("RESET_PASSWORD_BAD_TOKEN")
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  show,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <Input
      label={label}
      type={show ? "text" : "password"}
      required
      minLength={MIN_PASSWORD}
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="••••••••"
      rightElement={
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="rounded-pill p-1.5 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
    />
  );
}

/** Formulario de `/reset-password?token=...` (el token viene del mail). */
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Se manda TAL CUAL: el backend lo compara contra `reset-password:<token>`.
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badToken, setBadToken] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setPending(true);
    try {
      await authService.resetPassword(token ?? "", password);
      toast.success("Contraseña actualizada.");
      router.replace("/login?reset=1");
    } catch (err) {
      if (isBadToken(err)) setBadToken(true);
      else setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  const loginLink = (
    <Link href="/login" className="font-medium text-brand-400 hover:underline">
      Pedir un enlace nuevo
    </Link>
  );

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
      <AuthBackground />
      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-3xl border border-white/10 bg-bg-base/70 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-6 flex justify-center">
            <BrandLogo size={44} />
          </div>
          <h1 className="text-center font-display text-3xl font-bold">
            Restablecer contraseña
          </h1>

          {!token || badToken ? (
            <>
              <p
                role="alert"
                className="mt-4 rounded-xl border border-brand-900 bg-brand-900/40 px-4 py-3 text-sm text-brand-200"
              >
                El enlace no es válido o ya venció. Pedí uno nuevo desde el
                inicio de sesión.
              </p>
              <p className="mt-6 text-center text-sm text-text-subdued">
                {loginLink}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-center text-sm text-text-subdued">
                Elegí una contraseña nueva de al menos {MIN_PASSWORD}
                {" "}caracteres.
              </p>

              <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
                <PasswordInput
                  label="Nueva contraseña"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  show={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />

                <PasswordInput
                  label="Repetí la contraseña"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  show={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                />

                {error ? (
                  <p role="alert" className="text-sm text-brand-200">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-pill bg-brand-400 px-6 py-3 font-semibold text-bg-base transition-all hover:bg-brand-200 active:scale-[0.99] disabled:opacity-60"
                >
                  {pending ? "Guardando…" : "Cambiar contraseña"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-text-subdued">
          ¿Volver al inicio de sesión?{" "}
          <Link href="/login" className="font-medium text-brand-400 hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
