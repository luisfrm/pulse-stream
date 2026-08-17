import Link from "next/link";

export default function DashboardHome() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-3xl font-bold">Panel</h1>
      <p className="mt-3 text-text-subdued">
        Gestioná tu catálogo: artistas, canciones y subidas a R2.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ["Artistas", "Crear y gestionar artistas", "/dashboard/artists"],
          ["Canciones", "Subir, editar y reproducir", "/dashboard/songs"],
          ["Subir canción", "Formulario con subida directa a R2", "/dashboard/songs/new"],
        ].map(([title, description, href]) => (
          <Link
            key={title}
            href={href}
            className="rounded-2xl border border-bg-highlight bg-bg-elevated p-6 transition-colors hover:border-brand-400"
          >
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <p className="mt-2 text-sm text-text-subdued">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
