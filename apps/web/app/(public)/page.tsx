import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-3xl flex-col items-center text-center">
        <span className="bg-brand-gradient rounded-pill px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-bg-base">
          Streaming musical
        </span>
        <h1 className="font-display mt-6 text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Tu música,
          <br />
          <span className="bg-brand-gradient bg-clip-text text-transparent">
            en Pulse Stream.
          </span>
        </h1>
        <p className="mt-6 max-w-md text-lg text-text-subdued">
          Subí, descubrí y reproducí canciones desde cualquier dispositivo. Tu
          catálogo, tu reproductor, tu ritmo.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/register"
            className="rounded-pill bg-brand-400 px-8 py-3 font-semibold text-bg-base transition-colors hover:bg-brand-200"
          >
            Crear cuenta gratis
          </Link>
          <Link
            href="/login"
            className="rounded-pill border border-bg-highlight px-8 py-3 font-semibold text-text-primary transition-colors hover:border-brand-400"
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  );
}
