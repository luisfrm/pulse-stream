"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Input } from "@pulse-stream/ui";
import { friendlyError } from "@pulse-stream/shared";

import { authService } from "@/lib/services/auth-service";

/**
 * Login alternativo a Google: email o username + contraseña.
 *
 * El endpoint Hono verifica argon2id (hash de pwdlib) y setea la misma cookie
 * `session` que el flow de Google. Los usuarios creados solo con Google no
 * tienen password local; para esos casos el botón de Google es el camino.
 */
export function LoginForm({ next = "/dashboard" }: { next?: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await authService.login({ identifier, password });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      <Input
        label="Email o usuario"
        type="text"
        autoComplete="username"
        required
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        placeholder="vos@ejemplo.com o tu usuario"
      />
      <Input
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="••••••••"
      />

      {error && (
        <p role="alert" className="text-sm text-brand-200">
          {error}
        </p>
      )}

      <Button type="submit" loading={pending} className="w-full">
        Iniciar sesión
      </Button>
    </form>
  );
}
