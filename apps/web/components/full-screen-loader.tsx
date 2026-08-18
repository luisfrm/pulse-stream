import { BrandLogo } from "@/components/brand-logo";

/** Pantalla completa de branding — entrada al área protegida (post-login/hard load). */
export function FullScreenLoader() {
  return (
    <div
      role="status"
      aria-label="Cargando Pulse Stream"
      className="bg-blooms fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg-base"
    >
      <BrandLogo size={72} className="animate-pulse" />
      <p className="font-display text-2xl font-extrabold tracking-tight">
        Pulse Stream
      </p>
      <p className="text-sm text-text-subdued">Cargando tu música…</p>
    </div>
  );
}