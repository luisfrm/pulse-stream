import Link from "next/link";

import { cn } from "@/components/ui";
import { formatGenre } from "@/lib/utils/format";

/**
 * Paleta de la card de género: 8 profundidades de esmeralda derivadas SOLO de
 * los tokens de marca (`@theme` en `globals.css`) con `color-mix`. Todas quedan
 * por debajo de ~55% de luminosidad para que el título blanco mantenga
 * contraste; no se inventa ninguna paleta paralela.
 */
const GENRE_BACKGROUNDS = [
  "var(--color-brand-900)",
  "color-mix(in oklch, var(--color-brand-900) 80%, var(--color-brand-600))",
  "color-mix(in oklch, var(--color-brand-900) 60%, var(--color-brand-600))",
  "color-mix(in oklch, var(--color-brand-900) 40%, var(--color-brand-600))",
  "color-mix(in oklch, var(--color-brand-600) 70%, var(--color-brand-900))",
  "color-mix(in oklch, var(--color-brand-600) 85%, var(--color-bg-base))",
  "color-mix(in oklch, var(--color-brand-900) 70%, var(--color-bg-highlight))",
  "color-mix(in oklch, var(--color-brand-400) 30%, var(--color-brand-900))",
] as const;

/** Hash estable (31 × suma de code units) → el mismo género, el mismo color. */
function backgroundFor(genre: string): string {
  let hash = 0;
  for (let index = 0; index < genre.length; index += 1) {
    hash = (hash * 31 + genre.charCodeAt(index)) >>> 0;
  }
  return GENRE_BACKGROUNDS[hash % GENRE_BACKGROUNDS.length]!;
}

/**
 * Card del mosaico "Explorar todo": cuadrada, color determinista y link AL
 * listado filtrado. El `encodeURIComponent` es obligatorio: sin él `r&b`
 * llegaría a la API como `genre=r` (hay un test del worker que lo documenta).
 */
export function GenreCard({ genre }: { genre: string }) {
  const label = formatGenre(genre);

  return (
    <Link
      href={`/songs?genre=${encodeURIComponent(genre)}`}
      style={{ backgroundColor: backgroundFor(genre) }}
      className={cn(
        "card-lift group relative flex aspect-square flex-col justify-end overflow-hidden rounded-xl border border-transparent p-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      )}
    >
      {/* Detalle decorativo (mismo lenguaje visual que el resto: tokens, no arte). */}
      <span
        aria-hidden="true"
        className="absolute -bottom-7 -right-6 h-20 w-20 rotate-[25deg] rounded-lg bg-bg-base/15"
      />
      <span className="relative font-display text-lg font-extrabold leading-tight text-text-primary sm:text-xl">
        {label}
      </span>
    </Link>
  );
}
