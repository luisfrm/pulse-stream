"use client";

import * as React from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

import { uploadsService, uploadToR2, COVER_CACHE_CONTROL } from "@/lib/services/uploads-service";
import { friendlyError } from "@/lib/utils/error";
import { cn } from "@/components/ui";

const MAX_COVER_BYTES = 256 * 1024; // 256 KB
// Resolución recomendada: 800×800 WebP q~75 (pesa 60-100 KB y cubre el slot
// más grande — héroes de ~500px — con margen para DPR 2x en cards de ~300px).
const SUGGESTED_SIZE = "800×800 px WebP";

interface CoverUploaderProps {
  /** object_key actual (para mostrar el cover ya subido). */
  value?: string | null;
  /** URL pública del cover actual (para preview). */
  previewUrl?: string | null;
  onChange: (objectKey: string | null) => void;
  label?: string;
}

/**
 * Subida de cover (cuadrícula): solo WebP <= 256 KB, subida directa a R2 vía
 * presign con `Cache-Control: public, max-age=31536000, immutable` (las keys
 * con UUID son inmutables: navegador + CDN cachean por años). Muestra el peso
 * y el tamaño sugerido como ayuda (el backend valida lo mismo). `onChange`
 * recibe el object_key (o null al quitar).
 *
 * El preview usa un object URL local del archivo elegido apenas se selecciona
 * (no espera a que el RSC se refresque con la URL pública de R2), y recién
 * cae al `previewUrl` del servidor cuando el padre lo actualiza.
 */
export function CoverUploader({
  value,
  previewUrl,
  onChange,
  label = "Cover",
}: CoverUploaderProps) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // URL local del archivo recién elegido (object URL) — el preview inmediato.
  const [localPreview, setLocalPreview] = React.useState<string | null>(null);
  const objectUrlRef = React.useRef<string | null>(null);

  // Limpia el object URL anterior (si hay) y revoca al desmontar. NO se revoca
  // al terminar la subida: el preview local sigue mostrando la imagen hasta
  // que el padre confirme con su previewUrl (refresh del RSC).
  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    // Validaciones locales (el backend valida lo mismo al firmar)
    if (file.type !== "image/webp") {
      setError("Solo se acepta formato WebP (liviano y con transparencia si la necesitás).");
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setError(`El archivo pesa ${(file.size / 1024).toFixed(0)} KB. Máximo 256 KB.`);
      return;
    }

    // Preview inmediato con el archivo local (antes de subir).
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setLocalPreview(objectUrl);

    setPending(true);
    try {
      const presign = await uploadsService.presignCover(file.name, file.type, file.size);
      await uploadToR2(presign.url, file, COVER_CACHE_CONTROL);
      onChange(presign.object_key);
    } catch (err) {
      setError(friendlyError(err));
      setLocalPreview(null);
    } finally {
      setPending(false);
    }
  }

  const shownPreview = localPreview ?? previewUrl;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>

      <div className="flex items-center gap-4">
        {/* Preview / placeholder */}
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40">
          {shownPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shownPreview}
              alt="Vista previa del cover"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="bg-brand-gradient flex h-full w-full items-center justify-center text-text-primary/60">
              {pending ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label className="inline-flex w-fit cursor-pointer items-center gap-2">
            <input
              type="file"
              accept="image/webp,.webp"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-pill border border-bg-highlight bg-bg-elevated px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-brand-400 hover:bg-bg-highlight/50",
                pending && "pointer-events-none opacity-60"
              )}
            >
              <ImagePlus size={16} className="shrink-0 text-brand-400" aria-hidden />
              {pending ? "Subiendo…" : value ? "Cambiar cover" : "Subir cover"}
            </span>
          </label>
          {value && (
            <button
              type="button"
              onClick={() => {
                setLocalPreview(null);
                onChange(null);
              }}
              className="inline-flex w-fit items-center gap-1 text-xs text-text-subdued transition-colors hover:text-brand-400"
            >
              <X size={12} aria-hidden /> Quitar cover
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-text-subdued">
        Formato <strong>solo WebP</strong> · peso máximo <strong>256 KB</strong> ·
        tamaño sugerido <strong>{SUGGESTED_SIZE}</strong> (cubre pills de 40px,
        cards de ~300px y héroes de ~500px; la misma imagen se reutiliza en
        todos lados y se cachea por años).
      </p>

      {error && (
        <p className="rounded-xl bg-brand-900/30 px-3 py-2 text-sm text-brand-200">{error}</p>
      )}
    </div>
  );
}