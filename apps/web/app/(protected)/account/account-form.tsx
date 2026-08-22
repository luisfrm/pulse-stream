"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { CoverUploader } from "@/components/cover-uploader";
import { Button, Input } from "@/components/ui";
import { authService } from "@/lib/services/auth-service";
import type { User } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

const MIN_PASSWORD = 3;

export function AccountForm({ user }: { user: User }) {
  const router = useRouter();

  const [username, setUsername] = React.useState(user.username ?? "");
  const [email, setEmail] = React.useState(user.email);
  const [password, setPassword] = React.useState("");
  const [coverKey, setCoverKey] = React.useState<string | null>(user.cover_key ?? null);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  // cover_url puede venir null si R2 no está configurado en el entorno local
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(
    user.cover_url ?? null
  );

  async function handleCoverChange(key: string | null) {
    // El cover se persiste de inmediato: al elegir/quitar archivo, se actualiza
    // el object_key (la subida a R2 ya ocurrió en CoverUploader).
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      const updated = await authService.updateMe({ cover_key: key ?? undefined });
      setCoverKey(key);
      setPreviewUrl(updated.cover_url ?? null);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (password && password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }

    setPending(true);
    try {
      await authService.updateMe({
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        password: password || undefined,
      });
      setPassword("");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 p-6">
        <h2 className="font-display text-lg font-bold">Foto de perfil</h2>
        <p className="mt-1 text-sm text-text-subdued">
          Se muestra en tu cuenta y en la barra lateral.
        </p>
        <div className="mt-5">
          <CoverUploader
            value={coverKey}
            previewUrl={previewUrl}
            onChange={handleCoverChange}
            label="Cover"
          />
        </div>
      </section>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 p-6"
      >
        <h2 className="font-display text-lg font-bold">Datos personales</h2>

        <div className="mt-5 flex flex-col gap-5">
          <Input
            label="Nombre de usuario"
            type="text"
            required
            minLength={2}
            maxLength={50}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Tu nombre o apodo"
          />

          <Input
            label="Email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Input
            label="Contraseña"
            type="password"
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Dejalo vacío para no cambiarla"
            hint={`Mínimo ${MIN_PASSWORD} caracteres. Dejá vacío si no querés cambiarla.`}
          />

          {error && (
            <p className="rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">
              {error}
            </p>
          )}
          {saved && (
            <p className="rounded-xl bg-brand-400/10 px-4 py-3 text-sm text-brand-200">
              Cambios guardados ✓
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-fit">
            {pending ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Guardando…
              </>
            ) : (
              "Guardar cambios"
            )}
          </Button>
        </div>
      </form>

      <section className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 p-6">
        <h2 className="font-display text-lg font-bold">Tu actividad</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3">
            <p className="font-display text-2xl font-extrabold text-brand-400">
              {user.total_plays}
            </p>
            <p className="text-xs text-text-subdued">
              {user.total_plays === 1 ? "reproducción" : "reproducciones"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-text-subdued">
          Cada play suma +1. Tu historial detallado está en{" "}
          <Link
            href="/recently-played"
            className="text-brand-400 hover:underline"
          >
            Escuchadas recientemente
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
