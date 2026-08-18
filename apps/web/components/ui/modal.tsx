"use client";

import * as React from "react";
import {
  Root as DialogRoot,
  Trigger as DialogTrigger,
  Portal as DialogPortal,
  Overlay as DialogOverlay,
  Content as DialogContent,
  Title as DialogTitle,
  Description as DialogDescription,
  Close as DialogClose,
} from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { cn } from "./utils";

/* ─────────────────────────────────────────────
	 Context
───────────────────────────────────────────── */
interface ResponsiveModalContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
}

const ResponsiveModalContext =
  React.createContext<ResponsiveModalContextValue | null>(null);

function useResponsiveModal() {
  const ctx = React.useContext(ResponsiveModalContext);
  if (!ctx) {
    throw new Error("useResponsiveModal must be used within <ResponsiveModal />");
  }
  return ctx;
}

/* ─────────────────────────────────────────────
	 Root
───────────────────────────────────────────── */
interface ResponsiveModalProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function ResponsiveModal({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
}: ResponsiveModalProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isMobile = useIsMobile();

  const isOpen = controlledOpen ?? uncontrolledOpen;
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  return (
    <ResponsiveModalContext.Provider
      value={{ open: isOpen, onOpenChange: handleOpenChange, isMobile }}
    >
      <DialogRoot open={isOpen} onOpenChange={handleOpenChange}>
        {children}
      </DialogRoot>
    </ResponsiveModalContext.Provider>
  );
}

/* ─────────────────────────────────────────────
	 Trigger / Close (re-exports)
───────────────────────────────────────────── */
const ResponsiveModalTrigger = DialogTrigger;
const ResponsiveModalClose = DialogClose;

/* ─────────────────────────────────────────────
	 Content — bottom sheet (mobile) / modal centrado
	 (desktop).
	 Scroll: con el modal abierto la página queda
	 bloqueada (lock de Radix sobre el body) y el
	 contenido scrollea DENTRO del panel (max-h +
	 overflow-y-auto + overscroll-contain): nunca se
	 scrollea la página con el modal abierto.
	 El Content ES el panel: así los data-state de
	 Radix disparan las animaciones de entrada/salida
	 (keyframes sobre `translate`/`scale`, sin chocar
	 con el centrado ni con el drag).
───────────────────────────────────────────── */
const CLOSE_THRESHOLD = 120; // px de arrastre para cerrar (mobile)

interface ResponsiveModalContentProps {
  /** Icono a la izquierda del título (header). */
  icon?: React.ReactNode;
  /** Título del modal/sheet. */
  title?: React.ReactNode;
  /** Subtítulo opcional bajo el título. */
  subtitle?: React.ReactNode;
  /** Contenido (scrolleable dentro del panel). */
  children: React.ReactNode;
  className?: string;
  /** Clases extra para el body scrolleable. */
  contentClassName?: string;
  /** Footer opcional (fijo, debajo del body). */
  footer?: React.ReactNode;
  /** Ancho máximo del modal en desktop (clase Tailwind, ej. "max-w-lg"). */
  desktopMaxWidth?: string;
}

