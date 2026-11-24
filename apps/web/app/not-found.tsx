import Link from "next/link";

import { Button, Title } from "@/components/ui";

/**
 * 404 global (branded): lo usan las URLs inexistentes —entre ellas
 * `/song/...`, que ya no tiene página propia— y los `notFound()` de
 * artista/álbum/playlist y del panel. Se renderiza dentro del root layout
 * (sin shell de área) y NO lee sesión: también sirve para visitantes anónimos.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-brand-400">
        Error 404
      </p>
      <Title as="h1" size="hero">
        No encontramos esta página
      </Title>
      <p className="max-w-md text-text-subdued">
        El contenido que buscás no existe o cambió de lugar. Volvé al inicio y
        seguí escuchando.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/catalog">Explorar catálogo</Link>
        </Button>
      </div>
    </main>
  );
}
