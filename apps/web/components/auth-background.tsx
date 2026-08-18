/**
 * Fondo "Smoked Emerald" para las páginas de autenticación (login/register).
 * Gradiente esmeralda adaptado a los tokens del @theme (atmospheric / dark):
 * cada capa usa var(--color-brand-*) + color-mix, sin valores sueltos.
 * Orden de capas: base → treatment (rayas difuminadas, con pan lento) → glow
 * (breathe) → particles → halftone → vignette → noise.
 * El movimiento se desactiva con prefers-reduced-motion (bloque en globals.css).
 */
const BASE_GRADIENT =
  "linear-gradient(128deg, var(--color-brand-200) 0%, var(--color-brand-400) 17%, var(--color-brand-600) 38%, var(--color-brand-900) 54%, var(--color-bg-highlight) 83%, var(--color-bg-base) 100%)";

const TREATMENT_STRIPES =
  "repeating-linear-gradient(107deg, " +
  "color-mix(in oklch, var(--color-text-primary) 10%, transparent) 0 3%, " +
  "color-mix(in oklch, var(--color-bg-base) 45%, transparent) 6% 11%, " +
  "color-mix(in oklch, var(--color-brand-400) 30%, transparent) 14%, " +
  "transparent 18% 23%)";

const GLOW_GRADIENTS =
  "radial-gradient(ellipse at 40% 3%, color-mix(in oklch, var(--color-text-primary) 22%, transparent), transparent 38%), " +
  "radial-gradient(ellipse at 35% 37%, color-mix(in oklch, var(--color-brand-600) 31%, transparent), transparent 42%)";

const VIGNETTE_GRADIENTS =
  "radial-gradient(circle at center, transparent 25%, color-mix(in oklch, var(--color-bg-base) 25%, transparent) 58%, color-mix(in oklch, var(--color-bg-base) 90%, transparent) 100%), " +
  "linear-gradient(to bottom, transparent 45%, color-mix(in oklch, var(--color-bg-base) 80%, transparent) 100%)";

const NOISE_SVG =
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'180\' height=\'180\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")';

const PARTICLES = [
  [69, 40, 0.14],
  [24, 44, 0.3],
  [74, 68, 0.23],
  [65, 77, 0.29],
  [8, 30, 0.1],
  [16, 53, 0.13],
  [65, 23, 0.17],
  [23, 40, 0.16],
  [44, 67, 0.21],
  [90, 67, 0.34],
  [10, 90, 0.29],
  [53, 42, 0.37],
  [53, 12, 0.34],
  [55, 68, 0.36],
] as const;

const PARTICLES_GRADIENT = PARTICLES.map(
  ([x, y, a]) =>
    `radial-gradient(circle at ${x}% ${y}%, color-mix(in oklch, var(--color-text-primary) ${a * 100}%, transparent) 0, transparent ${x % 3 === 0 ? 1 : 2}px)`,
).join(", ");

const HALFTONE_GRADIENT =
  "radial-gradient(circle at 25% 25%, color-mix(in oklch, var(--color-bg-base) 12%, transparent) 1px, transparent 1px), " +
  "radial-gradient(circle at 75% 75%, color-mix(in oklch, var(--color-bg-base) 9%, transparent) 1px, transparent 1px)";

export function AuthBackground() {
  return (
    <div aria-hidden className="absolute inset-0 isolate overflow-hidden">
      <div className="absolute inset-0" style={{ background: BASE_GRADIENT }} />
      <div
        className="animate-aurora-pan absolute inset-[-10%_-14%_20%]"
        style={{
          backgroundImage: TREATMENT_STRIPES,
          filter: "blur(34px)",
          opacity: 0.58,
          maskImage: "linear-gradient(to bottom, #000 0 58%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0 58%, transparent 100%)",
        }}
      />
      <div
        className="animate-aurora-breathe absolute inset-0"
        style={{ background: GLOW_GRADIENTS }}
      />
      <div className="absolute inset-0" style={{ background: PARTICLES_GRADIENT }} />
      <div
        className="absolute inset-0"
        style={{
          background: HALFTONE_GRADIENT,
          backgroundSize: "8px 8px",
          mixBlendMode: "overlay",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: VIGNETTE_GRADIENTS }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: NOISE_SVG,
          backgroundSize: "180px 180px",
          mixBlendMode: "soft-light",
          opacity: 0.24,
        }}
      />
    </div>
  );
}