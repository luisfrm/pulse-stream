/**
 * Barrel del paquete UI compartido por `apps/web` y `apps/panel`.
 *
 * Los módulos mantienen sus directivas `"use client"`: la app y el panel
 * importan desde acá sin duplicar componentes ni estilos.
 */
export * from "./components/ui";
export * from "./components/brand-logo";
export * from "./components/auth-background";
export * from "./components/full-screen-loader";
export * from "./components/cover-uploader";
export { default as LogoutButton } from "./components/logout-button";
export * from "./components/pagination";
export * from "./components/search-input";
export { useIsMobile } from "./hooks/use-is-mobile";
export { useDebounce } from "./hooks/use-debounce";

// `cn` ya se re-exporta desde components/ui/utils; el re-export explícito es
// solo para que el paquete documente su utilidad pública principal.
export { cn } from "./components/ui/utils";
