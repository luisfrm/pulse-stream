import * as React from "react";
import { Check, FileUp } from "lucide-react";

import { cn } from "./utils";

interface FileInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "type" | "value"> {
  /** Label visible arriba del botón. */
  label?: string;
  /** Texto de ayuda cuando no hay archivo elegido. */
  hint?: string;
  /** Icono a la izquierda del texto del botón. */
  icon?: React.ReactNode;
  /** Texto del botón sin archivo elegido. */
  chooseLabel?: string;
  /** Texto del botón con archivo elegido. */
  chooseAgainLabel?: string;
  /** Archivo actualmente seleccionado. */
  value?: File | null;
  /** Callback con el archivo elegido. */
  onChange: (file: File | null) => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Picker de archivos discreto: pill con icono + input file sr-only (mismo
 * patrón que CoverUploader, sin el botón nativo gigante del navegador).
 * Muestra nombre + tamaño del archivo elegido (o el hint si no hay archivo).
 */
const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  (
    {
      label,
      hint,
      icon,
      chooseLabel = "Elegir archivo",
      chooseAgainLabel = "Elegir otro archivo",
      value,
      onChange,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div className="flex w-full flex-col gap-1.5">
        {label && <span className="text-sm font-medium">{label}</span>}

        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-pill border border-bg-highlight bg-bg-elevated px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-brand-400 hover:bg-bg-highlight/50">
          {icon ?? (
            <FileUp size={16} className="shrink-0 text-brand-400" aria-hidden />
          )}
          {value ? chooseAgainLabel : chooseLabel}
          <input
            ref={ref}
            type="file"
            className={cn("sr-only", className)}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              // Permite elegir el mismo archivo de nuevo (change se re-dispara).
              e.target.value = "";
              onChange(file);
            }}
            {...props}
          />
        </label>

        {value ? (
          <span className="text-xs text-text-subdued">
            <Check size={12} className="mr-1 inline text-brand-400" aria-hidden />
            {value.name} · {formatBytes(value.size)}
          </span>
        ) : hint ? (
          <span className="text-xs text-text-subdued">{hint}</span>
        ) : null}
      </div>
    );
  }
);
FileInput.displayName = "FileInput";

export { FileInput };