"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/components/ui";

interface CarouselProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Carrusel horizontal con scroll-snap, flechas (solo desktop) que aparecen al
 * hover/focus y fades de borde permanentes mientras haya contenido pendiente
 * (esa es la señal de scroll en mobile, donde no hay flechas). Los items los
 * pone el consumidor (`snap-start shrink-0`).
 */
export function Carousel({ children, className }: CarouselProps) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const childrenCount = React.Children.count(children);

  const updateArrows = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateArrows, childrenCount]);

  function scrollByPage(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({
      left: direction * el.clientWidth * 0.9,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  const arrowClass =
    "absolute top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-bg-highlight text-text-primary shadow-lg transition-opacity duration-200 hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 lg:flex";
  const revealClass = "opacity-0 group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100";

  return (
    <div className={cn("group/carousel relative", className)}>
      <div
        ref={scrollerRef}
        onScroll={updateArrows}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-1 motion-safe:scroll-smooth"
      >
        {children}
      </div>

      {/* Fades de borde: señal de scroll pendiente NO hover-gated (en mobile no
          hay flechas, son LA señal). Van debajo de las flechas (z-10) y solo se
          encienden cuando ese lado tiene contenido por scrollear. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg-base to-transparent transition-opacity duration-200",
          canScrollLeft ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg-base to-transparent transition-opacity duration-200",
          canScrollRight ? "opacity-100" : "opacity-0"
        )}
      />

      <button
        type="button"
        onClick={() => scrollByPage(-1)}
        aria-label="Anterior"
        disabled={!canScrollLeft}
        className={cn(arrowClass, "-left-2", canScrollLeft ? revealClass : "pointer-events-none opacity-0")}
      >
        <ChevronLeft size={18} />
      </button>

      <button
        type="button"
        onClick={() => scrollByPage(1)}
        aria-label="Siguiente"
        disabled={!canScrollRight}
        className={cn(arrowClass, "-right-2", canScrollRight ? revealClass : "pointer-events-none opacity-0")}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
