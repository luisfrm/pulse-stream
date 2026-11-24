"use client";

import Link from "next/link";

import { Button, Card, CardContent, Title } from "@/components/ui";

/**
 * Error boundary de la raíz: cubre lo que los `error.tsx` de área no pueden
 * (errores del propio layout, p. ej. `getSession()` relanzando por un 500/timeout
 * transitorio de la API). Reintenta sin tocar la sesión.
 */
export default function RootError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4">
      <Card className="max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <Title as="h2" size="section">
            Algo salió mal
          </Title>
          <p className="text-sm text-text-subdued">
            No pudimos cargar la página. Revisá tu conexión y volvé a intentar.
          </p>
          <Button onClick={reset}>Reintentar</Button>
          <Link
            href="/"
            className="text-sm text-text-subdued underline-offset-4 hover:text-text-primary hover:underline"
          >
            Volver al inicio
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
