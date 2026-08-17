import Image from "next/image";

import { cn } from "@/components/ui";

interface BrandLogoProps {
  /** Tamaño en px (cuadrado). Por defecto 32. */
  size?: number;
  /** Si es true (default) se recorta en círculo (logo-round.webp). */
  rounded?: boolean;
  className?: string;
}

/**
 * Logo de Pulse Stream (`/logo-round.webp`). Reutilizable en sidebars, nav y
 * cualquier marca del producto — reemplaza los placeholders de texto.
 */
export function BrandLogo({ size = 32, rounded = true, className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden bg-bg-highlight/40",
        rounded && "rounded-full",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo-round.webp"
        alt="Pulse Stream"
        width={size}
        height={size}
        className="h-full w-full object-cover"
        priority
      />
    </span>
  );
}