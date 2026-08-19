"use client";

import * as React from "react";
import { HardDrive } from "lucide-react";

import { Button } from "@/components/ui";
import {
  clearOfflineCache,
  getOfflineCacheSize,
  getStorageEstimate,
} from "@/lib/offline";
import { formatBytes } from "@/lib/utils/format";

interface CacheInfo {
  /** Uso total del origen (navigator.storage.estimate), si está disponible. */
  usage: number | null;
  quota: number | null;
  /** Peso de las descargas offline (Cache API), si está disponible. */
  offlineSize: number | null;
}

/**
 * Fila "Cache" de Configuración: muestra el peso del almacenamiento (estimado
 * por el navegador + el de las descargas offline) y un botón que borra SOLO
 * la caché de descargas (`pulse-offline-v1`), sin tocar el shell del SW.
 */
export function CacheSection() {
  const [info, setInfo] = React.useState<CacheInfo>({
    usage: null,
    quota: null,
    offlineSize: null,
  });
  const [pending, setPending] = React.useState(false);

  async function refresh() {
    const [estimate, offlineSize] = await Promise.all([
      getStorageEstimate(),
      getOfflineCacheSize(),
    ]);
    setInfo({
      usage: estimate?.usage ?? null,
      quota: estimate?.quota ?? null,
      offlineSize,
    });
  }

  React.useEffect(() => {
    let alive = true;
    // El setState vive en el callback del promise (no en el cuerpo del effect):
    // patrón del repo para cargar estado inicial desde una API externa.
    Promise.all([getStorageEstimate(), getOfflineCacheSize()])
      .then(([estimate, offlineSize]) => {
        if (!alive) return;
        setInfo({
          usage: estimate?.usage ?? null,
          quota: estimate?.quota ?? null,
          offlineSize,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function handleClear() {
    setPending(true);
    try {
      await clearOfflineCache();
      await refresh();
    } finally {
      setPending(false);
    }
  }

  const parts: string[] = [];
  if (info.offlineSize !== null) {
    parts.push(`${formatBytes(info.offlineSize)} en descargas offline`);
  }
  if (info.usage !== null && info.quota !== null) {
    parts.push(`${formatBytes(info.usage)} de ${formatBytes(info.quota)} usados`);
  }
  const subtitle = parts.length > 0 ? parts.join(" · ") : "No disponible";

  // Sin Cache API (offlineSize null) o sin descargas (0) no hay nada que borrar.
  const canClear = info.offlineSize !== null && info.offlineSize > 0;

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-highlight text-brand-400">
        <HardDrive size={18} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Cache</span>
        <span className="block text-xs text-text-subdued">{subtitle}</span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClear}
        loading={pending}
        disabled={!canClear}
        title={
          canClear
            ? "Eliminar las descargas offline"
            : "No hay descargas offline para eliminar"
        }
      >
        Eliminar cache
      </Button>
    </div>
  );
}