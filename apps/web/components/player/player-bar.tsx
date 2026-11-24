"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ChevronUp, Pause, Play, SkipForward } from "lucide-react";

import { NoCover } from "@/components/no-cover";
import { Slider } from "@/components/ui";
import { formatTime } from "@/lib/utils/format";
import { usePlayer } from "./player-provider";

// Lazy: el fullscreen (con OfflineButton + letra) es pesado; no debe viajar en
// el chunk del root layout ni descargarse en páginas que nunca lo abren.
const PlayerFullscreen = dynamic(
  () =>
    import("./player-fullscreen").then((m) => m.PlayerFullscreen),
  {
    ssr: false,
    loading: () => null,
  }
);

/**
 * Barra inferior del reproductor. En mobile flota alineada con el nav (mismo
 * ancho/aire) como pill de card; en desktop es full-width como siempre. El
 * progreso vive en una línea fina DENTRO del pill (clippeada por el rounded).
 */
export function PlayerBar() {
  const { current, playing, progress, duration, toggle, next, hasNext } =
    usePlayer();
  const [open, setOpen] = React.useState(false);
  // Identidad estable: con el fullscreen montado, un `onClose` nuevo en cada
  // render de la barra (4×/s por `progress`) re-ejecutaría su efecto de Escape
  // + lock del scroll del body.
  const close = React.useCallback(() => setOpen(false), []);

  if (!current) return null;

  return (
    <>
      <footer className="animate-player-in pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+max(env(safe-area-inset-bottom),0.75rem))] z-40 px-4 lg:bottom-0 lg:px-0">
        {/* El pill entero abre el fullscreen al tocarlo: en mobile el chevron
            desaparece (lo reemplaza "Siguiente"), así que la barra pasa a ser
            el acceso táctil. Play y Siguiente cortan la propagación. */}
        <div
          onClick={() => setOpen(true)}
          className="pointer-events-auto cursor-pointer rounded-3xl border border-bg-highlight bg-bg-elevated/95 shadow-xl shadow-black/20 backdrop-blur-md lg:rounded-none lg:border-x-0 lg:border-b-0 lg:bg-bg-base/95 lg:shadow-none"
        >
          {/* Línea de progreso fina, dentro del pill (inset: el radio grande la
              recortaría si tocara los bordes). Solo display. */}
          <Slider
            value={progress}
            max={duration}
            interactive={false}
            ariaLabel="Progreso de reproducción"
            ariaValueText={formatTime(progress)}
            className="mx-3"
          />

          <div className="flex items-center gap-3 px-3 pb-3 pt-2.5">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`Abrir reproductor: ${current.title} de ${current.artist.name}`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
            >
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-bg-highlight bg-bg-highlight/40">
                {current.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={current.cover_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <NoCover size="sm" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium leading-tight">{current.title}</p>
                <p className="truncate text-xs text-text-subdued">
                  {current.artist.name}
                </p>
              </div>

              <span className="hidden shrink-0 text-xs tabular-nums text-text-subdued sm:block">
                {formatTime(progress)} / {formatTime(duration)}
              </span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
              aria-label={playing ? "Pausar" : "Reproducir"}
              className="rounded-full bg-brand-400 p-3 text-bg-base transition-colors hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
            >
              {playing ? <Pause size={20} /> : <Play size={20} className="translate-x-[1px]" />}
            </button>

            {/* Solo mobile: reemplaza al chevron, que ahí no entra. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              disabled={!hasNext}
              aria-label="Siguiente"
              className="rounded-full p-3 text-text-primary transition-colors hover:bg-bg-highlight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400 disabled:opacity-30 lg:hidden"
            >
              <SkipForward size={20} />
            </button>

            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Ver reproductor completo"
              className="hidden rounded-full p-2.5 text-text-subdued transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400 lg:inline-flex"
            >
              <ChevronUp size={20} />
            </button>
          </div>
        </div>
      </footer>

      {/* Montaje condicional: el chunk lazy carga recién al abrir y al cerrar
          se desmonta (reset gratis de tab + memoria de scroll). */}
      {open ? <PlayerFullscreen onClose={close} /> : null}
    </>
  );
}