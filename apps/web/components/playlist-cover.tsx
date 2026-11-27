import { NoCover } from "@/components/no-cover";
import { cn } from "@/components/ui";

interface PlaylistCoverProps {
  /** Custom uploaded cover URL (takes priority over collage). */
  coverUrl?: string | null;
  /** Up to 4 distinct song/album cover URLs for auto-collage fallback. */
  collageUrls?: readonly string[] | null;
  alt?: string;
  /** Fallback logo size when neither coverUrl nor collageUrls exist. */
  size?: "sm" | "md" | "lg";
  priority?: boolean;
  /** Enables subtle scale on parent `.group:hover`. */
  hoverZoom?: boolean;
  sizes?: string;
  className?: string;
}

/**
 * Renders a playlist cover with automatic collage fallback:
 * - Custom `coverUrl`: 1x1 full-bleed image.
 * - 0 collage covers: `<NoCover />` Pulse placeholder.
 * - 1 collage cover: 1x1 full-bleed image.
 * - 2 collage covers: 50/50 vertical split.
 * - 3 collage covers: asymmetric bento (1 tall left + 2 stacked right).
 * - 4+ collage covers: 2x2 grid.
 */
export function PlaylistCover({
  coverUrl,
  collageUrls,
  alt = "",
  size = "md",
  priority = false,
  hoverZoom = false,
  sizes,
  className,
}: PlaylistCoverProps) {
  const zoomClass = hoverZoom
    ? "transition-transform duration-300 group-hover:scale-[1.04]"
    : undefined;

  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        sizes={sizes}
        className={cn("h-full w-full object-cover", zoomClass, className)}
      />
    );
  }

  const covers = Array.from(new Set((collageUrls ?? []).filter(Boolean))).slice(
    0,
    4,
  );

  if (covers.length === 0) {
    return (
      <NoCover
        size={size}
        className={cn("rounded-none border-0", className)}
      />
    );
  }

  if (covers.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={covers[0]}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        sizes={sizes}
        className={cn("h-full w-full object-cover", zoomClass, className)}
      />
    );
  }

  if (covers.length === 2) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className={cn(
          "grid h-full w-full grid-cols-2 gap-[1px] bg-bg-base/40",
          zoomClass,
          className,
        )}
      >
        {covers.map((src, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${src}-${index}`}
            src={src}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            sizes={sizes}
            className="h-full w-full object-cover"
          />
        ))}
      </div>
    );
  }

  if (covers.length === 3) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className={cn(
          "grid h-full w-full grid-cols-2 grid-rows-2 gap-[1px] bg-bg-base/40",
          zoomClass,
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={covers[0]}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          sizes={sizes}
          className="row-span-2 h-full w-full object-cover"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={covers[1]}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          sizes={sizes}
          className="h-full w-full object-cover"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={covers[2]}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          sizes={sizes}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      className={cn(
        "grid h-full w-full grid-cols-2 grid-rows-2 gap-[1px] bg-bg-base/40",
        zoomClass,
        className,
      )}
    >
      {covers.map((src, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${src}-${index}`}
          src={src}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          sizes={sizes}
          className="h-full w-full object-cover"
        />
      ))}
    </div>
  );
}
