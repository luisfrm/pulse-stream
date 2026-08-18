import { FullScreenLoader } from "@/components/full-screen-loader";

/**
 * Fallback del grupo protegido: pantalla completa de branding. Cada página
 * interna tiene su propio loading.tsx (skeletons) — este boundary solo aplica
 * en hard loads o en páginas sin boundary más cercano.
 */
export default function ProtectedLoading() {
  return <FullScreenLoader />;
}