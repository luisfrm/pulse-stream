"use client";

import { Button, Card, CardContent, Title } from "@/components/ui";

export default function PanelError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4">
      <Card className="max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <Title as="h2" size="section">
            Algo salió mal
          </Title>
          <p className="text-sm text-text-subdued">
            No pudimos cargar esta sección del panel. Revisá tu conexión y
            volvé a intentar.
          </p>
          <Button onClick={reset}>Reintentar</Button>
        </CardContent>
      </Card>
    </div>
  );
}