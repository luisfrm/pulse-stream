import Link from "next/link";

import { cn } from "@/components/ui";

interface CollageCardProps {
  title: string;
  href: string;
  coverUrl?: string | null;
  /** Línea chica dentro de la imagen ("Lista · Pulse Stream"). */
  subtitle?: string;
  /** Caption debajo de la card ("Especialmente para ti"). */
  caption?: string;
  className?: string;
}

/** Card editorial grande (3:4) con título tipográfico sobre la imagen. */
export function CollageCard({
  title,
  href,
  coverUrl,
  subtitle,
  caption,
  className,
}: CollageCardProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <Link
        href={href}
        className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-brand-gradient transition-transform duration-300 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            fetchPriority="auto"
            decoding="async"
            sizes="(max-width: 768px) 100vw, 50vw"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h3 className="line-clamp-3 font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            {title}
          </h3>
          {subtitle && <p className="mt-1 text-xs text-white/80">{subtitle}</p>}
        </div>
      </Link>
      {caption && <p className="mt-2 text-xs text-text-subdued">{caption}</p>}
    </div>
  );
}
