import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/components/ui";

interface NoCoverProps {
  /** `circle` para artistas. */
  shape?: "square" | "circle";
  /** Tamaño del logo interior (el contenedor lo define el consumidor). */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const LOGO_SIZE = { sm: 16, md: 24, lg: 40 } as const;

/**
 * Placeholder de cover faltante: fondo elevado + borde + logo de la marca.
 * Es decorativo (el título/link del consumidor da el nombre). Ocupa `h-full
 * w-full`: el tamaño lo controla el contenedor (`h-11 w-11`, `aspect-square`…).
 */
export function NoCover({
  shape = "square",
  size = "md",
  className,
}: NoCoverProps) {
  return (
    <div
      data-slot="no-cover"
      aria-hidden="true"
      className={cn(
        "flex h-full w-full items-center justify-center border border-bg-highlight bg-bg-elevated",
        shape === "circle" ? "rounded-full" : "rounded-md",
        className
      )}
    >
      <BrandLogo size={LOGO_SIZE[size]} />
    </div>
  );
}
