import Link from "next/link";

interface SectionProps {
  title: string;
  /** Línea 12px arriba del título ("Hecho para", "Más como"). */
  eyebrow?: string;
  /** Línea 14px debajo del título. */
  description?: string;
  href?: string;
  actionLabel?: string;
  children: React.ReactNode;
  className?: string;
}

/** Header de sección (eyebrow + título + "Ver todo") y su cuerpo. */
export function Section({
  title,
  eyebrow,
  description,
  href,
  actionLabel = "Ver todo",
  children,
  className,
}: SectionProps) {
  return (
    <section className={className}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="text-xs text-text-subdued">{eyebrow}</p>}
          <h2 className="font-display text-2xl font-bold">{title}</h2>
          {description && <p className="text-sm text-text-subdued">{description}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="shrink-0 text-base font-medium text-text-primary hover:underline"
          >
            {actionLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
