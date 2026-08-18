"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { authService } from "@/lib/services/auth-service";
import { friendlyError } from "@/lib/utils/error";
import { AuthBackground } from "@/components/auth-background";
import { BrandLogo } from "@/components/brand-logo";
import { toast } from "sonner";

const MIN_PASSWORD = 3;

function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  placeholder: string;
}) {
  return (
    <span className="relative">
      <input
        type={show ? "text" : "password"}
        required
        minLength={MIN_PASSWORD}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-bg-highlight bg-bg-elevated py-3 pl-4 pr-11 text-text-primary outline-none transition-colors placeholder:text-text-subdued hover:border-bg-highlight/80 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-pill p-1.5 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}

export default function RegisterPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (password.length < MIN_PASSWORD) {
      toast.error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }

    setPending(true);
    try {
      await authService.register({
        email,
        password,
        username: username.trim() || undefined,
      });
      // Registro exitoso -> login automático y al dashboard (cookie persistente)
      await authService.login(email, password, true);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued hover:border-bg-highlight/80 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25";

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
      <AuthBackground />
      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-3xl border border-white/10 bg-bg-base/70 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-6 flex justify-center">
            <BrandLogo size={44} />
          </div>
          <h1 className="text-center font-display text-3xl font-bold">Creá tu cuenta</h1>
          <p className="mt-2 text-center text-sm text-text-subdued">
            Empezá a subir y reproducir tu música.
          </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Nombre de usuario
            <input
              type="text"
              required
              autoComplete="username"
              minLength={2}
              maxLength={50}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              placeholder="Tu nombre o apodo"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="vos@ejemplo.com"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Contraseña
            <PasswordInput
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
              autoComplete="new-password"
              placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Confirmar contraseña
            <PasswordInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
              autoComplete="new-password"
              placeholder="Repetí la contraseña"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="rounded-pill bg-brand-400 px-6 py-3 font-semibold text-bg-base transition-all hover:bg-brand-200 active:scale-[0.99] disabled:opacity-60"
          >
            {pending ? "Creando…" : "Crear cuenta"}
          </button>
        </form>
        </div>

        <p className="mt-6 text-center text-sm text-text-subdued">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-medium text-brand-400 hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
