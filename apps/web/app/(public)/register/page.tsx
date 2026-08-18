"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { authService } from "@/lib/services/auth-service";
import { friendlyError } from "@/lib/utils/error";

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
        className="w-full rounded-xl border border-bg-highlight bg-bg-elevated py-3 pl-4 pr-11 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400"
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-bold">Creá tu cuenta</h1>
        <p className="mt-2 text-sm text-text-subdued">
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
            {pending ? "Creando…" : "Crear cuenta"}
          </button>
        </form>

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