function ResponsiveModalContent({
  icon,
  title,
  subtitle,
  children,
  className,
  contentClassName,
  footer,
  desktopMaxWidth = "max-w-lg",
}: ResponsiveModalContentProps) {
  const { isMobile, onOpenChange } = useResponsiveModal();

  /* ── drag-to-close state (mobile only) ── */
  const dragStartY = React.useRef<number | null>(null);
  const [dragDelta, setDragDelta] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);

  function onPointerDown(e: React.PointerEvent) {
    if (!isMobile) return;
    dragStartY.current = e.clientY;
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDragging || dragStartY.current === null) return;
    const delta = Math.max(0, e.clientY - dragStartY.current);
    setDragDelta(delta);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!isDragging) return;
    setIsDragging(false);
    // Se calcula desde la posición guardada (no del estado, que puede estar
    // stale si el release llega antes del último re-render del move).
    if (dragStartY.current !== null) {
      const delta = Math.max(0, e.clientY - dragStartY.current);
      if (delta >= CLOSE_THRESHOLD) {
        onOpenChange(false);
      }
    }
    setDragDelta(0);
    dragStartY.current = null;
  }

  const bodyClass = cn(
    "flex-1 overflow-y-auto overscroll-contain px-5",
    contentClassName
  );

  /* ─────────────── MOBILE: Bottom Sheet ─────────────── */
  if (isMobile) {
    return (
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm motion-safe:data-[state=open]:animate-fade-in motion-safe:data-[state=closed]:animate-fade-out" />

        <DialogContent
          style={{
            transform: dragDelta > 0 ? `translateY(${dragDelta}px)` : undefined,
            // Snap-back suave al soltar sin llegar al umbral. Los keyframes
            // de open/close animan `translate` (propiedad separada), así que
            // esta transición no interfiere con ellos.
            transition: isDragging ? "none" : "transform 0.2s ease-out",
            opacity: dragDelta > 0 ? 1 - dragDelta / 300 : undefined,
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[90svh] w-full flex-col overflow-hidden rounded-t-2xl border border-bg-highlight bg-bg-elevated shadow-2xl",
            "motion-safe:data-[state=open]:animate-sheet-in motion-safe:data-[state=closed]:animate-sheet-out",
            className
          )}
        >
          {/* Handle de arrastre */}
          <div
            className="flex shrink-0 touch-none cursor-grab pt-3 active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onLostPointerCapture={onPointerUp}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-bg-highlight" />
          </div>

          <ModalHeader icon={icon} title={title} subtitle={subtitle} />

          {/* Body — scrolleable DENTRO del panel */}
          <div className={cn(bodyClass, "pb-6")}>{children}</div>

          {footer && (
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-bg-highlight bg-bg-highlight/50 px-5 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </DialogContent>
      </DialogPortal>
    );
  }

  /* ─────────────── DESKTOP: Modal centrado ─────────────── */
  return (
    <DialogPortal>
      <DialogOverlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm motion-safe:data-[state=open]:animate-fade-in motion-safe:data-[state=closed]:animate-fade-out" />

      <DialogContent
        className={cn(
          // Centering (las utilidades `-translate-*` usan la propiedad
          // `translate`; los keyframes animan esa misma propiedad y quedan
          // fijos en -50%/-50% al terminar)
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "flex max-h-[85svh] w-full flex-col overflow-hidden rounded-2xl border border-bg-highlight bg-bg-elevated shadow-2xl",
          "motion-safe:data-[state=open]:animate-modal-in motion-safe:data-[state=closed]:animate-modal-out",
          desktopMaxWidth,
          className
        )}
      >
        <ModalHeader icon={icon} title={title} subtitle={subtitle} />

        {/* Body — scrolleable DENTRO del panel */}
        <div className={cn(bodyClass, "py-4")}>{children}</div>

        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-bg-highlight bg-bg-highlight/50 px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </DialogContent>
    </DialogPortal>
  );
}

/* ─────────────────────────────────────────────
	 Header compartido
───────────────────────────────────────────── */
interface ModalHeaderProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
}

function ModalHeader({ icon, title, subtitle }: ModalHeaderProps) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-bg-highlight px-5 py-4">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="shrink-0 text-text-subdued">{icon}</span>}
        <div className="min-w-0">
          {title && (
            <DialogTitle className="font-display truncate text-lg font-bold leading-tight">
              {title}
            </DialogTitle>
          )}
          {subtitle && (
            <DialogDescription asChild>
              <p className="mt-0.5 text-sm leading-snug text-text-subdued">
                {subtitle}
              </p>
            </DialogDescription>
          )}
        </div>
      </div>

      <DialogClose
        aria-label="Cerrar"
        className="shrink-0 rounded-pill p-1.5 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
      >
        <X size={18} />
      </DialogClose>
    </div>
  );
}

/* ─────────────────────────────────────────────
	 Modal — API simple, mismo contrato que el viejo
	 Dialog (open/onClose/title/description), ahora con
	 comportamiento responsive + scroll interno.
───────────────────────────────────────────── */
const MODAL_SIZES = {
  sm: "max-w-sm", // 384px
  md: "max-w-lg", // 512px
  lg: "max-w-xl", // 576px
  xl: "max-w-3xl", // 768px
  "2xl": "max-w-5xl", // 1024px
  full: "max-w-[95vw]",
} as const;

export type ModalSize = keyof typeof MODAL_SIZES;

interface ModalProps {
  /** Control programático del estado abierto. */
  open: boolean;
  /** Se llama al querer cerrar (ESC, click fuera, X, drag). */
  onClose: () => void;
  /** Título mostrado en el header. */
  title?: React.ReactNode;
  /** Descripción opcional bajo el título. */
  description?: React.ReactNode;
  /** Contenido (scrolleable dentro del panel). */
  children: React.ReactNode;
  /** Footer opcional (fijo bajo el contenido). */
  footer?: React.ReactNode;
  /** Clases extra del panel. */
  className?: string;
  /** Clases extra del body scrolleable. */
  contentClassName?: string;
  /** Tamaño del modal en desktop. @default "md" */
  size?: ModalSize;
  /** Icono a la izquierda del título. */
  icon?: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  size = "md",
  icon,
}: Readonly<ModalProps>) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <ResponsiveModalContent
        icon={icon}
        title={title}
        subtitle={description}
        className={className}
        contentClassName={contentClassName}
        footer={footer}
        desktopMaxWidth={MODAL_SIZES[size]}
      >
        {children}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

/* ─────────────────────────────────────────────
	 Exports
───────────────────────────────────────────── */
export {
  ResponsiveModal,
  ResponsiveModalTrigger,
  ResponsiveModalClose,
  ResponsiveModalContent,
};